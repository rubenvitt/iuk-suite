/**
 * DIE GERÄTEWARTUNG IM MCP-SERVER DER SUITE (IDA-367). Jede Person sieht nur die Werkzeuge ihrer Stufe, und jedes
 * Werkzeug prüft beim Aufruf noch einmal mit demselben Riegel wie die App (`aktionFuer`) — geschrieben wird über
 * dieselben Vorgänge wie die Server Actions (`_lib/vorgaenge.ts`), gelesen über dieselben Lesepfade wie die Seiten
 * mit demselben Gruppenfilter. So kann der MCP-Server nichts, was die Person in der App nicht auch kann.
 *
 * Nicht dabei: Fotos und Unterlagen (Dateien), Etiketten drucken.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getDirectory, type DirectoryResult } from "@/core/directory";
import { alsViewer, antwortFehler, antwortJson, mitRiegel, type McpModul } from "@/app/m/mcp/_lib/modul";
import { getDb } from "../_db/client";
import { gruppenAuswahl } from "../_lib/ansicht";
import {
  faelligeFristen, ladeArten, ladeGeraet, ladeGeraete, ladeGruppen, ladeInhalt, ladeMaengel, ladePruefarten, ladeUnterlagen, ladeVerlauf,
} from "../_lib/daten";
import { ART_IKONEN, artEingabe, idSchema, pruefartEingabe, NAME_MAX, NOTIZ_MAX, KURZ_MAX, SOLL_MAX, STUNDEN_MAX, PUNKT_MAX } from "../_lib/eingabe";
import { heute } from "../_lib/heute";
import { merkePerson, SUCHE_MAX_TREFFER, SUCHE_MIN_ZEICHEN, vorschlaege } from "../_lib/personen";
import { inhaltStand } from "../_lib/schreiben";
import { ladeAmGeraet, type AmGeraet } from "../_lib/telefon";
import type { Ergebnis, GeraetZeile } from "../_lib/typen";
import {
  anlassVermerkenVorgang, artLoeschenVorgang, artSpeichernVorgang, erledigtEintragenVorgang, geraetAendernVorgang, geraetAktivVorgang,
  geraetAnlegenVorgang, gruppeLoeschenVorgang, gruppeSpeichernVorgang, inhaltSpeichernVorgang, mangelBehebenVorgang,
  mangelMeldenVorgang, pruefartLoeschenVorgang, pruefartSpeichernVorgang, pruefplanSpeichernVorgang, pruefungOhneFotosVorgang,
  stundenEintragenVorgang, verwalterEntfernenVorgang,
  verwalterHinzufuegenVorgang,
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
    naechsteFrist: g.naechste,
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
};

export const wartungMcp: McpModul = {
  key: "wartung",
  registriere(server: McpServer, person) {
    const viewer: Viewer = alsViewer(person);
    if (!hatWartungZugang(viewer.groups)) return;
    const db = getDb();
    merkePerson(db, viewer.id, viewer.name);
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
      description: "Ein Gerät mit Checkliste (bei einer Materialkiste die Inhaltsliste), offenen Mängeln und Unterlagen. Hat es mehrere Prüfungen am Gerät (nach Frist, vor der Verwendung, nach der Benutzung), steht unter pruefungen je Prüfart, welche Punkte dazugehören; checkliste sind die Punkte der Prüfung, die wartung_pruefung_abschliessen ohne pruefart_id abschließt, alle_punkte die ganze Checkliste. Verwalter seiner Gruppe bekommen zusätzlich den Verlauf.",
      inputSchema: { geraet_id: geraetId },
      annotations: LESEN,
    }, ({ geraet_id }) => mit("zugang", ({ rechte }) => {
      const tag = heute();
      const eigen = ladeGeraet(getDb(), geraet_id, tag);
      if (eigen && verwaltetGruppe(rechte, eigen.gruppeId)) {
        const am = ladeAmGeraet(getDb(), geraet_id, tag);
        return antwortJson({
          geraet: eigen,
          checkliste: am?.checkliste ?? [], alle_punkte: allePunkte(am),
          pruefungen: pruefungenAmGeraet(am),
          inhalt: eigen.kiste ? ladeInhalt(getDb(), geraet_id) : undefined,
          inhaltStand: eigen.kiste ? inhaltStand(ladeInhalt(getDb(), geraet_id)) : undefined,
          offeneMaengel: ladeMaengel(getDb(), { gruppen: null, geraetId: geraet_id, offen: true }),
          verlauf: ladeVerlauf(getDb(), { gruppen: null, geraetId: geraet_id, grenze: 50 }),
          unterlagen: ladeUnterlagen(getDb(), geraet_id).map((u) => u.titel),
        });
      }
      // Wie am QR-Code: aktive Geräte, ohne Verlauf.
      const am = ladeAmGeraet(getDb(), geraet_id, tag);
      if (!am) return antwortFehler("Dieses Gerät gibt es nicht (mehr).");
      return antwortJson({
        geraet: am.g, checkliste: am.checkliste, alle_punkte: allePunkte(am), pruefungen: pruefungenAmGeraet(am), offeneMaengel: am.offen, unterlagen: am.unterlagen.map((u) => u.titel),
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
          punktId: x.punkt_id, ok: x.ok, text: x.text ?? "",
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
      description: "Vermerkt, dass ein Gerät eingesetzt wird (anlass einsatz) oder vom Einsatz zurück ist (anlass rueckkehr). Danach ist seine Prüfung vor der Verwendung bzw. nach der Benutzung fällig, bis sie abgeschlossen ist. Steht das Gerät schon so da, ändert sich nichts.",
      inputSchema: { geraet_id: geraetId, anlass: z.enum(["einsatz", "rueckkehr"]) },
      annotations: SCHREIBEN,
    }, ({ geraet_id, anlass }) => mit("zugang", async (z) => ergebnis(await anlassVermerkenVorgang(z, geraet_id, anlass))));

    server.registerTool("wartung_mangel_melden", {
      title: "Mangel melden",
      description: "Meldet einen Mangel an einem Gerät, im Namen der angemeldeten Person. Ohne Foto.",
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
      description: "Die Gruppen, die du verwaltest (Admins: alle), mit Anzahl der Geräte und ihren Verwaltern.",
      inputSchema: {},
      annotations: LESEN,
    }, () => mit("verwalter", ({ rechte }) => antwortJson(ladeGruppen(getDb()).filter((g) => verwaltetGruppe(rechte, g.id)))));

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
      return antwortJson(ladeMaengel(getDb(), { gruppen: auswahl.gruppen, offen: !behobene, ...(behobene ? { grenze: 30 } : {}) }));
    }));

    server.registerTool("wartung_pruefungen", {
      title: "Prüfungen und Wartungen",
      description: "Erledigte Prüfungen und eingetragene Wartungen der Geräte deiner Gruppen, neueste zuerst.",
      inputSchema: { gruppe_id: gruppeFilter, grenze: z.number().int().min(1).max(500).optional() },
      annotations: LESEN,
    }, ({ gruppe_id, grenze }) => mit("verwalter", ({ rechte }) => {
      const auswahl = gruppenAuswahl(rechte, ladeGruppen(getDb()), gruppe_id);
      return antwortJson(ladeVerlauf(getDb(), { gruppen: auswahl.gruppen, nurFristen: true, grenze: grenze ?? 100 }));
    }));

    server.registerTool("wartung_geraet_anlegen", {
      title: "Gerät anlegen",
      description: "Legt ein Gerät in einer Gruppe an, die du verwaltest.",
      inputSchema: geraetFelder,
      annotations: SCHREIBEN,
    }, (a) => mit("verwalter", async (z) => ergebnis(await geraetAnlegenVorgang(z, {
      gruppeId: a.gruppe_id, artId: a.art_id, name: a.name, hersteller: a.hersteller ?? "", typ: a.typ ?? "",
      seriennr: a.seriennr ?? "", ortArt: a.ort_art, ort: a.ort, fahrzeugId: a.fahrzeug_id ?? null,
      stunden: a.stunden ?? null, hinweise: a.hinweise ?? "",
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
        stunden: a.stunden !== undefined ? a.stunden : alt.stunden, hinweise: a.hinweise ?? alt.hinweise,
      }));
    }));

    server.registerTool("wartung_geraet_ausmustern", {
      title: "Gerät ausmustern oder zurückholen",
      description: "Mustert ein Gerät deiner Gruppe aus (es verschwindet aus Listen und Fristen) oder holt es mit zurueckholen = true zurück.",
      inputSchema: { geraet_id: geraetId, zurueckholen: z.boolean().optional() },
      annotations: SCHREIBEN,
    }, ({ geraet_id, zurueckholen }) => mit("verwalter", async (z) =>
      ergebnis(await geraetAktivVorgang(z, geraet_id, zurueckholen === true))));

    server.registerTool("wartung_erledigt_eintragen", {
      title: "Wartung eintragen",
      description: "Trägt eine erledigte Prüfung ein, etwa die Wartung durch die Fachfirma oder die Elektroprüfung. Die pruefart_id kommt aus dem Prüfplan in wartung_geraet und muss am Gerät gelten.",
      inputSchema: {
        geraet_id: geraetId,
        pruefart_id: idSchema,
        am: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Datum JJJJ-MM-TT"),
        stunden: stunden.nullable().optional(),
        wer: z.string().max(NAME_MAX).optional().describe("Wer es erledigt hat, z. B. die Fachfirma"),
        notiz: z.string().max(NOTIZ_MAX).optional(),
      },
      annotations: SCHREIBEN,
    }, (a) => mit("verwalter", async (z) => ergebnis(await erledigtEintragenVorgang(z, a.geraet_id, {
      pruefartId: a.pruefart_id, am: a.am, stunden: a.stunden ?? null, wer: a.wer ?? "", notiz: a.notiz ?? "",
    }))));

    server.registerTool("wartung_mangel_beheben", {
      title: "Mangel beheben",
      description: "Markiert einen offenen Mangel an einem Gerät deiner Gruppe als behoben.",
      inputSchema: { mangel_id: idSchema },
      annotations: SCHREIBEN,
    }, ({ mangel_id }) => mit("verwalter", async (z) => ergebnis(await mangelBehebenVorgang(z, mangel_id))));

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

    server.registerTool("wartung_personen_suchen", {
      title: "Personen für eine Gruppe suchen",
      description: `Sucht Personen im Verzeichnis, die einer Gruppe als Verwalter zugeordnet werden können (ab ${SUCHE_MIN_ZEICHEN} Zeichen, höchstens ${SUCHE_MAX_TREFFER} Treffer).`,
      inputSchema: { gruppe_id: idSchema, begriff: z.string().min(SUCHE_MIN_ZEICHEN).max(100) },
      annotations: { ...LESEN, openWorldHint: true },
    }, ({ gruppe_id, begriff }) => mit("admin", async () => {
      const v = await verzeichnis(() => getDirectory().search(begriff.trim(), SUCHE_MAX_TREFFER));
      return antwortJson(vorschlaege(getDb(), gruppe_id, begriff, v));
    }));

    server.registerTool("wartung_verwalter_zuordnen", {
      title: "Verwalter zuordnen",
      description: "Ordnet eine Person (nutzer aus wartung_personen_suchen) einer Gruppe als Verwalter zu.",
      inputSchema: { gruppe_id: idSchema, nutzer: z.string().min(1).max(200) },
      annotations: SCHREIBEN,
    }, (a) => mit("admin", async (z) => ergebnis(await verwalterHinzufuegenVorgang(
      z, { gruppeId: a.gruppe_id, nutzer: a.nutzer }, () => verzeichnis(() => getDirectory().list()),
    ))));

    server.registerTool("wartung_verwalter_entfernen", {
      title: "Verwalter entfernen",
      description: "Nimmt einer Person die Verwaltung einer Gruppe.",
      inputSchema: { gruppe_id: idSchema, nutzer: z.string().min(1).max(200) },
      annotations: ENTFERNEN,
    }, (a) => mit("admin", async (z) => ergebnis(await verwalterEntfernenVorgang(z, { gruppeId: a.gruppe_id, nutzer: a.nutzer }))));
  },
};

const KEIN_VERZEICHNIS: DirectoryResult = { status: "error", people: [] };
async function verzeichnis(abruf: () => Promise<DirectoryResult>): Promise<DirectoryResult> {
  try { return await abruf(); } catch { return KEIN_VERZEICHNIS; }
}
