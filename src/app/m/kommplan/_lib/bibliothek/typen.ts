import type { Kontakt, VerbindungsArt } from "../plan/schema";

/**
 * DIE BIBLIOTHEK (Spec §4.1, §4.3) — Typen und Vergleich, rein (Server, Client-Inseln, Tests). Einfügen
 * KOPIERT in den Plan; danach gibt es im Plan keinen Unterschied zu freien Angaben, und ein Plan ändert
 * sich nie still, wenn jemand die Bibliothek pflegt.
 */
export interface BibStelle { id: string; titel: string; zeichen: string | null; leiter: string | null; kontakte: Kontakt[]; notiz: string | null }
export interface BibEinheit { id: string; typ: string; rufname: string; zeichen: string | null; notiz: string | null }
export interface BibVerbindung { id: string; art: VerbindungsArt; bezeichnung: string; notiz: string | null }
export interface Bibliothek { stellen: BibStelle[]; einheiten: BibEinheit[]; verbindungen: BibVerbindung[] }
export const LEERE_BIBLIOTHEK: Bibliothek = { stellen: [], einheiten: [], verbindungen: [] };

/** Vergleichsform für Dubletten und Suche (Entscheidung 11): getrimmt, Leerraum zusammengezogen, klein. */
export function vergleichsform(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLocaleLowerCase("de");
}

/** Jedes Wort der Anfrage steht in einem der Felder; eine leere Anfrage passt immer. */
export function passt(anfrage: string, felder: readonly (string | null | undefined)[]): boolean {
  const woerter = vergleichsform(anfrage).split(" ").filter((w) => w !== "");
  if (woerter.length === 0) return true;
  const text = vergleichsform(felder.filter((f): f is string => typeof f === "string").join(" "));
  return woerter.every((w) => text.includes(w));
}
