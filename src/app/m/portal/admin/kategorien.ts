/**
 * Die Kategorien, die schon vergeben sind — Vorschläge im Feld „Kategorie", damit eine Kachel nicht
 * unter „Doku" und eine zweite unter „Dokumentation" landet. Kein `"use client"` (Falle 6): die Seite
 * rechnet es auf dem Server und reicht nur die Liste weiter.
 */
const SAMMLER = new Intl.Collator("de");

export function vergebeneKategorien(dienste: readonly { category: string | null }[]): string[] {
  const gesehen = new Set<string>();
  for (const d of dienste) {
    const k = d.category?.trim();
    if (k) gesehen.add(k);
  }
  return [...gesehen].sort(SAMMLER.compare);
}
