/**
 * Die Regeln einer Meldung ohne Datenbank: Eingabe, Laufzeiten und die Uhrzeit des Countdowns. Eigene
 * Datei, weil auch die Verwaltung im Browser sie braucht (Vorschau des Entwurfs); `meldungen.ts` zieht
 * Drizzle mit.
 */
import { z } from "zod";
import { tagesGrenzenInZone, zeitFormat } from "@/core/zeit";
import type { KategorieDTO } from "./kategorieRegeln";

export const MELDUNG_MAX_ZEICHEN = 80;
/** Mehr passt nicht übereinander, ohne die Karte zu verdrängen: so viele zeigt der Monitor höchstens. */
export const MELDUNGEN_MAX_AKTIV = 3;
/** So viele Meldungen dürfen laufen oder geplant sein; am Monitor stehen davon höchstens `MELDUNGEN_MAX_AKTIV`. */
export const MELDUNGEN_MAX_GEPLANT = 20;

export const MINUTE = 60_000;
export const STUNDE = 60 * MINUTE;

/** Die wählbaren Laufzeiten in Minuten, fein zwischen zehn Minuten und ein paar Stunden; ohne Ablauf geht es nicht. */
export const LAUFZEITEN = [
  { minuten: 10, text: "10 Minuten" },
  { minuten: 15, text: "15 Minuten" },
  { minuten: 20, text: "20 Minuten" },
  { minuten: 30, text: "30 Minuten" },
  { minuten: 45, text: "45 Minuten" },
  { minuten: 60, text: "1 Stunde" },
  { minuten: 90, text: "1½ Stunden" },
  { minuten: 120, text: "2 Stunden" },
  { minuten: 180, text: "3 Stunden" },
  { minuten: 240, text: "4 Stunden" },
  { minuten: 360, text: "6 Stunden" },
  { minuten: 480, text: "8 Stunden" },
  { minuten: 720, text: "12 Stunden" },
  { minuten: 1440, text: "1 Tag" },
  { minuten: 4320, text: "3 Tage" },
  { minuten: 10080, text: "7 Tage" },
] as const;
export const LAUFZEIT_VORGABE = 1440;
const LAUFZEIT_WERTE = LAUFZEITEN.map((l) => l.minuten) as number[];

export interface MeldungDTO {
  id: string;
  text: string;
  zeitpunkt: string | null;
  /** Ab wann der Monitor sie zeigt; `null` ab dem Anlegen. */
  anzeigenAb: string | null;
  /** Das Ende der Laufzeit. Wann sie wirklich verschwindet, sagt `endeVon` (die Kategorie kann früher beenden). */
  ablaufAm: string;
  angelegtAm: string;
  angelegtVon: string;
  /** `null` bei Meldungen von vor den Kategorien oder deren Kategorie gelöscht ist. */
  kategorie: KategorieDTO | null;
}

const UHRZEIT = /^(|([01]\d|2[0-3]):[0-5]\d)$/;

export const meldungEingabe = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Bitte einen Text angeben, etwa „Nächste Lagebesprechung“.")
    .max(MELDUNG_MAX_ZEICHEN, `Höchstens ${MELDUNG_MAX_ZEICHEN} Zeichen, sonst passt es nicht in eine Zeile.`),
  /** Leer: kein Countdown. Sonst `HH:MM` in der Suite-Zone, die nächste solche Uhrzeit. */
  uhrzeit: z.string().trim().regex(UHRZEIT, "Bitte als Uhrzeit angeben, etwa 14:30.").default(""),
  /** Leer: sofort. Sonst `HH:MM` in der Suite-Zone (`planeMeldung`). */
  anzeigenAb: z.string().trim().regex(UHRZEIT, "Bitte als Uhrzeit angeben, etwa 13:45.").default(""),
  /** Leer: ohne Kategorie, am Monitor eine schlichte „Meldung“. */
  kategorieId: z.string().max(64).nullable().default(null),
  laufzeitMinuten: z.number().refine((n) => LAUFZEIT_WERTE.includes(n), "Bitte eine Laufzeit wählen.").default(LAUFZEIT_VORGABE),
});
export type MeldungEingabe = z.input<typeof meldungEingabe>;

const TAG = zeitFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
const UHR = zeitFormat("de-DE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function minutenAus(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** `HH:MM` an diesem Kalendertag der Suite-Zone; eine Zeitumstellung am selben Tag ist berücksichtigt. */
function anTag(tag: string, hhmm: string): number {
  const soll = minutenAus(hhmm);
  const naeherung = tagesGrenzenInZone(tag).von + soll * 60_000;
  const ist = minutenAus(UHR.format(naeherung));
  return naeherung + (soll - ist) * 60_000;
}

/** Die nächste Uhrzeit `HH:MM` in der Suite-Zone ab `jetzt`: heute, oder morgen, wenn sie schon vorbei ist. */
export function naechsteUhrzeit(hhmm: string, jetzt: Date): Date {
  const heute = TAG.format(jetzt);
  const t = anTag(heute, hhmm);
  if (t > jetzt.getTime()) return new Date(t);
  const morgen = TAG.format(tagesGrenzenInZone(heute).bis + 1);
  return new Date(anTag(morgen, hhmm));
}

/** `HH:MM` in der Suite-Zone zum letzten Mal bis einschließlich `ziel`: am Tag von `ziel` oder am Vortag. */
export function letzteUhrzeitBis(hhmm: string, ziel: Date): Date {
  const tag = TAG.format(ziel);
  const t = anTag(tag, hhmm);
  if (t <= ziel.getTime()) return new Date(t);
  const vortag = TAG.format(tagesGrenzenInZone(tag).von - 1);
  return new Date(anTag(vortag, hhmm));
}

/** Countdown, Beginn und Ende der Laufzeit einer neuen Meldung. */
export interface Plan {
  zeitpunkt: Date | null;
  /** `null`: sofort. */
  anzeigenAb: Date | null;
  ablaufAm: Date;
}

/**
 * Wann eine neue Meldung läuft. Mit Countdown gilt „Anzeigen ab“ vor der Uhrzeit: Besprechung um 14:00,
 * anzeigen ab 13:00 — ist 13:00 schon vorbei, erscheint sie sofort. Ohne Countdown ist „Anzeigen ab“ die
 * nächste solche Uhrzeit. Die Laufzeit zählt ab dem Beginn.
 */
export function planeMeldung(e: { uhrzeit: string; anzeigenAb: string; laufzeitMinuten: number }, jetzt: Date): Plan {
  const zeitpunkt = e.uhrzeit === "" ? null : naechsteUhrzeit(e.uhrzeit, jetzt);
  let ab: Date | null = null;
  if (e.anzeigenAb !== "") ab = zeitpunkt ? letzteUhrzeitBis(e.anzeigenAb, zeitpunkt) : naechsteUhrzeit(e.anzeigenAb, jetzt);
  const anzeigenAb = ab && ab.getTime() > jetzt.getTime() ? ab : null;
  const beginn = anzeigenAb ?? jetzt;
  return { zeitpunkt, anzeigenAb, ablaufAm: new Date(beginn.getTime() + e.laufzeitMinuten * MINUTE) };
}

type Zeitlich = Pick<MeldungDTO, "zeitpunkt" | "anzeigenAb" | "ablaufAm" | "angelegtAm"> & { kategorie: Pick<KategorieDTO, "verschwindenMinuten"> | null };

/** Ab wann eine Meldung am Monitor stehen darf (ms). */
export function beginnVon(m: Zeitlich): number {
  return Date.parse(m.anzeigenAb ?? m.angelegtAm);
}

/**
 * Wann eine Meldung verschwindet (ms): am Ende der Laufzeit, oder — hat ihre Kategorie es so eingestellt —
 * schon so viele Minuten nach der Countdown-Uhrzeit. Eine geänderte Kategorie wirkt so auch auf laufende.
 */
export function endeVon(m: Zeitlich): number {
  const ablauf = Date.parse(m.ablaufAm);
  const nach = m.kategorie?.verschwindenMinuten ?? null;
  if (m.zeitpunkt === null || nach === null) return ablauf;
  return Math.min(ablauf, Date.parse(m.zeitpunkt) + nach * MINUTE);
}

/**
 * Hat sie begonnen? Ohne „Anzeigen ab“ immer: die Uhr der Verwaltung tickt nur alle 30 Sekunden und läge
 * sonst kurz vor dem Anlegen.
 */
export function begonnen(m: Pick<MeldungDTO, "anzeigenAb">, jetzt: number): boolean {
  return m.anzeigenAb === null || Date.parse(m.anzeigenAb) <= jetzt;
}

/** Noch nicht vorbei: läuft gerade oder ist geplant. */
export function offen<T extends Zeitlich>(liste: T[], jetzt: number): T[] {
  return liste.filter((m) => endeVon(m) > jetzt);
}

/**
 * Was der Monitor jetzt zeigt: die begonnenen, nicht abgelaufenen Meldungen, die früher begonnene oben, höchstens
 * `MELDUNGEN_MAX_AKTIV`. Eine weitere wartet, bis ein Platz frei wird. Erwartet die Liste nach Beginn sortiert.
 */
export function sichtbar<T extends Zeitlich>(liste: T[], jetzt: number): T[] {
  return liste.filter((m) => begonnen(m, jetzt) && endeVon(m) > jetzt).slice(0, MELDUNGEN_MAX_AKTIV);
}
