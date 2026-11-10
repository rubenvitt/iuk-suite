/**
 * ANGEHEFTET UND ZULETZT IM LAUNCHER (IDA-338) — eine Zeile je Person (`launcher_vorlieben`).
 *
 * ⚠️ `personId` KOMMT IMMER AUS DER SITZUNG (`session.user.id`, der `sub` von Pocket ID), nie aus
 * einem Formular — dieselbe Regel wie bei den Abos (`faelligkeiten/abos.ts`).
 *
 * Die Listen werden hier nur verwaltet, nicht nach Rechten gefiltert: das tut die Anzeige gegen die
 * Einträge, die die Person gerade sehen darf (`core/shell/launcherAuswahl.ts`). So wirkt ein Entzug
 * sofort, und niemand muss nach einem Rechtewechsel aufräumen.
 *
 * Kein `"use client"` (Falle 6).
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/app/m/portal/_db/client";
import { launcherVorlieben, type NeuigkeitenGesehen } from "@/app/m/portal/_db/schema";

export type PortalDb = ReturnType<typeof getDb>;

/** So viele zuletzt geöffnete Einträge merkt sich die Zeile; angezeigt werden weniger. */
export const ZULETZT_MERKEN = 8;
/** Obergrenze fürs Anheften: schützt die Zeile vor einem Skript, nicht die Bedienung. */
export const ANGEHEFTET_HOECHSTENS = 40;
const SCHLUESSEL = /^[a-z0-9][a-z0-9:_-]{0,80}$/i;

export interface Vorlieben {
  angeheftet: string[];
  zuletzt: string[];
}

export const KEINE_VORLIEBEN: Vorlieben = { angeheftet: [], zuletzt: [] };

export function istSchluessel(wert: unknown): wert is string {
  return typeof wert === "string" && SCHLUESSEL.test(wert);
}

/** Rein: der neue Schlüssel nach vorn, ein früherer Platz entfällt. */
export function nachBesuch(zuletzt: readonly string[], key: string): string[] {
  return [key, ...zuletzt.filter((k) => k !== key)].slice(0, ZULETZT_MERKEN);
}

/** Rein: hinten anhängen bzw. herausnehmen; die Reihenfolge der übrigen bleibt. */
export function mitAngeheftet(angeheftet: readonly string[], key: string, an: boolean): string[] {
  const ohne = angeheftet.filter((k) => k !== key);
  return an ? [...ohne, key].slice(-ANGEHEFTET_HOECHSTENS) : ohne;
}

export function vorliebenVon(personId: string, db: PortalDb = getDb()): Vorlieben {
  const zeile = db.select().from(launcherVorlieben).where(eq(launcherVorlieben.personId, personId)).get();
  return zeile ? { angeheftet: zeile.angeheftet, zuletzt: zeile.zuletzt } : KEINE_VORLIEBEN;
}

function schreibe(personId: string, werte: Partial<Vorlieben>, db: PortalDb): void {
  const jetzt = new Date();
  db.insert(launcherVorlieben)
    .values({ personId, angeheftet: werte.angeheftet ?? [], zuletzt: werte.zuletzt ?? [], aktualisiertAm: jetzt })
    .onConflictDoUpdate({ target: launcherVorlieben.personId, set: { ...werte, aktualisiertAm: jetzt } })
    .run();
}

/**
 * Merkt einen Aufruf. Steht der Schlüssel schon vorn, wird NICHT geschrieben — der Aufruf kommt aus
 * der Kopfzeile jeder Seite (`SuiteHeader`), und ein Seitenwechsel im selben Modul ist kein neuer
 * Besuch.
 */
export function merkeAufruf(personId: string, key: string, db: PortalDb = getDb()): Vorlieben {
  const bisher = vorliebenVon(personId, db);
  if (bisher.zuletzt[0] === key) return bisher;
  const zuletzt = nachBesuch(bisher.zuletzt, key);
  schreibe(personId, { zuletzt }, db);
  return { ...bisher, zuletzt };
}

export function setzeAngeheftet(personId: string, key: string, an: boolean, db: PortalDb = getDb()): Vorlieben {
  const bisher = vorliebenVon(personId, db);
  const angeheftet = mitAngeheftet(bisher.angeheftet, key, an);
  schreibe(personId, { angeheftet }, db);
  return { ...bisher, angeheftet };
}

/** Bis wohin die Person die Neuigkeiten gesehen hat; `null`, wenn sie noch nie auf der Seite war. */
export function neuigkeitenGesehenVon(personId: string, db: PortalDb = getDb()): NeuigkeitenGesehen | null {
  const zeile = db.select({ g: launcherVorlieben.neuigkeitenGesehen }).from(launcherVorlieben)
    .where(eq(launcherVorlieben.personId, personId)).get();
  return zeile?.g ?? null;
}

/**
 * Merkt den Stand nach einem Besuch. Gleicher Stand schreibt nicht (jeder Aufruf der Seite meldet sich).
 * Eigenes Upsert statt `schreibe`: die Launcher-Listen bleiben unberührt, auch bei einer neuen Zeile.
 */
export function merkeNeuigkeitenGesehen(personId: string, stand: NeuigkeitenGesehen, db: PortalDb = getDb()): void {
  const bisher = neuigkeitenGesehenVon(personId, db);
  if (bisher && bisher.bis === stand.bis && bisher.schluessel.join("\n") === stand.schluessel.join("\n")) return;
  const jetzt = new Date();
  db.insert(launcherVorlieben)
    .values({ personId, angeheftet: [], zuletzt: [], aktualisiertAm: jetzt, neuigkeitenGesehen: stand })
    .onConflictDoUpdate({ target: launcherVorlieben.personId, set: { neuigkeitenGesehen: stand, aktualisiertAm: jetzt } })
    .run();
}
