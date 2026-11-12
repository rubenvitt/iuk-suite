/**
 * Lesen und Pflegen der Fahrzeugakte (IDA-299): Technik, Kilometerstand, Prüfungen, Reifen. Die
 * Fristrechnung steht in `regeln.ts`; hier steht nur, was in der Datenbank liegt und was beim Schreiben gilt.
 *
 * ZUGEHÖRIGKEIT KOMMT AUS DER DATENBANK. Eine Prüfung oder ein Reifensatz bestimmt sein Fahrzeug selbst
 * (`stamm_id`); wo eine Funktion zusätzlich eine `fahrzeugId` bekommt, muss beides zusammenpassen, sonst
 * gilt die Zeile als nicht gefunden (`CLAUDE.md`, Abschnitt „Zugriffsschutz“).
 *
 * `heute` (`JJJJ-MM-TT`, `heute.ts`) kommt als Parameter herein, damit die Regeln ohne Uhr prüfbar sind.
 * Jede Schreibfunktion läuft in einer Transaktion: ein abgelehnter Eintrag hinterlässt nichts.
 */
import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { FahrzeugeDb, FahrzeugeSchreiber } from "../../_db/client";
import { fahrzeugakte, pruefung, reifensatz, stammfahrzeug } from "../../_db/schema";
import { listeFahrzeuge, NichtGefunden, type FahrzeugDTO } from "../daten";
import {
  FUEHRERSCHEINE, PRUEF_ARTEN, REIFEN_ARTEN,
  type AkteDTO, type ErledigtEingabe, type Fuehrerschein, type KilometerEingabe, type PruefArt, type PruefungDTO, type PruefungEingabe,
  type ReifenArt, type ReifensatzDTO, type ReifensatzEingabe, type ReifenwechselEingabe, type TechnikDTO, type TechnikEingabe,
} from "./typen";

/* ---------- Erwartbare Fehler: der Satz geht an die Verwaltenden, `feld` an das Formularfeld ---------- */

/** Gemeinsame Klasse, damit `_actions/akte.ts` alle erwartbaren Fehler der Akte an einer Stelle fängt. */
export class AkteFehler extends Error {
  constructor(satz: string, readonly feld: string | null = null) {
    super(satz);
  }
}

export class PruefungNichtGefunden extends AkteFehler {
  constructor() {
    super("Diese Prüfung gibt es nicht mehr.");
  }
}

export class ReifensatzNichtGefunden extends AkteFehler {
  constructor() {
    super("Diesen Reifensatz gibt es nicht mehr.");
  }
}

/** Anhänger haben keinen Tacho. */
export class KeinKilometerstand extends AkteFehler {
  constructor() {
    super("Ein Anhänger führt keinen Kilometerstand.", "km");
  }
}

export class KilometerRueckwaerts extends AkteFehler {
  constructor(readonly bisher: number) {
    super(`Der Kilometerstand liegt unter dem bisherigen (${kmText(bisher)}). Prüf die Zahl noch einmal.`, "km");
  }
}

/** Ein Tag, der schon gewesen sein muss, liegt nach heute. */
export class TagInZukunft extends AkteFehler {
  constructor(feld: "am" | "zuletzt") {
    super(feld === "zuletzt" ? "Die letzte Prüfung kann nicht in der Zukunft liegen." : "Dieser Tag liegt in der Zukunft. Gib heute oder einen früheren Tag an.", feld);
  }
}

/** Die Prüfung rechnet auch nach Kilometern, also braucht sie den Stand vom Prüftag. */
export class KilometerFehlt extends AkteFehler {
  constructor() {
    super("Für diese Prüfung braucht die Akte den Kilometerstand.", "km");
  }
}

/** HU, UVV und Service gibt es je Fahrzeug einmal — die Tafel hat für jede genau eine Spalte. */
export class PruefartSchonVorhanden extends AkteFehler {
  constructor(readonly art: PruefArt) {
    super(`Dieses Fahrzeug hat schon eine Prüfung der Art ${art}. Ändere die vorhandene oder wähl „Weitere“.`, "art");
  }
}

export class ReifenartSchonVorhanden extends AkteFehler {
  constructor(readonly art: ReifenArt) {
    super(`Dieses Fahrzeug hat schon einen Satz ${art}reifen. Ändere den vorhandenen Satz.`, "art");
  }
}

export class KeinReifensatz extends AkteFehler {
  constructor(readonly art: ReifenArt) {
    super(`Für ${art}reifen ist kein Satz erfasst. Leg den Satz zuerst an.`, "aufgezogen");
  }
}

const kmText = (km: number): string => `${new Intl.NumberFormat("de-DE").format(km)} km`;

/* ---------- Lesen ---------- */

type AkteZeile = typeof fahrzeugakte.$inferSelect;
type PruefZeile = typeof pruefung.$inferSelect;
type ReifenZeile = typeof reifensatz.$inferSelect;

const LEERE_TECHNIK: TechnikDTO = {
  modell: null, baujahr: null, laengeCm: null, breiteCm: null, hoeheCm: null, zggKg: null, leerKg: null,
  staerke: null, sitze: null, tragen: null, fuehrerschein: null, besonderheiten: [],
};

const alsFuehrerschein = (s: string | null): Fuehrerschein | null =>
  (FUEHRERSCHEINE as readonly string[]).includes(s ?? "") ? (s as Fuehrerschein) : null;

function alsTechnik(z: AkteZeile | undefined): TechnikDTO {
  if (!z) return { ...LEERE_TECHNIK, besonderheiten: [] };
  return {
    modell: z.modell, baujahr: z.baujahr, laengeCm: z.laengeCm, breiteCm: z.breiteCm, hoeheCm: z.hoeheCm, zggKg: z.zggKg, leerKg: z.leerKg,
    staerke: z.staerkeF !== null && z.staerkeU !== null && z.staerkeM !== null ? [z.staerkeF, z.staerkeU, z.staerkeM] : null,
    sitze: z.sitze, tragen: z.tragen, fuehrerschein: alsFuehrerschein(z.fuehrerschein),
    besonderheiten: Array.isArray(z.besonderheiten) ? z.besonderheiten.filter((b): b is string => typeof b === "string") : [],
  };
}

const alsPruefung = (z: PruefZeile): PruefungDTO => ({
  id: z.id, art: z.art, name: z.name, monate: z.monate, kmAbstand: z.kmAbstand, zuletzt: z.zuletzt, zuletztKm: z.zuletztKm,
  vonHand: z.vonHand, bemerkung: z.bemerkung,
});

const alsReifensatz = (z: ReifenZeile): ReifensatzDTO => ({ id: z.id, art: z.art, dot: z.dot, lager: z.lager });

/** HU, UVV, Service, dann Weitere; innerhalb einer Art nach Namen, bei gleichem Namen die ältere zuerst. */
function sortierePruefungen(zeilen: PruefZeile[]): PruefungDTO[] {
  const sortierer = new Intl.Collator("de", { numeric: true });
  return [...zeilen].sort((a, b) =>
    PRUEF_ARTEN.indexOf(a.art) - PRUEF_ARTEN.indexOf(b.art)
    || sortierer.compare(a.name, b.name)
    || a.angelegtAm.getTime() - b.angelegtAm.getTime()
    || a.id.localeCompare(b.id)).map(alsPruefung);
}

const sortiereReifen = (zeilen: ReifenZeile[]): ReifensatzDTO[] =>
  [...zeilen].sort((a, b) => REIFEN_ARTEN.indexOf(a.art) - REIFEN_ARTEN.indexOf(b.art)).map(alsReifensatz);

function baueAkten(db: FahrzeugeSchreiber, fahrzeuge: FahrzeugDTO[]): AkteDTO[] {
  if (fahrzeuge.length === 0) return [];
  const ids = fahrzeuge.map((f) => f.id);
  const akten = new Map(db.select().from(fahrzeugakte).where(inArray(fahrzeugakte.stammId, ids)).all().map((z) => [z.stammId, z]));
  const pruefungen = Map.groupBy(db.select().from(pruefung).where(inArray(pruefung.stammId, ids)).all(), (z) => z.stammId);
  const reifen = Map.groupBy(db.select().from(reifensatz).where(inArray(reifensatz.stammId, ids)).all(), (z) => z.stammId);
  return fahrzeuge.map((fahrzeug) => {
    const z = akten.get(fahrzeug.id);
    const saetze = sortiereReifen(reifen.get(fahrzeug.id) ?? []);
    // Zeigt `reifen_aufgezogen` auf eine Art ohne Satz (von Hand in der Datenbank geändert), gilt „nichts aufgezogen“.
    const aufgezogen = z?.reifenAufgezogen && saetze.some((s) => s.art === z.reifenAufgezogen) ? z.reifenAufgezogen : null;
    return {
      fahrzeug, technik: alsTechnik(z), km: z?.km ?? null, kmAm: z?.kmAm ?? null, aufgezogen,
      reifensaetze: saetze, pruefungen: sortierePruefungen(pruefungen.get(fahrzeug.id) ?? []),
    };
  });
}

/**
 * Alle Akten in der Reihenfolge von `listeFahrzeuge` (`../daten.ts`). Ohne `mitInaktiven` nur aktive
 * Fahrzeuge. Ein Fahrzeug ohne Zeile in `fahrzeugakte` kommt mit leerer Akte.
 */
export function ladeAkten(db: FahrzeugeDb, opts: { mitInaktiven?: boolean } = {}): AkteDTO[] {
  return baueAkten(db, listeFahrzeuge(db).filter((f) => opts.mitInaktiven || f.aktiv));
}

/** Die Akte eines Fahrzeugs, auch eines deaktivierten; `null`, wenn es das Fahrzeug nicht gibt. */
export function ladeAkte(db: FahrzeugeDb, fahrzeugId: string): AkteDTO | null {
  const fahrzeug = listeFahrzeuge(db).find((f) => f.id === fahrzeugId);
  return fahrzeug ? baueAkten(db, [fahrzeug])[0] : null;
}

/* ---------- Schreiben ---------- */

type Tx = Parameters<Parameters<FahrzeugeDb["transaction"]>[0]>[0];

function holeFahrzeug(tx: Tx, fahrzeugId: string) {
  const f = tx.select({ id: stammfahrzeug.id, art: stammfahrzeug.art }).from(stammfahrzeug).where(eq(stammfahrzeug.id, fahrzeugId)).get();
  if (!f) throw new NichtGefunden();
  return f;
}

const holeAkte = (tx: Tx, fahrzeugId: string): AkteZeile | undefined =>
  tx.select().from(fahrzeugakte).where(eq(fahrzeugakte.stammId, fahrzeugId)).get();

/** Legt die Aktenzeile an oder setzt nur die genannten Spalten — der Rest der Akte bleibt, wie er ist. */
function schreibeAkte(tx: Tx, fahrzeugId: string, werte: Partial<Omit<typeof fahrzeugakte.$inferInsert, "stammId">>): void {
  tx.insert(fahrzeugakte).values({ stammId: fahrzeugId, ...werte }).onConflictDoUpdate({ target: fahrzeugakte.stammId, set: werte }).run();
}

/** Technische Daten und Besonderheiten. Kilometerstand und Reifen bleiben unberührt. */
export function speichereTechnik(db: FahrzeugeDb, fahrzeugId: string, e: TechnikEingabe): void {
  db.transaction((tx) => {
    holeFahrzeug(tx, fahrzeugId);
    schreibeAkte(tx, fahrzeugId, {
      modell: e.modell, baujahr: e.baujahr, laengeCm: e.laengeCm, breiteCm: e.breiteCm, hoeheCm: e.hoeheCm, zggKg: e.zggKg, leerKg: e.leerKg,
      staerkeF: e.staerke?.[0] ?? null, staerkeU: e.staerke?.[1] ?? null, staerkeM: e.staerke?.[2] ?? null,
      sitze: e.sitze, tragen: e.tragen, fuehrerschein: e.fuehrerschein, besonderheiten: e.besonderheiten,
    });
  });
}

/**
 * Kilometerstand laut Tacho. Nie rückwärts, der Ablesetag (`am`, sonst heute) nie in der Zukunft; bei
 * Anhängern abgelehnt.
 */
export function trageKilometerEin(db: FahrzeugeDb, fahrzeugId: string, e: KilometerEingabe, heute: string): void {
  db.transaction((tx) => {
    const f = holeFahrzeug(tx, fahrzeugId);
    if (f.art === "anhaenger") throw new KeinKilometerstand();
    const am = e.am ?? heute;
    if (am > heute) throw new TagInZukunft("am");
    const bisher = holeAkte(tx, fahrzeugId)?.km ?? null;
    if (bisher !== null && e.km < bisher) throw new KilometerRueckwaerts(bisher);
    schreibeAkte(tx, fahrzeugId, { km: e.km, kmAm: am });
  });
}

const FESTE_ARTEN: readonly PruefArt[] = ["HU", "UVV", "Service"];

/**
 * Legt eine Prüfung an (`pruefungId === null`) oder ändert sie. `zuletztKm` ist keine Eingabe: beim
 * Anlegen mit `kmAbstand` und `zuletzt` wird es der aktuelle Kilometerstand der Akte; beim Ändern bleibt
 * es stehen, solange die Prüfung nach Kilometern rechnet und ein `zuletzt` hat — bekommt sie den
 * Kilometerabstand erst jetzt, gilt wieder der Stand der Akte. Ohne `kmAbstand` oder ohne `zuletzt` ist es `null`.
 */
export function speicherePruefung(
  db: FahrzeugeDb, fahrzeugId: string, pruefungId: string | null, e: PruefungEingabe, heute: string, jetzt = new Date(),
): PruefungDTO {
  return db.transaction((tx) => {
    holeFahrzeug(tx, fahrzeugId);
    const alt = pruefungId === null ? null : tx.select().from(pruefung).where(and(eq(pruefung.id, pruefungId), eq(pruefung.stammId, fahrzeugId))).get();
    if (pruefungId !== null && !alt) throw new PruefungNichtGefunden();
    if (e.zuletzt !== null && e.zuletzt > heute) throw new TagInZukunft("zuletzt");
    if (FESTE_ARTEN.includes(e.art)) {
      const andere = tx.select({ id: pruefung.id }).from(pruefung).where(and(eq(pruefung.stammId, fahrzeugId), eq(pruefung.art, e.art))).all();
      if (andere.some((p) => p.id !== pruefungId)) throw new PruefartSchonVorhanden(e.art);
    }
    const aktenKm = () => holeAkte(tx, fahrzeugId)?.km ?? null;
    const zuletztKm = e.kmAbstand === null || e.zuletzt === null ? null
      : alt && alt.kmAbstand !== null && alt.zuletzt !== null ? alt.zuletztKm
      : aktenKm();
    const werte = { art: e.art, name: e.name, monate: e.monate, kmAbstand: e.kmAbstand, zuletzt: e.zuletzt, zuletztKm, vonHand: e.vonHand };
    const zeile = alt
      ? tx.update(pruefung).set(werte).where(eq(pruefung.id, alt.id)).returning().get()
      : tx.insert(pruefung).values({ id: nanoid(), stammId: fahrzeugId, ...werte, bemerkung: "", angelegtAm: jetzt }).returning().get();
    return alsPruefung(zeile);
  });
}

/**
 * Prüfung erledigt: setzt `zuletzt`, den Handtermin (`null` löscht einen alten) und die Bemerkung.
 * `zuletztKm` nur, wenn die Prüfung nach Kilometern rechnet — dann ist der Kilometerstand Pflicht, außer
 * beim Anhänger (dort wird ein mitgegebener Stand verworfen). Liegt der Stand über dem der Akte, rückt
 * auch die Akte vor; ein niedrigerer (nachgetragene Prüfung) lässt sie stehen.
 */
export function erledigePruefung(db: FahrzeugeDb, pruefungId: string, e: ErledigtEingabe, heute: string): PruefungDTO {
  return db.transaction((tx) => {
    const p = tx.select().from(pruefung).where(eq(pruefung.id, pruefungId)).get();
    if (!p) throw new PruefungNichtGefunden();
    const f = holeFahrzeug(tx, p.stammId);
    if (e.am > heute) throw new TagInZukunft("am");
    const km = f.art === "anhaenger" ? null : e.km;
    if (p.kmAbstand !== null && f.art !== "anhaenger" && km === null) throw new KilometerFehlt();
    if (km !== null) {
      const akte = holeAkte(tx, p.stammId);
      if (akte?.km == null || km > akte.km) {
        schreibeAkte(tx, p.stammId, { km, kmAm: akte?.kmAm && akte.kmAm > e.am ? akte.kmAm : e.am });
      }
    }
    return alsPruefung(tx.update(pruefung).set({
      zuletzt: e.am, vonHand: e.vonHand, bemerkung: e.bemerkung, zuletztKm: p.kmAbstand !== null ? km : null,
    }).where(eq(pruefung.id, p.id)).returning().get());
  });
}

export function entfernePruefung(db: FahrzeugeDb, pruefungId: string): void {
  const z = db.delete(pruefung).where(eq(pruefung.id, pruefungId)).returning({ id: pruefung.id }).get();
  if (!z) throw new PruefungNichtGefunden();
}

/**
 * Legt einen Reifensatz an (`satzId === null`) oder ändert ihn; je Fahrzeug höchstens ein Satz je Art.
 * Ist nichts aufgezogen (der erste Satz, oder der aufgezogene wurde entfernt), gilt der neu angelegte
 * als aufgezogen. Ändert der aufgezogene Satz seine Art, zieht `reifen_aufgezogen` mit.
 */
export function speichereReifensatz(db: FahrzeugeDb, fahrzeugId: string, satzId: string | null, e: ReifensatzEingabe): ReifensatzDTO {
  return db.transaction((tx) => {
    holeFahrzeug(tx, fahrzeugId);
    const saetze = tx.select().from(reifensatz).where(eq(reifensatz.stammId, fahrzeugId)).all();
    const alt = satzId === null ? null : saetze.find((s) => s.id === satzId);
    if (satzId !== null && !alt) throw new ReifensatzNichtGefunden();
    if (saetze.some((s) => s.art === e.art && s.id !== satzId)) throw new ReifenartSchonVorhanden(e.art);
    const aufgezogen = holeAkte(tx, fahrzeugId)?.reifenAufgezogen ?? null;
    if (alt) {
      const zeile = tx.update(reifensatz).set({ art: e.art, dot: e.dot, lager: e.lager }).where(eq(reifensatz.id, alt.id)).returning().get();
      if (aufgezogen === alt.art && alt.art !== e.art) schreibeAkte(tx, fahrzeugId, { reifenAufgezogen: e.art });
      return alsReifensatz(zeile);
    }
    const zeile = tx.insert(reifensatz).values({ id: nanoid(), stammId: fahrzeugId, art: e.art, dot: e.dot, lager: e.lager }).returning().get();
    if (aufgezogen === null || !saetze.some((s) => s.art === aufgezogen)) schreibeAkte(tx, fahrzeugId, { reifenAufgezogen: e.art });
    return alsReifensatz(zeile);
  });
}

/** Entfernt einen Satz. War er aufgezogen, ist danach nichts aufgezogen (`null`), bis jemand den Wechsel einträgt. */
export function entferneReifensatz(db: FahrzeugeDb, satzId: string): void {
  db.transaction((tx) => {
    const z = tx.delete(reifensatz).where(eq(reifensatz.id, satzId)).returning().get();
    if (!z) throw new ReifensatzNichtGefunden();
    if (holeAkte(tx, z.stammId)?.reifenAufgezogen === z.art) schreibeAkte(tx, z.stammId, { reifenAufgezogen: null });
  });
}

/** Reifenwechsel: nur auf eine Art, für die das Fahrzeug einen Satz hat. */
export function wechsleReifen(db: FahrzeugeDb, fahrzeugId: string, e: ReifenwechselEingabe): void {
  db.transaction((tx) => {
    holeFahrzeug(tx, fahrzeugId);
    const satz = tx.select({ id: reifensatz.id }).from(reifensatz).where(and(eq(reifensatz.stammId, fahrzeugId), eq(reifensatz.art, e.aufgezogen))).get();
    if (!satz) throw new KeinReifensatz(e.aufgezogen);
    schreibeAkte(tx, fahrzeugId, { reifenAufgezogen: e.aufgezogen });
  });
}
