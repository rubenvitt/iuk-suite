/**
 * Plomben-Regeln ohne Datenbank (IDA-222). Kein "use client": Server und
 * Check-Insel lesen dieselben Funktionen — eine zweite Normalisierung im
 * Client liefe beim naechsten Griff auseinander, und dann meldete der Schirm
 * „passt", waehrend der Abschluss die Plombe oeffnet.
 */

/**
 * Vergleichsform einer Plombennummer: ohne Leerraum, Bindestriche, Punkte und
 * Schraegstriche, Grossbuchstaben. „12 345-6" und „123456" sind dieselbe
 * Plombe — wer abliest, soll nicht an der Schreibweise scheitern.
 */
export function plombenNummerNorm(nummer: string): string {
  return nummer.replace(/[\s.\-_/]/g, "").toUpperCase();
}

/**
 * Steht diese Plombe — deckt sie also im Kurzcheck ihr Fach ab?
 *
 * Nur wenn sie eine gesetzte Nummer UND ein Fach hat. Eine nie gesetzte Plombe
 * bezeugt nichts, und eine Plombe ohne Fach spart kein Zaehlen.
 */
export function plombeDecktAb(p: { aktiv: boolean; nummer: string | null; fachLabel: string | null }): boolean {
  return p.aktiv && p.nummer !== null && p.fachLabel !== null;
}
