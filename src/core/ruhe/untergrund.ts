/**
 * Die erste deckende Hintergrundfarbe vom Element aufwärts — darauf steht die Figur, und genau in
 * dieser Farbe füllt sie ihre Platten. `null`, wenn bis zur Wurzel nichts deckt (dann gilt der
 * Seitengrund aus dem CSS-Modul).
 *
 * Kein React, keine Direktive (Falle 6); in Vitest mit jsdom prüfbar.
 */
export function untergrund(start: Element | null): string | null {
  for (let el = start; el; el = el.parentElement) {
    const farbe = getComputedStyle(el).backgroundColor;
    if (deckt(farbe)) return farbe;
  }
  return null;
}

/** `rgb(…)` deckt; `transparent`, `rgba(…, 0)` und leere Werte nicht. Halbdurchsichtig zählt nicht. */
export function deckt(farbe: string | null | undefined): boolean {
  if (!farbe || farbe === "transparent") return false;
  const m = /^rgba?\(([^)]+)\)$/.exec(farbe.trim());
  if (!m) return false;
  const teile = m[1].split(/[\s,/]+/).filter(Boolean);
  if (teile.length < 4) return true;
  const alpha = teile[3].endsWith("%") ? parseFloat(teile[3]) / 100 : parseFloat(teile[3]);
  return alpha >= 0.99;
}
