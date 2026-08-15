import {
  NACHWEIS_ARTEN,
  PRIORITAETEN,
  ROLLEN,
  type NachweisArt,
  type Prioritaet,
  type Rolle,
} from "../_db/schema";

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

/**
 * Aufgabe 14 (Personenverwaltung) — dieselbe Form wie `istGueltigePrioritaet`.
 *
 * SEIT DEM QUELLENWECHSEL (2026-08-15) IST DAS ZUGLEICH DER RIEGEL GEGEN DEN ABGESCHAFFTEN WERT:
 * `ROLLEN` kennt `koordination` nicht mehr (die Rolle kommt aus der Auth-Gruppe), also lehnt diese
 * Funktion ihn ab — ohne dass hier eine zweite Liste zu pflegen waere. SQLite haette ihn
 * angenommen: `text("rolle", { enum })` erzeugt dort kein `CHECK`, die Spalte ist schlicht
 * `text NOT NULL`. Diese Funktion ist damit die einzige Stelle, die eine handgeschriebene
 * Formulareingabe `rolle=koordination` aufhaelt.
 */
export function istGueltigeRolle(s: string): s is Rolle {
  return (ROLLEN as readonly string[]).includes(s);
}

/**
 * AB WANN DIE PERSONENSUCHE UEBERHAUPT ABRUFT (Verzeichnis-Autofill, 2026-08-15). Unter zwei
 * Zeichen ist jede Antwort eine halbe Mitgliederliste, und der Nutzen ist null. Dieselbe Zahl liest
 * die Client-Insel (`_ui/PersonenFormular.tsx`, sie tippt gar nicht erst los) UND die Server-Action
 * (`actions.ts`s `personenSucheAction`, sie glaubt der Insel nicht) — zwei Fassungen liefen
 * auseinander, und die zweite waere die, die wirklich zaehlt.
 */
export const PERSONEN_SUCHE_MIN_ZEICHEN = 2;

/**
 * Wie viele Treffer die Personensuche hoechstens ueber die RSC-Grenze schickt.
 *
 * DATENSPARSAMKEIT, wie bei `feedback/_lib/personen.ts`s `SUCHE_MAX_TREFFER`: der vollstaendige
 * Verzeichnisabzug bleibt im Serverprozess. Pro Anschlag gehen hoechstens so viele Personen an den
 * Browser, und nur an eine koordinierende Anmeldung. 20 ist die Zahl, die in eine Auswahlliste
 * passt; wer mehr Treffer hat, hat zu kurz getippt.
 */
export const PERSONEN_SUCHE_MAX_TREFFER = 20;
