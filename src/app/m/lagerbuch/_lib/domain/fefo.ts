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
  /** Rest AN EINEM Lagerort (`bestandProLagerortUndCharge`), nie global. */
  rest: number;
  createdAt: Date;
};

export type FefoTeil = { chargeId: string; menge: number };

/**
 * Verteilt `menge` ueber die Chargen mit Rest > 0, frueheste Faelligkeit zuerst.
 *
 * DREISTUFIGE SORTIERUNG (§5.3.1):
 *   1. `verfall`     — FEFO selbst.
 *   2. `createdAt`   — gleicher Verfall ⇒ AELTERE Charge zuerst. Das ist eine
 *                      fachliche Aussage; „was die Datenbank gerade zurueckgibt"
 *                      ist keine.
 *   3. `chargeId`    — `createdAt` sind UNIX-SEKUNDEN, ein CSV-Import legt
 *                      Dutzende Chargen in derselben Sekunde an.
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
        a.chargeId.localeCompare(b.chargeId),
    );
  const teile: FefoTeil[] = [];
  for (const c of sortiert) {
    if (rest <= 0) break;
    const nimm = Math.min(c.rest, rest);
    rest -= nimm;
    teile.push({ chargeId: c.chargeId, menge: nimm });
  }
  return teile;
}
