/**
 * Bestellvorschlag — die Lueckenformel. Kein "use client", kein Datenbankzugriff.
 *
 * `bestand` ist IMMER der HANDLAGER-Bestand (`queries.ts:519`, §5.2.1): der
 * Mindestbestand ist eine Nachschubschwelle fuers Zentrallager, kein Fahrzeugsoll.
 * Wer hier den lagerort-uebergreifenden Bestand einsetzt, bestellt nichts nach,
 * solange genug in den Fahrzeugen liegt — und das ist genau das Gegenteil des
 * Zwecks.
 */

/**
 * STRIKT kleiner. Bei Gleichstand ist der Artikel NICHT in der Bestellliste, und
 * `vorschlagsmenge` waere ohnehin 0.
 */
export function braucht(bestand: number, mindestbestand: number): boolean {
  return bestand < mindestbestand;
}

/**
 * Nachbestellen heisst schlicht: bis zum Mindestbestand auffuellen. KEIN Faktor,
 * KEIN Puffer — `BESTELL_FAKTOR` ist ersatzlos gestrichen (Betreiber-Entscheidung
 * 5, §5.4, §10.2). Nachgeprueft: die drei Fundstellen im Bestand sind ein Mock und
 * zwei Parse-Pruefungen, kein Produktivpfad.
 *
 * Nie negativ.
 */
export function vorschlagsmenge(bestand: number, mindestbestand: number): number {
  return Math.max(0, mindestbestand - bestand);
}
