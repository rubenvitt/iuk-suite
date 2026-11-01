/**
 * Brücke zwischen antds Datumsfeldern und der Suite-Zone (Bauart `schichtplan/_ui/datum.ts`). Ein `Dayjs`
 * rechnet in der Zone des Browsers; hier ist er nur Wanduhr („Fr 13.11. 18:00“) und wird über `_lib/zeit.ts`
 * in Millisekunden der Suite-Zone umgerechnet. So zeigt ein Browser in einer anderen Zone dieselben Uhrzeiten.
 *
 * `dayjs/locale/de`: die Wochentagsspalten von Datumsfeld und Kalender kommen aus dayjs' eigener Locale, nicht
 * aus antds `de_DE` — ohne den Import beginnt die Woche am Sonntag (Begründung in `aufgaben/_ui/Felder.tsx`).
 */
import dayjs, { type Dayjs } from "dayjs";
import "dayjs/locale/de";
import { tagInZone, uhrInZone, zeitpunkt } from "../../_lib/zeit";

export function alsDayjs(ms: number): Dayjs {
  return dayjs(`${tagInZone(ms)}T${uhrInZone(ms)}`);
}

export function ausDayjs(d: Dayjs): number {
  return zeitpunkt(d.format("YYYY-MM-DD"), d.format("HH:mm"));
}

/** Kalendertag `JJJJ-MM-TT` ↔ `Dayjs` (ohne Uhrzeit, ohne Zone). */
export const tagAlsDayjs = (iso: string): Dayjs => dayjs(iso);
export const tagAusDayjs = (d: Dayjs): string => d.format("YYYY-MM-DD");
