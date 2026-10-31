/**
 * DER VERTRAG ZWISCHEN MELDEFORMULAR UND ROUTE (IDA-298) — Grenzen und Antwortform.
 *
 * Kein `"use client"` (Falle 6): die Route liest die Grenzen, die Insel ebenfalls.
 */
export const BESCHREIBUNG_MAX = 2000;
export const NAME_MAX = 80;
/** Vermerk der Verwaltung beim Erledigen. */
export const VERMERK_MAX = 500;

export type MeldeAntwort =
  | { ok: true }
  | { ok: false; fehler: string; feld?: "punkte" | "beschreibung" | "fotos" };
