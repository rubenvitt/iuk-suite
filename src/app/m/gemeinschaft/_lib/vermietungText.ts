import { tagesGrenzenInZone, zeitFormat } from "@/core/zeit";
import { tagInZone, uhrInZone } from "./zeit";

/**
 * Wörter und Zeitangaben der Vermietung, für Server und Browser (kein `"use client"`, Falle 6). Formatiert wird
 * in der Suite-Zone (`core/zeit`), aufgelöst je Aufruf — die Formatierer auf Modulebene frieren keine Zone ein.
 */

export const ZUSTAND_TEXT = {
  angefragt: "Angefragt",
  zugesagt: "Zugesagt",
  gesperrt: "Gesperrt",
  abgelehnt: "Abgelehnt",
  zurueckgezogen: "Zurückgezogen",
} as const;

export const VERTRAG_TEXT = { offen: "Vertrag offen", verschickt: "Vertrag verschickt", unterschrieben: "Vertrag unterschrieben" } as const;
export type VertragStand = keyof typeof VERTRAG_TEXT;

const TAG_KURZ = zeitFormat("de-DE", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const TAG_LANG = zeitFormat("de-DE", { weekday: "long", day: "numeric", month: "long" });
const TAG_LANG_JAHR = zeitFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const MONAT = zeitFormat("de-DE", { month: "long", year: "numeric" });
const EINGANG = zeitFormat("de-DE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Mittag eines Kalendertags in der Suite-Zone — ein Zeitpunkt, der sicher auf diesem Tag liegt. */
const mittag = (isoTag: string): number => tagesGrenzenInZone(isoTag).von + 12 * 3_600_000;

/** „Sonntag, 1. November“ (mit `jahr`: „… 2026“). */
export const tagText = (isoTag: string, jahr = false): string => (jahr ? TAG_LANG_JAHR : TAG_LANG).format(mittag(isoTag));

/** „November 2026“ für den Monat `JJJJ-MM`. */
export const monatText = (monat: string): string => MONAT.format(mittag(`${monat}-15`));

/** Eingangszeitpunkt einer Anfrage, „1. Nov. 2026, 14:05 Uhr“. */
export const eingangText = (ms: number): string => `${EINGANG.format(ms)} Uhr`;

/**
 * Ein Zeitraum in Worten, drei Formen (aus dem POC): am selben Tag „Sa., 7. Nov. 2026, 18:00–23:00 Uhr“; über
 * Mitternacht bis in den frühen Morgen „…, 19:00–00:30 Uhr (bis in die Nacht)“; sonst Beginn und Ende ausgeschrieben.
 */
export function zeitraumText(von: number, bis: number): string {
  const tagA = TAG_KURZ.format(von);
  const a = tagInZone(von);
  const b = tagInZone(bis - 1);
  if (a === b) return `${tagA}, ${uhrInZone(von)}–${bis - 1 === tagesGrenzenInZone(a).bis ? "24:00" : uhrInZone(bis)} Uhr`;
  const folgetag = tagesGrenzenInZone(a).bis + 1;
  if (tagInZone(bis) === tagInZone(folgetag) && bis - folgetag <= 8 * 3_600_000) {
    return `${tagA}, ${uhrInZone(von)}–${uhrInZone(bis)} Uhr (bis in die Nacht)`;
  }
  return `${tagA}, ${uhrInZone(von)} Uhr – ${TAG_KURZ.format(bis)}, ${uhrInZone(bis)} Uhr`;
}
