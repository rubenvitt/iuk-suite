/**
 * Was die Seiten der Verwaltung gemeinsam brauchen: Gruppenauswahl aus `?gruppe=` und die Adresse auf dem
 * QR-Etikett. Ohne `"use client"` (Falle 6).
 */
import { resolveHost } from "@/core/routing";
import type { GruppeDTO } from "./typen";
import type { Rechte } from "./zugang";

export interface GruppenAuswahl {
  /** Die Gruppen, deren Daten die Seite zeigt. */
  gruppen: string[];
  /** Für den Filter: nur bei mehr als einer verwalteten Gruppe. */
  wahl: { id: string; name: string }[];
  gewaehlt: string | null;
}

/** `?gruppe=` filtert auf eine der eigenen Gruppen; eine fremde Kennung fällt still auf „alle eigenen“ zurück. */
export function gruppenAuswahl(rechte: Rechte, alle: readonly GruppeDTO[], param: string | string[] | undefined): GruppenAuswahl {
  const eigene = alle.filter((g) => rechte.gruppen.includes(g.id));
  const gewaehlt = typeof param === "string" && eigene.some((g) => g.id === param) ? param : null;
  return {
    gruppen: gewaehlt ? [gewaehlt] : eigene.map((g) => g.id),
    wahl: eigene.length > 1 ? eigene.map((g) => ({ id: g.id, name: g.name })) : [],
    gewaehlt,
  };
}

export function linkBasisAus(headers: Headers): string {
  const proto = headers.get("x-forwarded-proto")?.split(",")[0].trim() || "http";
  return `${proto}://${resolveHost(headers)}`;
}

/** Ein Code je Gerät; er bleibt gleich, wenn das Gerät umzieht. */
export const qrZiel = (basis: string, id: string): string => `${basis}/g/${id}`;
