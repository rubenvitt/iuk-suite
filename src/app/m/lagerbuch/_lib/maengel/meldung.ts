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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * IDA-358 — DER WIEDERHOLUNGSSCHUTZ. Das Formular sendet über `core/entwurf` und
 * wiederholt nach einem Wurf mit derselben Sendungs-ID (Feld `sendung`); aus ihr
 * wird die ID des Mangels. Sie muss die Form einer `nanoid(21)` haben, weil aus
 * ihr Dateinamen werden (`_lib/maengel/fotos.ts`, `ID_MUSTER`): die ersten 21
 * Hex-Zeichen der UUID. `null` = keine Sendung (offene alte Seite), dann `newId()`.
 */
export function mangelIdAusSendung(roh: unknown): string | null {
  if (typeof roh !== "string" || !UUID.test(roh)) return null;
  return roh.replace(/-/g, "").slice(0, 21).toLowerCase();
}
