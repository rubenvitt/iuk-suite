/**
 * Fuenf Leitner-Stufen. Vollstaendig beschrieben durch EINE Integer-Spalte und in drei
 * Zeilen pruefbar.
 *
 * WARUM NICHT SM-2: es braucht eine Selbsteinschaetzung 0-5, die es bei Multiple Choice
 * nicht gibt, und fuehrt drei Gleitkommafelder, die nach einem Jahr niemand mehr erklaert.
 *
 * Das Intervall gehoert zur ERREICHTEN Stufe.
 */
export const INTERVALL_TAGE = [1, 3, 7, 16, 35] as const;

export type Ergebnis = "richtig" | "falsch";

/**
 * `heute` und das Ergebnis kommen herein, ein neuer Stand geht heraus. Kein Datenbank-
 * zugriff, kein `new Date()` — deshalb ist die Wiederholungslogik ohne Datenbank und ohne
 * Zeitattrappe testbar.
 *
 * Kalendertage sind TEXT `YYYY-MM-DD`: als Zeitpunkt haengt "heute faellig" an der
 * Zeitzone des Lesers, und lexikografisch ist `faellig_am <= :heute` ohne Datumsrechnen
 * vergleichbar.
 */
export function naechsterStand(
  stufe: number,
  ergebnis: Ergebnis,
  heute: string,
): { stufe: number; faelligAm: string } {
  if (ergebnis === "falsch") return { stufe: 0, faelligAm: heute };
  const neu = Math.min(stufe + 1, INTERVALL_TAGE.length - 1);
  return { stufe: neu, faelligAm: plusTage(heute, INTERVALL_TAGE[neu]) };
}

/** Tagesarithmetik ueber UTC, damit keine Sommerzeit den Tag verschiebt. */
export function plusTage(tag: string, tage: number): string {
  const d = new Date(`${tag}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}
