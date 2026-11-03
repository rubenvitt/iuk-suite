import { zeitFormat } from "@/core/zeit";

/** Kalendertag `JJJJ-MM-TT` des Zeitpunkts in der Suite-Zone (je Aufruf, nie auf Modulebene eingefroren). */
export function tagInZone(ms: number): string {
  return zeitFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

export const heute = (): string => tagInZone(Date.now());
