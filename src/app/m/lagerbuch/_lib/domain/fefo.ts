/**
 * FEFO — first expired, first out. Kein "use client", kein Datenbankzugriff.
 */

/**
 * ⚠️ `createdAt` IST NEU GEGENUEBER DEM BESTAND und der ganze Grund dieser Datei.
 * Die Spalte existiert seit jeher (`schema.ts:62`), sie wurde nur nicht
 * durchgereicht. Wer sie beim Bauen des Objektliterals „spart", nimmt den
 * Determinismus aus §5.3.1 wieder heraus — und der Verlust ist still: die
 * Verteilung bleibt korrekt, nur die REIHENFOLGE ist wieder eine Laune der
 * Datenbank.
 */
export type ChargeRest = {
  chargeId: string;
  /** "YYYY-MM" */
  verfall: string;
  /** Rest AN DIESEM EINEN Ort, nie über einen Bereich summiert. */
  rest: number;
  createdAt: Date;
  /**
   * DRK-297 — der Ort, an dem dieser Rest liegt. Dieselbe Charge kommt für
   * zwei Orte ZWEIMAL in der Liste vor, mit je eigenem Rest.
   */
  lagerortId: string;
  /** `lagerorte.sortierung` des Orts — der vierte Sortierrang. */
  ortSortierung: number;
};

/**
 * ⚠️ DAS FELD HEISST `vonLagerortId` UND NICHT `lagerortId`, und der Name ist
 * der Riegel: `umlagerung()` bucht das Ziel-Leg strikt aus `teile[]` und
 * müsste bei einem neutral benannten Feld raten, ob es Quelle oder Ziel meint.
 * Ein Ziel-Leg, das den Quellort nimmt, ist netto null, wirft nicht — und das
 * Fahrzeug bleibt leer.
 */
export type FefoTeil = { chargeId: string; menge: number; vonLagerortId: string };

/**
 * Verteilt `menge` über die Chargenreste mit Rest > 0, früheste Fälligkeit
 * zuerst.
 *
 * VIERSTUFIGE SORTIERUNG:
 *   1. `verfall`        — FEFO selbst, und es BLEIBT das erste Kriterium.
 *   2. `createdAt`      — gleicher Verfall ⇒ ÄLTERE Charge zuerst.
 *   3. `chargeId`       — `createdAt` sind UNIX-SEKUNDEN.
 *   4. `ortSortierung`, dann `lagerortId` (DRK-297) — dieselbe Charge an zwei
 *      Orten: der bequemer erreichbare zuerst. Der GF-Schrank steht hinten,
 *      damit niemand ohne Not zum Telefon greift.
 *
 * ⚠️ EIN UNIQUE-INDEX AUF (artikelId, chargenNr, verfall) IST AUSDRUECKLICH KEIN
 * ERSATZ und wird nicht eingefuehrt (§4.8): er setzte eine Annahme ueber
 * Produktionsdaten voraus, die im Repo nicht belegbar ist, und er verboete einen
 * realen Vorgang — zwei Lieferungen mit derselben aufgedruckten Chargennummer.
 *
 * DIE KAPPUNG IST INVARIANTE I2: reicht der Bestand nicht, ist die Rueckgabe
 * KUERZER als angefordert, und der Aufrufer meldet die tatsaechlich gebuchte
 * Menge. Ohne sie entstuende eine Buchung, die den Lagerortbestand unter 0
 * drueckt — in ein Journal, das kein UPDATE und kein DELETE kennt (I1).
 */
export function fefoVerteilung(chargen: ChargeRest[], menge: number): FefoTeil[] {
  let rest = Math.max(0, menge);
  const sortiert = [...chargen] // KEIN In-Place-Sort: der Aufrufer haelt dieselbe Liste
    .filter((c) => c.rest > 0)
    .sort(
      (a, b) =>
        a.verfall.localeCompare(b.verfall) ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.chargeId.localeCompare(b.chargeId) ||
        a.ortSortierung - b.ortSortierung ||
        a.lagerortId.localeCompare(b.lagerortId),
    );
  const teile: FefoTeil[] = [];
  for (const c of sortiert) {
    if (rest <= 0) break;
    const nimm = Math.min(c.rest, rest);
    rest -= nimm;
    teile.push({ chargeId: c.chargeId, menge: nimm, vonLagerortId: c.lagerortId });
  }
  return teile;
}
