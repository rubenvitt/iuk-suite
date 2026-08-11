/**
 * DIE GEOMETRIE DES ETIKETTENBOGENS — 1:1-Pflicht 22 (Spec §8.4).
 *
 * KEIN "use client". Diese Werte liest die Client-Insel EtikettenBogen.tsx UND
 * der serverseitige Quelltext-Scan druck.test.ts. Ein Wert aus einem als Client
 * markierten Modul kommt in einer Server Component nicht als Wert an, sondern
 * als Client-Referenz — HTTP 500 fuer die ganze Seite, waehrend `typecheck` und
 * `build` gruen bleiben und Vitest es strukturell nicht sehen kann (Falle 6,
 * CLAUDE.md:24-27).
 *
 * WARUM HIER UND NICHT IN _lib/grenzen.ts: grenzen.ts haelt die Zahlen, die aus
 * der UMGEBUNG kommen und dort eine Einheit im Namen tragen (§10.3). Diese hier
 * kommen aus einem gekauften Bogen Klebeetiketten. Sie werden nie
 * konfigurierbar, und eine Env-Variable dafuer waere ein Angebot, ein Blatt
 * Material falsch zu bedrucken.
 *
 * Belege, Zeile fuer Zeile, aus `../lagerbuch/src/app/globals.css`:
 *   :265  grid-template-columns: repeat(auto-fill, 48.5mm); gap: 2mm
 *   :266  width 48.5mm; height 25.4mm; padding 2mm; gap 2.5mm
 *   :267  .etikett.deselected { opacity: .35 }
 *   :268  .etikett img { width: 20mm; height: 20mm }
 *   :276  @page { margin: 8mm }
 *   :279  @media print .etikettbogen { gap: 0 }
 */

export const ETIKETT_BREITE_MM = 48.5;
export const ETIKETT_HOEHE_MM = 25.4;
export const ETIKETT_QR_MM = 20;
export const ETIKETT_PADDING_MM = 2;
export const ETIKETT_SPALT_MM = 2.5;

/**
 * DER ABSTAND IST AM BILDSCHIRM 2mm UND AUF DEM PAPIER 0 — und das ist keine
 * Nachlaessigkeit, sondern die Bauform: am Bildschirm trennt der Spalt die
 * Kacheln sichtbar, auf dem Bogen sitzen die Klebeetiketten Kante an Kante.
 * Wer nur die Bildschirmansicht portiert, druckt ein verschobenes Raster.
 */
export const BOGEN_GAP_BILDSCHIRM_MM = 2;
export const BOGEN_GAP_DRUCK_MM = 0;

export const SEITENRAND_MM = 8;

/** Abgewaehlt am Bildschirm: blass, aber sichtbar. Im Druck dagegen
 *  `display: none` — `opacity: 0` liesse den Platz stehen und verschoebe alles
 *  Folgende um eine Kachel (druck.css, §8.4). */
export const ETIKETT_ABGEWAEHLT_OPAZITAET = 0.35;

/** `48.5` → `"48.5mm"`. `String(48.5)` liefert "48.5", `String(20)` liefert
 *  "20" — keine nachlaufende Null, und genau so stehen die Werte im CSS. */
export function mm(wert: number): string {
  return `${wert}mm`;
}
