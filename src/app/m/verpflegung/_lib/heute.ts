import { zeitFormat } from "@/core/zeit";

/** Kalendertag `JJJJ-MM-TT` des Zeitpunkts in der Suite-Zone (je Aufruf, nie auf Modulebene eingefroren). */
export function tagInZone(ms: number): string {
  return zeitFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

/** Stunde (0–23) des Zeitpunkts in der Suite-Zone. */
export function stundeInZone(ms: number): number {
  return Number(zeitFormat("en-GB", { hour: "2-digit", hourCycle: "h23" }).format(ms));
}

export const heute = (): string => tagInZone(Date.now());

/** „04.11., 19:15“ in der Suite-Zone. */
export function zeitText(ms: number): string {
  return zeitFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(ms);
}
