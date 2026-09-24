import { ZodError } from "zod";

/**
 * Der gemeinsame Rückgabetyp aller Server Actions dieses Moduls.
 *
 * Warum Rückgabewert und nicht Wurf: Next ersetzt Fehlermeldungen aus Server
 * Actions im Produktionsbau durch einen generischen englischen Text — ein
 * geworfener deutscher Fehlersatz käme bei der Verwaltenden also nie an.
 *
 * Eigene Kopie statt Import aus `lagerbuch`: kein modulübergreifender Import
 * (Entscheidung 6, gemeinsamer Kontext Stufe 2).
 *
 * Keine `"use server"`-Direktive auf dieser Datei: dort wäre jeder Export eine
 * Action, und ein exportierter Typ ist dort ein Fehler, den erst die Laufzeit
 * meldet. Keine `"use client"`-Direktive: Server Actions lesen diese Datei.
 */
export type FeldFehler = Record<string, string>;

export type ActionErgebnis<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { wert: T }))
  | { ok: false; fehler: string; feldFehler?: FeldFehler };

/**
 * Der gemeinsame Nenner für Aufrufstellen, die eine Action nur ausführen und
 * ihren Fehlersatz anzeigen, den Nutzwert aber nicht brauchen.
 */
export type ActionAusgang =
  | { ok: true }
  | { ok: false; fehler: string; feldFehler?: FeldFehler };

/**
 * Übersetzt einen `ZodError` in eine Feldkarte, damit die Insel den Text am
 * Feld anzeigen kann statt in einem Kasten daneben. Der erste Fehler je Feld
 * gewinnt. Liefert `null`, wenn `e` kein `ZodError` ist.
 */
export function zodFehler(e: unknown): FeldFehler | null {
  if (!(e instanceof ZodError)) return null;
  const karte: FeldFehler = {};
  for (const problem of e.issues) {
    const feld = problem.path.join(".") || "_";
    if (!(feld in karte)) karte[feld] = problem.message;
  }
  return karte;
}
