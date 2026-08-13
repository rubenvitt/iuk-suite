import { NACHWEIS_ARTEN, PRIORITAETEN, type NachweisArt, type Prioritaet } from "../_db/schema";

/*
 * REINE EINGABEPRUEFUNG FUER FORMULARE — kein "use client", keine Datenbank, keine Sitzung. Aufgabe
 * 9 braucht sie fuer `aufgabeEinstellenAction`/`verteilenAction`/`umverteilenAction`, und die
 * Aufgaben 10-12 brauchen dieselben Pruefungen fuer `planDatum`/`planUhrzeit` & Co. — deshalb liegen
 * sie hier und nicht als Kopie in `actions.ts`. Anders als `_lib/datum.ts` (`minutenVon`, die
 * WIRFT — sie ist die letzte Verteidigungslinie gegen bereits geprueften Code) sind das hier reine
 * PRAEDIKATE: eine Server-Action braucht das Ergebnis als WERT, um einen Feldfehler daraus zu
 * bauen, keinen Wurf.
 */

const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;
const UHRZEIT = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * `YYYY-MM-DD`, UND ein echter Kalendertag — nicht nur das Textformat. `new Date("2026-02-30")`
 * rollt in JS still auf den 2. Maerz vor; der Ruecktransport durch `toISOString` deckt genau das
 * auf, weil ein erfundener Tag dabei nie auf sich selbst zurueckkommt.
 */
export function istGueltigerIsoTag(s: string): boolean {
  if (!ISO_TAG.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

/** `HH:MM`, `00:00`–`23:59` — dasselbe Format wie `_lib/datum.ts` (`minutenVon`), hier als Praedikat. */
export function istGueltigeUhrzeit(s: string): boolean {
  return UHRZEIT.test(s);
}

/** Ganzzahl echt groesser 0 — eine Dauerschaetzung von 0 oder negativ ist keine Schaetzung. */
export function istGueltigeDauerMinuten(n: number): boolean {
  return Number.isInteger(n) && n > 0;
}

export function istGueltigePrioritaet(s: string): s is Prioritaet {
  return (PRIORITAETEN as readonly string[]).includes(s);
}

export function istGueltigeNachweisArt(s: string): s is NachweisArt {
  return (NACHWEIS_ARTEN as readonly string[]).includes(s);
}
