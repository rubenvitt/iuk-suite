/**
 * DER CSV-DIALEKT DES MODULS — kein "use client" (Falle 6).
 *
 * Zwei Funktionen und eine harte Trennung zwischen ihnen. Sie zusammenzulegen
 * ist die naheliegende Vereinfachung und der eine Fehler, den §9.2 ausschreibt.
 */

/** Dialekt: jede Zelle gequotet, enthaltene Anfuehrungszeichen verdoppelt.
 *  1:1 aus BestellListe.tsx:8. Aendert NIE den Zellinhalt. */
export function csvZelle(s: string | number): string {
  return `"${String(s).replaceAll('"', '""')}"`;
}

/** Formel-Neutralisierung — NUR fuer Textspalten. Ein fuehrendes =/+/-/@ wird von
 *  Tabellenkalkulationen als Formelbeginn gelesen; der Apostroph markiert die Zelle
 *  als Text.
 *
 *  WARUM NICHT IN csvZelle, also nicht fuer alle sechs Spalten: eine Zahlenspalte
 *  kann per Konstruktion keine Formel tragen — die Neutralisierung waere dort reine
 *  Kosten. Und `-` ist zugleich das Vorzeichen jeder negativen Zahl: eine Regel im
 *  Dialekt-Helfer machte aus einem Wert -3 die Zeichenkette "'-3", die in jeder
 *  Kalkulation als TEXT ankommt und die Spalte unsummierbar macht. Heute erzeugt
 *  kein Buchungsweg einen negativen Bestand (I2, §5.2.2) — die Falle waere also
 *  still und schluege erst zu, wenn irgendwann eine Differenzspalte hinzukommt.
 *
 *  DIE SCHWERE, MIT MASS: jede Textzelle stammt aus einem admin-geschuetzten
 *  Schreibpfad (createArtikel/updateArtikel/importArtikelCsv, alle mit Riegel);
 *  der einzige Schreibweg unterhalb von Admin ist bucheEntnahmeHelfer, und der
 *  schreibt eine MENGE, nie eine Textzelle. Das Risiko lautet "ein Admin tippt
 *  etwas, das ein anderer Admin spaeter in Excel oeffnet".
 */
export function csvTextZelle(s: string): string {
  return csvZelle(/^[=+\-@]/.test(s) ? `'${s}` : s);
}
