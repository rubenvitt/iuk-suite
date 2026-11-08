/**
 * DIE GERÄTEWARTUNG IM MCP-SERVER DER SUITE (IDA-367). Jede Person sieht nur die Werkzeuge ihrer Stufe, und jedes
 * Werkzeug prüft beim Aufruf noch einmal mit demselben Riegel wie die App (`aktionFuer`) — geschrieben wird über
 * dieselben Vorgänge wie die Server Actions (`_lib/vorgaenge.ts`), gelesen über dieselben Lesepfade wie die Seiten
 * mit demselben Gruppenfilter. So kann der MCP-Server nichts, was die Person in der App nicht auch kann.
 *
 * Unterlagen gehen nur dazu (`wartung_unterlage_hochladen`, von einer Adresse oder als Base64); löschen und
 * sortieren bleibt in der App. Nicht dabei: Fotos, Etiketten drucken.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { alsViewer, antwortFehler, antwortJson, mitRiegel, type McpModul } from "@/app/m/mcp/_lib/modul";
import { getDb } from "../_db/client";
import { gruppenAuswahl } from "../_lib/ansicht";
import {
  faelligeFristen, ladeArten, ladeGeraet, ladeGeraete, ladeGruppen, ladeInhalt, ladeMaengel, ladePruefarten, ladeUnterlagen, ladeVerlauf,
} from "../_lib/daten";
import { ART_IKONEN, artEingabe, idSchema, pruefartEingabe, NAME_MAX, NOTIZ_MAX, KURZ_MAX, SOLL_MAX, STUNDEN_MAX, PUNKT_MAX } from "../_lib/eingabe";
import { heute, tagInZone } from "../_lib/heute";
import { inhaltStand } from "../_lib/schreiben";
import { ladeVonAdresse } from "../_lib/abruf";
import { ladeAmGeraet, type AmGeraet } from "../_lib/telefon";
import { unterwegsStand } from "../_lib/unterwegs";
import { UNTERLAGE_MAX_BYTES } from "../_lib/unterlagen";
import type { EintragDTO, Ergebnis, GeraetZeile, GruppeDTO, MangelDTO } from "../_lib/typen";
import {
  anlassVermerkenVorgang, artLoeschenVorgang, artSpeichernVorgang, erledigtEintragenVorgang, geraetAendernVorgang, geraetAktivVorgang,
  geraetAnlegenVorgang, geraetLoeschenVorgang, gruppeLoeschenVorgang, gruppeSpeichernVorgang, inhaltSpeichernVorgang, mangelBehebenVorgang,
  mangelMeldenVorgang, pruefartLoeschenVorgang, pruefartSpeichernVorgang, pruefplanSpeichernVorgang, pruefungOhneFotosVorgang,
  stundenEintragenVorgang, unterlageHochladenVorgang,
} from "../_lib/vorgaenge";
import {
  aktionFuer, hatWartungZugang, istVerwalter, reichtFuer, rechteAus, verwaltetGruppe, type Rechte, type Stufe,
} from "../_lib/zugang";

type Viewer = ReturnType<typeof alsViewer>;

function ergebnis(r: Ergebnis, mehr?: Record<string, unknown>): CallToolResult {
  return r.ok ? antwortJson({ ok: true, ...(r.id ? { id: r.id } : {}), ...mehr }) : antwortFehler(r.fehler, r.feldFehler);
}

/** Die Geräteliste, wie die Seite „Geräte“ sie zeigt: Verwalter sehen ihre Gruppen, alle anderen alles. */
function sichtbareGeraete(rechte: Rechte, gruppeId: string | undefined): GeraetZeile[] {
  const db = getDb();
  const auswahl = gruppenAuswahl(rechte, ladeGruppen(db), gruppeId);
  return ladeGeraete(db, { gruppen: istVerwalter(rechte) ? auswahl.gruppen : null, heute: heute() });
}

function kurz(g: GeraetZeile) {
  return {
    id: g.id, name: g.name, art: g.artEinzahl, artId: g.artId, gruppe: g.gruppeName, gruppeId: g.gruppeId,
    hersteller: g.hersteller, typ: g.typ, seriennr: g.seriennr, ortArt: g.ortArt, ort: g.ort, stunden: g.stunden,
    materialkiste: g.kiste, aktiv: g.aktiv, zustand: g.zustand, offeneMaengel: g.offeneMaengel, fehlend: g.fehlend,
    naechsteFrist: g.naechste, unterwegs: g.unterwegs,
  };
}

/** Was aus der Kiste unterwegs ist, ohne `wer`/`nutzer` (Grundregel unten); `seit` als Tag in der Suite-Zone. */
function unterwegsOhnePerson(geraetId: string) {
  const u = unterwegsStand(getDb(), geraetId);
  return {
    liste: u.entnahmen.map((e) => ({
      ganz: e.ganz, seit: tagInZone(e.seit), zweck: e.zweck,
      positionen: e.positionen.map((p) => ({ inhalt_id: p.inhaltId, text: p.text, offen: p.offen })),
    })),
    je: (inhaltId: string) => u.jePosition.get(inhaltId) ?? 0,
  };
}

/**
 * Die Prüfungen, die man selbst am Gerät erledigt (IDA-369), je mit ihren Punkten: nach Frist, vor der Verwendung
 * (`anlass: einsatz`) oder nach der Benutzung (`anlass: rueckkehr`). `faellig` heißt: diese ist jetzt dran.
 */
/** Alle Punkte der Checkliste der Art (bei einer Materialkiste die Inhaltsliste), ohne Auswahl einer Prüfung. */
function allePunkte(am: AmGeraet | null) {
  if (!am) return [];
  return am.g.kiste ? am.checkliste : ladeArten(getDb()).find((a) => a.id === am.g.artId)?.checkliste ?? [];
}

function pruefungenAmGeraet(am: AmGeraet | null) {
  if (!am) return [];
  const tag = heute();
  return am.g.staende.filter((f) => f.vorlage.wer === "intern").map((f) => ({
    pruefartId: f.vorlage.id, name: f.vorlage.name, anlass: f.vorlage.anlass, stand: f.text, stufe: f.stufe,
    faellig: f.stufe === "ueberfaellig" || (f.faelligAm !== null && f.faelligAm <= tag),
    punkte: am.g.kiste ? am.checkliste.map((p) => p.id) : ladeAmGeraet(getDb(), am.g.id, tag, f.vorlage.id)?.checkliste.map((p) => p.id) ?? [],
  }));
}

// ---------------------------------------------------------------- ohne Personenbezug
// Grundregel (Ruben, 2026-11-06): Der MCP-Server gibt keine personenbezogenen Daten heraus und überträgt keine
// Rechte. Ausgaben nennen deshalb nur die Felder unten (Liste der erlaubten, nicht der verbotenen Felder), also weder
// wer geprüft, gemeldet oder behoben hat noch wer eine Gruppe verwaltet. Die angemeldete Person steht weiter im
// Audit-Log und an ihren Einträgen in der App — sie wird nur nicht an den Assistenten zurückgegeben.

function eintragOhnePerson(e: EintragDTO) {
  return {
    id: e.id, geraetId: e.geraetId, geraetName: e.geraetName, typ: e.typ, titel: e.titel, am: e.am, stunden: e.stunden,
    notiz: e.notiz, ergebnis: e.ergebnis, antworten: e.antworten, maengel: e.maengel,
  };
}

function mangelOhnePerson(m: MangelDTO) {
  return {
    id: m.id, geraetId: m.geraetId, geraetName: m.geraetName, ort: m.ort, gruppeName: m.gruppeName, text: m.text,
    foto: m.foto, einsatzbereit: m.einsatzbereit, gemeldetAm: m.gemeldetAm, behobenAm: m.behobenAm,
  };
}

function gruppeOhnePersonen(g: GruppeDTO) {
  return { id: g.id, name: g.name, geraete: g.geraete };
}

const LESEN = { readOnlyHint: true, openWorldHint: false } as const;
const SCHREIBEN = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const ENTFERNEN = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;

const geraetId = idSchema.describe("Kennung des Geräts (aus wartung_geraete)");
const gruppeFilter = idSchema.optional().describe("Nur diese eigene Gruppe; ohne Angabe alle eigenen");
const stunden = z.number().int().min(0).max(STUNDEN_MAX);

const geraetFelder = {
  gruppe_id: idSchema.describe("Gruppe, der das Gerät gehört (aus wartung_gruppen)"),
  art_id: idSchema.describe("Geräteart (aus wartung_arten)"),
  name: z.string().max(NAME_MAX).describe("Bezeichnung, z. B. „Stromerzeuger 1“"),
  hersteller: z.string().max(KURZ_MAX).optional(),
  typ: z.string().max(KURZ_MAX).optional(),
  seriennr: z.string().max(KURZ_MAX).optional(),
  ort_art: z.enum(["lager", "fahrzeug"]),
  ort: z.string().max(NAME_MAX).describe("Standort im Lager oder Name des Fahrzeugs"),
  fahrzeug_id: z.string().max(100).nullable().optional().describe("Fahrzeug der Fahrzeugverwaltung, falls ort_art = fahrzeug"),
  stunden: stunden.nullable().optional().describe("Aktueller Betriebsstundenstand"),
  hinweise: z.string().max(NOTIZ_MAX).optional().describe("Hinweise für den Steckbrief am QR-Code"),
  pruefanleitung: z.string().max(NOTIZ_MAX).optional().describe("Anleitung zum Prüfen dieses Geräts, wird bei der Prüfung angezeigt"),
};

export const wartungMcp: McpModul = {
  key: "wartung",
  registriere(server: McpServer, person) {
    const viewer: Viewer = alsViewer(person);
    if (!hatWartungZugang(viewer.groups)) return;
    const db = getDb();
    const rechte = rechteAus(db, viewer.groups, viewer.id);
    const darf = (stufe: Stufe) => reichtFuer(rechte, stufe);
    /** Riegel beim Aufruf: Rechte können sich seit dem Auflisten geändert haben. */
    const mit = (stufe: Stufe, arbeit: (z: { viewer: Viewer; rechte: Rechte }) => Promise<CallToolResult> | CallToolResult) =>
      mitRiegel(() => arbeit(aktionFuer(viewer, stufe)));

    // ------------------------------------------------------------ jeder mit Modulzugang

    server.registerTool("wartung_geraete", {
      title: "Geräte auflisten",
      description: "Listet die Geräte der Gerätewartung mit Zustand, nächster Frist und offenen Mängeln. Verwalter sehen ihre Gruppen, alle anderen alle Geräte.",
      inputSchema: { gruppe_id: gruppeFilter, suche: z.string().max(80).optional().describe("Teil von Name, Ort, Typ oder Seriennummer") },
      annotations: LESEN,
    }, ({ gruppe_id, suche }) => mit("zugang", ({ rechte }) => {
      const q = suche?.trim().toLocaleLowerCase("de");
      const zeilen = sichtbareGeraete(rechte, gruppe_id)
        .filter((g) => !q || [g.name, g.ort, g.typ, g.seriennr, g.hersteller].some((t) => t.toLocaleLowerCase("de").includes(q)));
      return antwortJson(zeilen.map(kurz));
    }));

    server.registerTool("wartung_faellig", {
      title: "Was steht an",
      description: "Fällige und überfällige Fristen (Prüfung, Wartung, Elektroprüfung) der sichtbaren Geräte, überfällige zuerst.",
      inputSchema: { gruppe_id: gruppeFilter },
      annotations: LESEN,
    }, ({ gruppe_id }) => mit("zugang", ({ rechte }) => antwortJson(faelligeFristen(sichtbareGeraete(rechte, gruppe_id)))));

    server.registerTool("wartung_geraet", {
      title: "Gerät ansehen",
      description: "Ein Gerät mit Checkliste (bei einer Materialkiste die Inhaltsliste, dazu was gerade unterwegs ist), Prüfanleitung, offenen Mängeln und Unterlagen. Hat es mehrere Prüfungen am Gerät (nach Frist, vor der Verwendung, nach der Benutzung), steht unter pruefungen je Prüfart, welche Punkte dazugehören; checkliste sind die Punkte der Prüfung, die wartung_pruefung_abschliessen ohne pruefart_id abschließt, alle_punkte die ganze Checkliste. Verwalter seiner Gruppe bekommen zusätzlich den Verlauf.",
      inputSchema: { geraet_id: geraetId },
      annotations: LESEN,
    }, ({ geraet_id }) => mit("zugang", ({ rechte }) => {
      const tag = heute();
      const uw = unterwegsOhnePerson(geraet_id);
      const mitUnterwegs = <T extends { id: string }>(punkte: T[]) => punkte.map((p) => ({ ...p, unterwegs: uw.je(p.id) }));
      const eigen = ladeGeraet(getDb(), geraet_id, tag);
      if (eigen && verwaltetGruppe(rechte, eigen.gruppeId)) {
        const am = ladeAmGeraet(getDb(), geraet_id, tag);
        return antwortJson({
          geraet: eigen,
          checkliste: eigen.kiste ? mitUnterwegs(am?.checkliste ?? []) : am?.checkliste ?? [],
          alle_punkte: eigen.kiste ? mitUnterwegs(allePunkte(am)) : allePunkte(am),
          pruefungen: pruefungenAmGeraet(am),
          inhalt: eigen.kiste ? mitUnterwegs(ladeInhalt(getDb(), geraet_id)) : undefined,
          unterwegs: uw.liste,
          inhaltStand: eigen.kiste ? inhaltStand(ladeInhalt(getDb(), geraet_id)) : undefined,
          offeneMaengel: ladeMaengel(getDb(), { gruppen: null, geraetId: geraet_id, offen: true }).map(mangelOhnePerson),
          verlauf: ladeVerlauf(getDb(), { gruppen: null, geraetId: geraet_id, grenze: 50 }).map(eintragOhnePerson),
          unterlagen: ladeUnterlagen(getDb(), geraet_id).map((u) => u.titel),
        });
      }
      // Wie am QR-Code: aktive Geräte, ohne Verlauf.
      const am = ladeAmGeraet(getDb(), geraet_id, tag);
      if (!am) return antwortFehler("Dieses Gerät gibt es nicht (mehr).");
      return antwortJson({
        geraet: am.g, checkliste: am.g.kiste ? mitUnterwegs(am.checkliste) : am.checkliste,
        alle_punkte: am.g.kiste ? mitUnterwegs(allePunkte(am)) : allePunkte(am), pruefungen: pruefungenAmGeraet(am),
        unterwegs: uw.liste, offeneMaengel: am.offen, unterlagen: am.unterlagen.map((u) => u.titel),
        inhaltStand: am.g.kiste ? inhaltStand(ladeInhalt(getDb(), geraet_id)) : undefined,
      });
    }));

    server.registerTool("wartung_stunden_eintragen", {
      title: "Betriebsstunden eintragen",
      description: "Trägt den abgelesenen Betriebsstundenstand eines Geräts ein. Der Stand darf nicht kleiner sein als der letzte.",
      inputSchema: { geraet_id: geraetId, stunden },
      annotations: SCHREIBEN,
    }, ({ geraet_id, stunden: h }) => mit("zugang", async (z) =>
      ergebnis(await stundenEintragenVorgang(z, geraet_id, { stunden: h, sendung: randomUUID() }))));

    server.registerTool("wartung_pruefung_abschliessen", {
      title: "Prüfung am Gerät abschließen",
      description: "Schließt eine Prüfung am Gerät ab (bei einer Materialkiste das Durchzählen). Vorher wartung_geraet lesen: pruefart_id wählt unter pruefungen (ohne Angabe die fällige, sonst die nach Frist); jeder ihrer Punkte braucht eine Antwort; ein Punkt mit Mangel braucht einen Text und wird ein Mangel. Ergebnis: ok (in Ordnung), mangel (mit Mangel einsatzbereit) oder defekt (nicht einsatzbereit). Ohne Fotos.",
      inputSchema: {
        geraet_id: geraetId,
        pruefart_id: idSchema.optional().describe("Welche Prüfung (pruefungen[].pruefartId aus wartung_geraet)"),
        antworten: z.array(z.object({
          punkt_id: idSchema.describe("Kennung des Checklistenpunkts bzw. der Position"),
          ok: z.boolean().describe("true = in Ordnung bzw. vollständig"),
          text: z.string().max(NOTIZ_MAX).optional().describe("Was los ist, Pflicht bei ok = false (außer Materialkiste)"),
          unterwegs: z.number().int().min(0).max(SOLL_MAX).optional().describe("bei Kisten: wie viele laut wartung_geraet gerade unterwegs sind"),
        })).max(40),
        ergebnis: z.enum(["ok", "mangel", "defekt"]),
        stunden: stunden.nullable().optional().describe("Abgelesener Stand; Pflicht bei Geräten mit Betriebsstunden"),
        notiz: z.string().max(NOTIZ_MAX).optional(),
        inhalt_stand: z.string().optional().describe("Nur Materialkiste, Pflicht: inhaltStand aus wartung_geraet"),
      },
      annotations: SCHREIBEN,
    }, (a) => mit("zugang", async (z) => {
      // Bei einer Materialkiste zählt nur, was gegen die gelesene Liste gezählt wurde: Hat sie sich seitdem geändert,
      // gilt die Zählung nicht (wie am Telefon). Menge, Wortlaut und Bemerkung kommen dann aus genau diesem Stand.
      const am = ladeAmGeraet(getDb(), a.geraet_id, heute(), a.pruefart_id);
      if (am?.g.kiste && a.inhalt_stand !== inhaltStand(ladeInhalt(getDb(), a.geraet_id))) {
        return antwortFehler("Die Inhaltsliste hat sich geändert. Bitte mit wartung_geraet neu lesen und neu durchzählen.");
      }
      const punkte = new Map((am?.checkliste ?? []).map((p) => [p.id, p]));
      // Ohne pruefart_id gilt die Prüfung, die jetzt dran ist. Hat sich das seit dem Lesen geändert (ein Anlass kam
      // dazu), passen die Antworten nicht mehr: ablehnen statt sie einer anderen Checkliste zuzuschlagen.
      if (am && !am.g.kiste && a.antworten.some((x) => !punkte.has(x.punkt_id))) {
        return antwortFehler(`Die Antworten passen nicht zur Prüfung „${am.pruefung?.vorlage.name ?? "am Gerät"}“. Bitte mit wartung_geraet neu lesen und pruefart_id angeben.`);
      }
      const pruefartId = a.pruefart_id ?? am?.pruefung?.vorlage.id;
      const antworten = a.antworten.map((x) => {
        const p = punkte.get(x.punkt_id);
        return {
          punktId: x.punkt_id, ok: x.ok, text: x.text ?? "", ...(x.unterwegs !== undefined ? { unterwegs: x.unterwegs } : {}),
          ...(p?.soll !== undefined ? { soll: p.soll, punkt: p.text, hinweis: p.hinweis } : {}),
        };
      });
      return ergebnis(await pruefungOhneFotosVorgang(z, a.geraet_id, {
        sendung: randomUUID(), ...(pruefartId ? { pruefartId } : {}),
        stunden: a.stunden ?? null, antworten, ergebnis: a.ergebnis, notiz: a.notiz ?? "",
      }));
    }));

    server.registerTool("wartung_einsatz_vermerken", {
      title: "Eingesetzt oder zurück",
      description: "Vermerkt, dass ein Gerät eingesetzt wird (anlass einsatz) oder vom Einsatz zurück ist (anlass rueckkehr). Danach ist seine Prüfung vor der Verwendung bzw. nach der Benutzung fällig, bis sie abgeschlossen ist. Steht das Gerät schon so da, ändert sich nichts. Nur für Geräte: eine Materialkiste wird in der App entnommen und zurückgelegt, das vermerkt beides selbst.",
      inputSchema: { geraet_id: geraetId, anlass: z.enum(["einsatz", "rueckkehr"]) },
      annotations: SCHREIBEN,
    }, ({ geraet_id, anlass }) => mit("zugang", async (z) => ergebnis(await anlassVermerkenVorgang(z, geraet_id, anlass))));

    server.registerTool("wartung_mangel_melden", {
      title: "Mangel melden",
      description: "Meldet einen Mangel an einem Gerät. Ohne Foto.",
      inputSchema: {
        geraet_id: geraetId,
        text: z.string().max(NOTIZ_MAX).describe("Was los ist"),
        einsatzbereit: z.boolean().describe("Ist das Gerät trotzdem einsatzbereit?"),
      },
      annotations: SCHREIBEN,
    }, ({ geraet_id, text, einsatzbereit }) => mit("zugang", async (z) =>
      ergebnis(await mangelMeldenVorgang(z, geraet_id, { text, einsatzbereit }))));

    if (!darf("verwalter")) return;

    // ------------------------------------------------------------ Verwalter einer Gruppe und Admins

    server.registerTool("wartung_gruppen", {
      title: "Gruppen",
      description: "Die Gruppen, die du verwaltest (Admins: alle), mit Anzahl der Geräte.",
      inputSchema: {},
      annotations: LESEN,
    }, () => mit("verwalter", ({ rechte }) => antwortJson(ladeGruppen(getDb()).filter((g) => verwaltetGruppe(rechte, g.id)).map(gruppeOhnePersonen))));

    server.registerTool("wartung_arten", {
      title: "Gerätearten",
      description: "Alle Gerätearten mit den Kennungen ihrer Prüfarten (siehe wartung_pruefarten) und Checkliste.",
      inputSchema: {},
      annotations: LESEN,
    }, () => mit("verwalter", () => antwortJson(ladeArten(getDb()))));

    server.registerTool("wartung_pruefarten", {
      title: "Prüfarten",
      description: "Der Katalog der Prüfarten (wer prüft, alle wie viele Monate oder Betriebsstunden, oder anlass: einsatz = vor jeder Verwendung, rueckkehr = nach jeder Benutzung), mit den Gerätearten, die sie zuschalten, und der Zahl der Geräte, an denen sie gilt.",
      inputSchema: {},
      annotations: LESEN,
    }, () => mit("verwalter", () => antwortJson(ladePruefarten(getDb()))));

    server.registerTool("wartung_maengel", {
      title: "Mängel",
      description: "Mängel der Geräte deiner Gruppen: offene (Standard) oder die zuletzt behobenen.",
      inputSchema: { gruppe_id: gruppeFilter, behobene: z.boolean().optional().describe("true = die letzten 30 behobenen") },
      annotations: LESEN,
    }, ({ gruppe_id, behobene }) => mit("verwalter", ({ rechte }) => {
      const auswahl = gruppenAuswahl(rechte, ladeGruppen(getDb()), gruppe_id);
      return antwortJson(ladeMaengel(getDb(), { gruppen: auswahl.gruppen, offen: !behobene, ...(behobene ? { grenze: 30 } : {}) }).map(mangelOhnePerson));
    }));

    server.registerTool("wartung_pruefungen", {
      title: "Prüfungen und Wartungen",
      description: "Erledigte Prüfungen und eingetragene Wartungen der Geräte deiner Gruppen, neueste zuerst.",
      inputSchema: { gruppe_id: gruppeFilter, grenze: z.number().int().min(1).max(500).optional() },
      annotations: LESEN,
    }, ({ gruppe_id, grenze }) => mit("verwalter", ({ rechte }) => {
      const auswahl = gruppenAuswahl(rechte, ladeGruppen(getDb()), gruppe_id);
      return antwortJson(ladeVerlauf(getDb(), { gruppen: auswahl.gruppen, nurFristen: true, grenze: grenze ?? 100 }).map(eintragOhnePerson));
    }));

    server.registerTool("wartung_geraet_anlegen", {
      title: "Gerät anlegen",
      description: "Legt ein Gerät in einer Gruppe an, die du verwaltest.",
      inputSchema: geraetFelder,
      annotations: SCHREIBEN,
    }, (a) => mit("verwalter", async (z) => ergebnis(await geraetAnlegenVorgang(z, {
      gruppeId: a.gruppe_id, artId: a.art_id, name: a.name, hersteller: a.hersteller ?? "", typ: a.typ ?? "",
      seriennr: a.seriennr ?? "", ortArt: a.ort_art, ort: a.ort, fahrzeugId: a.fahrzeug_id ?? null,
      stunden: a.stunden ?? null, hinweise: a.hinweise ?? "", pruefanleitung: a.pruefanleitung ?? "",
    }))));

    server.registerTool("wartung_geraet_aendern", {
      title: "Gerät ändern",
      description: "Ändert die Stammdaten eines Geräts deiner Gruppe. Nur die angegebenen Felder ändern sich.",
      inputSchema: { geraet_id: geraetId, ...Object.fromEntries(Object.entries(geraetFelder).map(([k, v]) => [k, v.optional()])) as {
        [K in keyof typeof geraetFelder]: z.ZodOptional<(typeof geraetFelder)[K]>
      } },
      annotations: SCHREIBEN,
    }, (a) => mit("verwalter", async (z) => {
      const alt = ladeGeraet(getDb(), a.geraet_id, heute());
      if (!alt) return antwortFehler("Dieses Gerät gibt es nicht mehr.");
      return ergebnis(await geraetAendernVorgang(z, a.geraet_id, {
        gruppeId: a.gruppe_id ?? alt.gruppeId, artId: a.art_id ?? alt.artId, name: a.name ?? alt.name,
        hersteller: a.hersteller ?? alt.hersteller, typ: a.typ ?? alt.typ, seriennr: a.seriennr ?? alt.seriennr,
        ortArt: a.ort_art ?? alt.ortArt, ort: a.ort ?? alt.ort,
        fahrzeugId: a.fahrzeug_id !== undefined ? a.fahrzeug_id : a.ort_art === "lager" ? null : alt.fahrzeugId,
        stunden: a.stunden !== undefined ? a.stunden : alt.stunden, hinweise: a.hinweise ?? alt.hinweise, pruefanleitung: a.pruefanleitung ?? alt.pruefanleitung,
      }));
    }));

    server.registerTool("wartung_geraet_ausmustern", {
      title: "Gerät ausmustern oder zurückholen",
      description: "Mustert ein Gerät deiner Gruppe aus (es verschwindet aus Listen und Fristen) oder holt es mit zurueckholen = true zurück.",
      inputSchema: { geraet_id: geraetId, zurueckholen: z.boolean().optional() },
      annotations: SCHREIBEN,
    }, ({ geraet_id, zurueckholen }) => mit("verwalter", async (z) =>
      ergebnis(await geraetAktivVorgang(z, geraet_id, zurueckholen === true))));

    server.registerTool("wartung_geraet_loeschen", {
      title: "Ausgemusterte Akte löschen",
      description: "Löscht eine ausgemusterte Akte ohne Verlauf endgültig, samt Inhalt und Unterlagen. Mit Verlauf bleibt sie ausgemustert.",
      inputSchema: { geraet_id: geraetId },
      annotations: ENTFERNEN,
    }, ({ geraet_id }) => mit("verwalter", async (z) => ergebnis(await geraetLoeschenVorgang(z, geraet_id))));

    server.registerTool("wartung_erledigt_eintragen", {
      title: "Wartung eintragen",
      description: "Trägt eine erledigte Prüfung ein, etwa die Wartung durch die Fachfirma oder die Elektroprüfung. Die pruefart_id kommt aus dem Prüfplan in wartung_geraet und muss am Gerät gelten.",
      inputSchema: {
        geraet_id: geraetId,
        pruefart_id: idSchema,
        am: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Datum JJJJ-MM-TT"),
        stunden: stunden.nullable().optional(),
        notiz: z.string().max(NOTIZ_MAX).optional(),
      },
      annotations: SCHREIBEN,
    }, (a) => mit("verwalter", async (z) => ergebnis(await erledigtEintragenVorgang(z, a.geraet_id, {
      pruefartId: a.pruefart_id, am: a.am, stunden: a.stunden ?? null, wer: "", notiz: a.notiz ?? "",
    }))));

    server.registerTool("wartung_mangel_beheben", {
      title: "Mangel beheben",
      description: "Markiert einen offenen Mangel an einem Gerät deiner Gruppe als behoben.",
      inputSchema: { mangel_id: idSchema },
      annotations: SCHREIBEN,
    }, ({ mangel_id }) => mit("verwalter", async (z) => ergebnis(await mangelBehebenVorgang(z, mangel_id))));

    server.registerTool("wartung_unterlage_hochladen", {
      title: "Unterlage an ein Gerät hängen",
      description: `Hängt eine Anleitung, ein Datenblatt oder ein anderes Dokument (PDF oder Bild, höchstens ${UNTERLAGE_MAX_BYTES / 1024 / 1024} MB) an ein Gerät deiner Gruppe. Entweder adresse (öffentliche http(s)-Adresse, etwa das Handbuch beim Hersteller; die Suite lädt es selbst) oder inhalt_base64 angeben. Löschen und Sortieren gehen in der App.`,
      inputSchema: {
        geraet_id: geraetId,
        titel: z.string().max(KURZ_MAX).describe("Name, unter dem die Unterlage am Gerät steht, z. B. „Bedienungsanleitung“"),
        adresse: z.string().url().max(2000).optional().describe("Öffentliche Adresse der Datei"),
        inhalt_base64: z.string().max(Math.ceil(UNTERLAGE_MAX_BYTES / 3) * 4 + 4).optional().describe("Die Datei als Base64"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    }, ({ geraet_id, titel, adresse, inhalt_base64 }) => mit("verwalter", async (z) => {
      if ((adresse === undefined) === (inhalt_base64 === undefined)) return antwortFehler("Bitte genau eins angeben: adresse oder inhalt_base64.");
      // Erst das Recht, dann der Abruf: für eine fremde Gruppe lädt die Suite nichts.
      const gruppe = ladeGeraet(getDb(), geraet_id, heute())?.gruppeId;
      if (!gruppe) return antwortFehler("Dieses Gerät gibt es nicht mehr.");
      if (!verwaltetGruppe(z.rechte, gruppe)) return antwortFehler("Dieses Gerät gehört zu einer Gruppe, die du nicht verwaltest.");
      let bytes: Uint8Array;
      if (adresse !== undefined) {
        const r = await ladeVonAdresse(adresse, { maxBytes: UNTERLAGE_MAX_BYTES });
        if (!r.ok) return antwortFehler(r.fehler);
        bytes = r.bytes;
      } else {
        const text = inhalt_base64!.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
        if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(text)) return antwortFehler("inhalt_base64 ist kein gültiges Base64.");
        bytes = new Uint8Array(Buffer.from(text, "base64"));
      }
      return ergebnis(await unterlageHochladenVorgang(z, geraet_id, titel, bytes));
    }));

    server.registerTool("wartung_inhalt_speichern", {
      title: "Inhaltsliste einer Materialkiste speichern",
      description: "Ersetzt die ganze Inhaltsliste einer Materialkiste deiner Gruppe, in dieser Reihenfolge. Bestehende Positionen mit ihrer id übergeben, neue ohne.",
      inputSchema: {
        geraet_id: geraetId,
        stand: z.string().describe("inhaltStand aus wartung_geraet; hat sich die Liste seitdem geändert, wird abgelehnt"),
        positionen: z.array(z.object({
          id: idSchema.nullable().optional(),
          text: z.string().max(PUNKT_MAX),
          soll: z.number().int().min(1).max(SOLL_MAX),
          bemerkung: z.string().max(KURZ_MAX).optional(),
        })).max(40),
      },
      annotations: SCHREIBEN,
    }, ({ geraet_id, stand, positionen }) => mit("verwalter", async (z) => ergebnis(await inhaltSpeichernVorgang(
      z, geraet_id,
      positionen.map((p) => ({ id: p.id ?? null, text: p.text, soll: p.soll, bemerkung: p.bemerkung ?? "" })),
      stand,
    ))));

    server.registerTool("wartung_art_speichern", {
      title: "Geräteart speichern",
      description: `Legt eine Geräteart an (ohne art_id) oder ersetzt eine bestehende ganz, mit Prüfarten (Kennungen aus wartung_pruefarten) und Checkliste. Bestehende Punkte mit ihrer id übergeben. Ein Punkt kann mit pruefarten auf einzelne Prüfungen am Gerät beschränkt werden (leer = gehört zu allen). Zeichen: ${ART_IKONEN.map((i) => i.name).join(", ")}.`,
      inputSchema: { art_id: idSchema.optional(), art: artEingabe },
      annotations: SCHREIBEN,
    }, ({ art_id, art }) => mit("verwalter", async (z) => ergebnis(await artSpeichernVorgang(z, art_id ?? null, art))));

    server.registerTool("wartung_art_loeschen", {
      title: "Geräteart löschen",
      description: "Löscht eine Geräteart, an der kein Gerät mehr hängt.",
      inputSchema: { art_id: idSchema },
      annotations: ENTFERNEN,
    }, ({ art_id }) => mit("verwalter", async (z) => ergebnis(await artLoeschenVorgang(z, art_id))));

    server.registerTool("wartung_pruefplan_speichern", {
      title: "Prüfplan eines Geräts speichern",
      description: "Ersetzt den Prüfplan eines Geräts deiner Gruppe: je Prüfart an oder aus und optional ein eigenes Intervall. Prüfarten der Geräteart, die fehlen, gelten wie bei der Art; weitere aus wartung_pruefarten lassen sich zuschalten.",
      inputSchema: {
        geraet_id: geraetId,
        plan: z.array(z.object({
          pruefart_id: idSchema,
          an: z.boolean(),
          eigenes: z.object({ monate: z.number().int().min(1).max(120).nullable(), stunden: stunden.nullable() }).nullable().optional()
            .describe("Eigenes Intervall an diesem Gerät; ohne Angabe gilt das der Prüfart"),
        })).max(40),
      },
      annotations: SCHREIBEN,
    }, ({ geraet_id, plan }) => mit("verwalter", async (z) => ergebnis(await pruefplanSpeichernVorgang(
      z, geraet_id, plan.map((p) => ({ pruefartId: p.pruefart_id, an: p.an, eigenes: p.eigenes ?? null })),
    ))));

    server.registerTool("wartung_pruefart_speichern", {
      title: "Prüfart speichern",
      description: "Legt eine Prüfart im Katalog an (ohne pruefart_id) oder ändert sie. Eine Änderung gilt an jedem Gerät ohne eigenes Intervall. Mit anlass (einsatz oder rueckkehr) ist sie statt nach Frist fällig, wenn das Gerät eingesetzt wird bzw. zurückkommt; dann ohne Monate und Stunden und wer = intern.",
      inputSchema: { pruefart_id: idSchema.optional(), pruefart: pruefartEingabe },
      annotations: SCHREIBEN,
    }, ({ pruefart_id, pruefart }) => mit("verwalter", async (z) => ergebnis(await pruefartSpeichernVorgang(z, pruefart_id ?? null, pruefart))));

    server.registerTool("wartung_pruefart_loeschen", {
      title: "Prüfart löschen",
      description: "Löscht eine Prüfart aus dem Katalog; der Verlauf bleibt.",
      inputSchema: { pruefart_id: idSchema },
      annotations: ENTFERNEN,
    }, ({ pruefart_id }) => mit("verwalter", async (z) => ergebnis(await pruefartLoeschenVorgang(z, pruefart_id))));

    if (!darf("admin")) return;

    // ------------------------------------------------------------ Modul-Admins

    server.registerTool("wartung_gruppe_speichern", {
      title: "Gruppe speichern",
      description: "Legt eine Gruppe an (ohne gruppe_id) oder benennt sie um.",
      inputSchema: { gruppe_id: idSchema.optional(), name: z.string().max(40) },
      annotations: SCHREIBEN,
    }, ({ gruppe_id, name }) => mit("admin", async (z) => ergebnis(await gruppeSpeichernVorgang(z, gruppe_id ?? null, { name }))));

    server.registerTool("wartung_gruppe_loeschen", {
      title: "Gruppe löschen",
      description: "Löscht eine Gruppe ohne Geräte.",
      inputSchema: { gruppe_id: idSchema },
      annotations: ENTFERNEN,
    }, ({ gruppe_id }) => mit("admin", async (z) => ergebnis(await gruppeLoeschenVorgang(z, gruppe_id))));
  },
};
