/**
 * Die Datenformen zwischen Server und Seite. Reine Typen und Konstanten, kein `"use client"`
 * (Falle 6): Server Components, Server Actions und die Liste lesen dieselbe Datei.
 */

export const ARTEN = ["sanitaetsdienst", "betreuung", "uebung", "sonstiges"] as const;
export type VeranstaltungArt = (typeof ARTEN)[number];

export const STATUS = ["angefragt", "zugesagt", "abgesagt"] as const;
export type VeranstaltungStatus = (typeof STATUS)[number];

export const ART_TITEL: Record<VeranstaltungArt, string> = {
  sanitaetsdienst: "Sanitätsdienst",
  betreuung: "Betreuung",
  uebung: "Übung",
  sonstiges: "Sonstiges",
};

export const STATUS_TITEL: Record<VeranstaltungStatus, string> = {
  angefragt: "Angefragt",
  zugesagt: "Zugesagt",
  abgesagt: "Abgesagt",
};

export interface VeranstaltungDTO {
  id: string;
  name: string;
  art: VeranstaltungArt;
  status: VeranstaltungStatus;
  ort: string;
  veranstalter: string;
  von: number;
  bis: number;
  bemerkung: string;
}

/** Eine Veranstaltung reicht höchstens 14 Tage — wie ein Planungszeitraum der Schichtplanung. */
export const MAX_DAUER_MS = 14 * 24 * 60 * 60_000;
