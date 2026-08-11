/**
 * DER ZWISCHENABLAGE-TEXT — kein "use client" (Falle 6).
 *
 * Der Kern ist eine reine Funktion, damit die Aussage testbar wird, ohne einen
 * Browser zu brauchen: `navigator.clipboard` verlangt einen secure context, und
 * unter `lagerbuch.localtest.me` gibt es den nicht (§9.3, Entscheidung 9-D).
 * Ein Playwright-Test, der die Zwischenablage liest, prueft die Browserrechte
 * des Testlaufs — nicht das Modul.
 *
 * DER VERTRAG IST DER TEXTINHALT, NICHT DER TRANSPORTWEG: der Rueckfallweg
 * (Modal mit vorselektiertem Text) liefert zeichengleich denselben String.
 */
export function bestellListeText(
  zeilen: { vorschlag: number; name: string; bestellt: boolean }[],
): string {
  // U+00D7, nicht ASCII "x" — 1:1-Pflicht 28. Nur offene Zeilen (BestellListe.tsx:25).
  return zeilen
    .filter((z) => !z.bestellt)
    .map((z) => `${z.vorschlag} × ${z.name}`)
    .join("\n");
}
