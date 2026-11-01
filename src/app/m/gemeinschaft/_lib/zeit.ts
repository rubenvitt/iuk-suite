import { tagesGrenzenInZone, zeitFormat } from "@/core/zeit";

/**
 * Wanduhr der Suite-Zone für Events, Sperrzeiten und Anfragen. Gespeichert wird in Millisekunden, eingegeben
 * und angezeigt in der Zone aus `core/zeit` (nie ein Literal, nie auf Modulebene eingefroren).
 */

/** Kalendertag `JJJJ-MM-TT` des Zeitpunkts `ms` in der Suite-Zone. */
export function tagInZone(ms: number): string {
  return zeitFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

/** Uhrzeit `HH:MM` des Zeitpunkts `ms` in der Suite-Zone. */
export function uhrInZone(ms: number): string {
  return zeitFormat("de-DE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);
}

/** Kalendertag plus `n` Tage (Kalenderrechnung, keine 24-Stunden-Schritte). */
export function plusTage(isoTag: string, n: number): string {
  const [j, m, t] = isoTag.split("-").map(Number);
  return new Date(Date.UTC(j, m - 1, t + n)).toISOString().slice(0, 10);
}

/** Wochentag eines Kalendertags, 0 = Sonntag … 6 = Samstag. */
export function wochentag(isoTag: string): number {
  const [j, m, t] = isoTag.split("-").map(Number);
  return new Date(Date.UTC(j, m - 1, t)).getUTCDay();
}

/**
 * Zeitpunkt für „Tag `isoTag`, Uhr `hhmm`“ in der Suite-Zone. An einem Tag mit Zeitumstellung wird über die
 * angezeigte Uhr nachgeregelt; eine Uhrzeit, die es nicht gibt (Sprung vorwärts), landet eine Stunde später.
 */
export function zeitpunkt(isoTag: string, hhmm: string): number {
  const [h, min] = hhmm.split(":").map(Number);
  const soll = h * 60 + min;
  let ms = tagesGrenzenInZone(isoTag).von + soll * 60_000;
  for (let i = 0; i < 2; i++) {
    if (tagInZone(ms) !== isoTag) break;
    const [ih, im] = uhrInZone(ms).split(":").map(Number);
    const diff = soll - (ih * 60 + im);
    if (diff === 0) break;
    ms += diff * 60_000;
  }
  return ms;
}
