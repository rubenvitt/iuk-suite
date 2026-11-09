import { tagInZone } from "./zeit";

/**
 * DIE LÖSCHFRIST FÜR TESTANFRAGEN (IDA-375): eine Bar-Anfrage mit dem Anlass „Test" verschwindet einen
 * Kalendermonat nach ihrem Eingangstag (Suite-Zone), egal in welchem Stand, samt Dokumenten (Fremdschlüssel mit
 * `ON DELETE CASCADE`). Gelöscht wird in `_lib/hintergrund.ts`, angezeigt im Formular, auf der Statusseite und in
 * der Anfragenliste — alle drei rechnen mit dieser Datei, damit der angezeigte Tag der gelöschte ist.
 *
 * Nur genau „Test" zählt (Groß-/Kleinschreibung und Rand egal): „Testament" oder „Test-Geburtstag" bleiben
 * stehen, weil ein Löschen nicht rückgängig zu machen ist.
 *
 * Kein `"use client"` und keine Datenbank: das Formular (Client-Insel) liest sie ebenso wie der Server (Falle 6).
 */

export const TEST_ANLASS = "test";
export const TEST_FRIST_MONATE = 1;

export function istTestanlass(anlass: string): boolean {
  return anlass.trim().toLowerCase() === TEST_ANLASS;
}

/** Kalendertag plus `monate` Monate; ein Tag, den es im Zielmonat nicht gibt, wird dessen letzter (31.01. → 28./29.02.). */
export function plusMonate(isoTag: string, monate: number): string {
  const [j, m, t] = isoTag.split("-").map(Number);
  const letzter = new Date(Date.UTC(j, m - 1 + monate + 1, 0)).getUTCDate();
  return new Date(Date.UTC(j, m - 1 + monate, Math.min(t, letzter))).toISOString().slice(0, 10);
}

/** Der Tag `JJJJ-MM-TT`, an dem eine Testanfrage mit diesem Eingang gelöscht wird. */
export function testLoeschtag(eingegangenAm: number): string {
  return plusMonate(tagInZone(eingegangenAm), TEST_FRIST_MONATE);
}

/** Ist die Testanfrage heute (Zeitpunkt `jetzt`) fällig? Andere Anlässe nie. */
export function testanfrageFaellig(a: { anlass: string; eingegangenAm: number }, jetzt: number): boolean {
  return istTestanlass(a.anlass) && testLoeschtag(a.eingegangenAm) <= tagInZone(jetzt);
}
