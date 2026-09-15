/**
 * DRK-297 — die geteilte Form der beiden Schrank-Formulare (`NeuSchrank.tsx`,
 * `LagerorteListe.tsx`s `SchrankBearbeiten`). Beide senden dieselben drei
 * Felder an je eine andere Action (`createSchrank`/`updateSchrank`); vor
 * dieser Datei standen Typ, Feldliste und Typwächter wortgleich an beiden
 * Stellen — zwei Kopien, die beim naechsten Feld leise auseinanderlaufen
 * koennen. Kein "use client": reine Werte und Funktionen, keine Komponente.
 */
export type SchrankWerte = {
  name: string;
  zugangshinweis?: string;
  sortierung?: number;
};

const FORM_FELDER = new Set<keyof SchrankWerte>(["name", "zugangshinweis", "sortierung"]);

export function istFormFeld(name: string): name is keyof SchrankWerte {
  return FORM_FELDER.has(name as keyof SchrankWerte);
}

/** Loescht die serverseitige Fehlermarkierung aller Formularfelder vor einem
 *  neuen Speicherversuch. */
export function leereFormFehler(): Array<{ name: keyof SchrankWerte; errors: string[] }> {
  return Array.from(FORM_FELDER, (name) => ({ name, errors: [] }));
}
