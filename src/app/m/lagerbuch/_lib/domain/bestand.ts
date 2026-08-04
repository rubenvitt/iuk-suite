/**
 * Die vier Bestandsbegriffe — 1:1 aus `lagerbuch/src/lib/domain/bestand.ts`.
 *
 * KEIN "use client", kein Icon-Import, kein Datenbankzugriff. Reine Funktionen
 * ueber bereits geladene Zeilen.
 *
 * ⚠️ SIE BLEIBEN, AUCH WENN DIE LESESEITE SIE NICHT MEHR RUFT (§5.2.4). Entscheidung
 * 7 (b) ersetzt jede N+1-Schleife durch EINE aggregierende SQL-Abfrage
 * (`_lib/lesepfade/bestand.ts`); danach leben diese vier nur noch in ihren eigenen
 * Tests. Das ist gewollt: SIE SIND DIE SPEZIFIKATION. Jedes Aggregat schuldet
 * einen Differenztest gegen die Funktion hier — ohne die Funktion gaebe es
 * nichts, wogegen man differenziert.
 */

/**
 * Summe ueber eine BEREITS GEFILTERTE Zeilenmenge — der schwaechste Begriff, in
 * `queries.ts` nirgends benutzt. Er wandert trotzdem mit: er ist die Definition,
 * auf der die drei anderen aufsetzen, und wer ihn streicht, laedt dazu ein, ihn
 * beim naechsten Mal ohne Filter zu benutzen.
 *
 * Vorzeichenbehaftet: Zugang +, Entnahme − (`schema.ts:98`).
 */
export function bestand(rows: { menge: number }[]): number {
  return rows.reduce((sum, r) => sum + r.menge, 0);
}

/**
 * Rest je `chargeId` — OHNE Lagerortbezug. Einziger Aufrufer im Bestand ist
 * `chargenMitRest` (`queries.ts:31`), und der filtert VORHER selbst auf einen
 * Lagerort. Wer diese Funktion ohne Vorfilter benutzt, bekommt Phantombestand.
 */
export function bestandProCharge(
  rows: { chargeId: string; menge: number }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.chargeId, (m.get(r.chargeId) ?? 0) + r.menge);
  return m;
}

/**
 * Bestand EINES Lagerorts.
 *
 * INVARIANTE, KEIN KOMMENTAR: „Sobald Fahrzeuge eigene Buchungen tragen, darf
 * keine Handlager-Ansicht mehr blind ueber alle Lagerorte summieren"
 * (`bestand.ts:13-14`). Die normative Zuordnung, welche Ansicht welchen Lagerort
 * summiert, steht in §5.2.1 und ist verbindlich — jede Abweichung ist ein
 * Verhaltensbruch, den kein Gate findet, weil Handlager- und Fahrzeugbestand sich
 * erst unterscheiden, wenn tatsaechlich umgelagert wurde.
 */
export function bestandProLagerort(
  rows: { lagerortId: string; menge: number }[],
  lagerortId: string,
): number {
  return rows.reduce((sum, r) => (r.lagerortId === lagerortId ? sum + r.menge : sum), 0);
}

/**
 * Rest je Charge AN EINEM Lagerort — der Kern-Fix gegen Phantombestand
 * (`bestand.ts:22-24`): „FEFO/Aussonderung/Inventur duerfen nicht die gleiche
 * chargeId aus einem anderen Lagerort mitzaehlen (z. B. dieselbe Charge liegt
 * teils im Handlager, teils im RTW)."
 *
 * ⚠️ Chargen ohne Buchung an diesem Ort fehlen in der Map GANZ — es gibt keinen
 * 0-Eintrag. Das SQL-Aggregat aus §5.2.4 verhaelt sich genauso (`sum()` liefert
 * bei leerer Gruppe keine Zeile), und beide Seiten gehen deshalb ueber `?? 0`.
 */
export function bestandProLagerortUndCharge(
  rows: { lagerortId: string; chargeId: string; menge: number }[],
  lagerortId: string,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.lagerortId !== lagerortId) continue;
    m.set(r.chargeId, (m.get(r.chargeId) ?? 0) + r.menge);
  }
  return m;
}
