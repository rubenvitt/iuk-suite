/**
 * Was die Client-Inseln der Mitglieder brauchen, ohne Datenbank und ohne `node:crypto`: Grenzen, Typen und den
 * Aufbau des persönlichen Links. `_lib/mitglieder.ts` zieht Drizzle und `_lib/kennung.ts` nach sich und darf
 * deshalb nicht in eine `"use client"`-Datei. Kein `"use client"` hier (Falle 6).
 */

export const MITGLIED_NAME_MAX = 80;
export const MITGLIED_TELEFON_MAX = 40;

/** Eine Zeile der Mitgliederliste. Serialisierbar, geht so an die Client-Insel. */
export interface MitgliedZeile {
  id: string;
  name: string;
  telefon: string;
  link: string;
  /** Nicht vergangene Events und Projekte, für die das Mitglied verantwortlich ist. */
  verantwortlich: { id: string; titel: string }[];
  /** Offene Aufgaben in nicht vergangenen Vorhaben, für die das Mitglied zuständig ist. */
  offeneAufgaben: number;
}

/**
 * Rückgabe der Server Actions dieses Bereichs (`_actions/mitglieder.ts`, `_actions/mein.ts`). Ein Wert statt
 * eines Wurfs, weil Next Fehlertexte aus Actions im Produktionsbau durch einen englischen Standardtext ersetzt
 * (Begründung in `schichtplan/_lib/actionErgebnis.ts`). Hier und nicht in einer `"use server"`-Datei, denn dort
 * wäre jeder Export eine Action.
 */
export type MitgliederErgebnis =
  | { ok: true }
  | { ok: false; fehler: string; feldFehler?: Record<string, string>; linkUngueltig?: boolean };

/** Der persönliche Link zum Weitergeben. */
export function persoenlicherLink(basis: string, link: string): string {
  return `${basis.replace(/\/+$/, "")}/mein/${link}`;
}
