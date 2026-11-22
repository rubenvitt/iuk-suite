/**
 * IDA-412 — der Schreibweg für den Verfall JE FACH (`fach_verfall`).
 *
 * Kein "use client". Läuft transaktions-FREI und damit auch innerhalb des Check-Abschlusses, wie
 * `setzeVerfall` daneben.
 *
 * DIE ZWEI TABELLEN UND IHRE REGEL:
 *   - `fach_verfall` trägt je Soll-Position (Fach) das gemeldete Datum.
 *   - `lagerort_verfall` bleibt das FRÜHESTE Datum je Artikel und Einheit. Alles, was warnt (Ampel,
 *     Verfallsübersicht, Entnahmebox, Rücklauf), liest weiter dort.
 * Wer hier schreibt, zieht die Einheitszeile als Minimum der Fächer nach. Wer artikelweit schreibt
 * (`setzeVerfall`), verwirft das Fachdetail (`loescheFachVerfallFuerArtikel`) — beides an EINER
 * Stelle, damit die zwei Tabellen nicht auseinanderlaufen.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { fachVerfall, lagerortVerfall, newId, sollPositionen } from "../../_db/schema";
import { MONAT_REGEX } from "../konstanten";
import type { Quelle, Tx } from "./abbuchung";

type Schreiber = DB | Tx;

/** Die aktiven (nicht entfernten) Positionen eines Artikels an einer Einheit. */
function aktivePositionen(db: Schreiber, lagerortId: string, artikelId: string): string[] {
  return db.select({ id: sollPositionen.id }).from(sollPositionen)
    .where(and(
      eq(sollPositionen.fahrzeugId, lagerortId),
      eq(sollPositionen.artikelId, artikelId),
      eq(sollPositionen.entfernt, false),
    ))
    .all().map((p) => p.id);
}

/**
 * Verwirft das Fachdetail eines Artikels an einer Einheit — ALLE Positionen, auch Grabsteine.
 * Aufgerufen von jedem artikelweiten Schreibweg: er sagt etwas über alle Fächer zugleich.
 */
export function loescheFachVerfallFuerArtikel(
  db: Schreiber, lagerortId: string, artikelId: string,
): void {
  const ids = db.select({ id: sollPositionen.id }).from(sollPositionen)
    .where(and(eq(sollPositionen.fahrzeugId, lagerortId), eq(sollPositionen.artikelId, artikelId)))
    .all().map((p) => p.id);
  if (ids.length > 0) db.delete(fachVerfall).where(inArray(fachVerfall.sollPositionId, ids)).run();
}

/** Vor einem Hard-Delete eines Lagerorts bzw. Artikels (wie `loescheVerfallFuer`). */
export function loescheFachVerfallFuer(
  db: Schreiber, feld: "lagerort" | "artikel", id: string,
): void {
  const ids = db.select({ id: sollPositionen.id }).from(sollPositionen)
    .where(feld === "lagerort" ? eq(sollPositionen.fahrzeugId, id) : eq(sollPositionen.artikelId, id))
    .all().map((p) => p.id);
  if (ids.length > 0) db.delete(fachVerfall).where(inArray(fachVerfall.sollPositionId, ids)).run();
}

/** Entfernt die Angabe GENAU EINER Position — wenn sie zum Grabstein wird. */
export function loescheFachVerfallDerPosition(db: Schreiber, sollPositionId: string): void {
  db.delete(fachVerfall).where(eq(fachVerfall.sollPositionId, sollPositionId)).run();
}

/**
 * Setzt den gemeldeten Verfall je Fach und zieht die Einheitszeile nach.
 *
 * ⚠️ `verfall = null` LÖSCHT die Angabe des Fachs — wie `setzeVerfall`, ein leerer Wert ist eine
 * Rücknahme, kein Fehler.
 *
 * ⚠️ DIE EINHEITSZEILE IST DAS MINIMUM. Ein Fach, das hier keinen Wert bekommt und keine Zeile hat,
 * zählt mit dem BISHERIGEN Datum der Einheit: das ist, was die Oberfläche dort angezeigt hat, und
 * eine Meldung über EIN Fach darf ein Datum, das von woanders kam, nicht still verwerfen. Tragen am
 * Ende kein Fach und kein Rest ein Datum, fällt die Einheitszeile.
 *
 * Die Zugehörigkeit (die Position gehört zu DIESER Einheit und ist aktiv) prüft die aufrufende
 * Action; hier wirft eine fremde Position, weil sie aus der Oberfläche nicht entstehen kann.
 */
export function setzeFachVerfaelle(
  db: Schreiber,
  args: {
    lagerortId: string;
    werte: { sollPositionId: string; verfall: string | null }[];
    quelle: Quelle;
    jetzt?: Date;
  },
): void {
  const { lagerortId, werte, quelle, jetzt = new Date() } = args;
  if (werte.length === 0) return;

  const positionen = new Map(
    db.select({ id: sollPositionen.id, artikelId: sollPositionen.artikelId })
      .from(sollPositionen)
      .where(and(eq(sollPositionen.fahrzeugId, lagerortId), eq(sollPositionen.entfernt, false)))
      .all().map((p) => [p.id, p.artikelId]),
  );

  const artikelIds = new Set<string>();
  const vorher = new Map<string, string | null>();
  for (const w of werte) {
    const artikelId = positionen.get(w.sollPositionId);
    if (!artikelId) throw new Error("Fach gehört nicht zu dieser Einheit");
    if (w.verfall && !MONAT_REGEX.test(w.verfall)) {
      throw new Error(`Verfall muss das Format YYYY-MM haben (Monat 01–12), war: "${w.verfall}"`);
    }
    if (!artikelIds.has(artikelId)) {
      artikelIds.add(artikelId);
      const zeile = db.select({ verfall: lagerortVerfall.verfall }).from(lagerortVerfall)
        .where(and(eq(lagerortVerfall.lagerortId, lagerortId), eq(lagerortVerfall.artikelId, artikelId)))
        .get();
      vorher.set(artikelId, zeile?.verfall ?? null);
    }
  }

  for (const w of werte) {
    if (!w.verfall) {
      loescheFachVerfallDerPosition(db, w.sollPositionId);
      continue;
    }
    db.insert(fachVerfall)
      .values({
        id: newId(), sollPositionId: w.sollPositionId, verfall: w.verfall, erfasstAt: jetzt,
        quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId,
      })
      .onConflictDoUpdate({
        target: fachVerfall.sollPositionId,
        set: { verfall: w.verfall, erfasstAt: jetzt, quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId },
      })
      .run();
  }

  const gesendet = new Set(werte.map((w) => w.sollPositionId));
  for (const artikelId of artikelIds) {
    const ids = aktivePositionen(db, lagerortId, artikelId);
    const fach = new Map(
      db.select({ id: fachVerfall.sollPositionId, verfall: fachVerfall.verfall }).from(fachVerfall)
        .where(inArray(fachVerfall.sollPositionId, ids))
        .all().map((z) => [z.id, z.verfall]),
    );
    const alt = vorher.get(artikelId) ?? null;
    const daten: string[] = [];
    for (const id of ids) {
      const wert = fach.get(id);
      if (wert) daten.push(wert);
      // Nicht gemeldet und ohne eigene Zeile: das Fach behält, was die Einheit bisher sagte.
      else if (!gesendet.has(id) && alt) daten.push(alt);
    }
    // "YYYY-MM" ist lexikografisch dieselbe Ordnung wie chronologisch (MONAT_REGEX).
    const minimum = daten.length > 0 ? daten.reduce((a, b) => (b < a ? b : a)) : null;
    if (minimum === alt) continue;
    if (minimum === null) {
      db.delete(lagerortVerfall)
        .where(and(eq(lagerortVerfall.lagerortId, lagerortId), eq(lagerortVerfall.artikelId, artikelId)))
        .run();
      continue;
    }
    db.insert(lagerortVerfall)
      .values({
        id: newId(), lagerortId, artikelId, verfall: minimum, erfasstAt: jetzt,
        quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId,
      })
      .onConflictDoUpdate({
        target: [lagerortVerfall.lagerortId, lagerortVerfall.artikelId],
        set: { verfall: minimum, erfasstAt: jetzt, quelleTyp: quelle.quelleTyp, quelleId: quelle.quelleId },
      })
      .run();
  }
}
