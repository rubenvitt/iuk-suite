/**
 * Adressen auf Etiketten und Links. Ohne `"use client"` (Falle 6).
 */
import { resolveHost } from "@/core/routing";

export function linkBasisAus(headers: Headers): string {
  const proto = headers.get("x-forwarded-proto")?.split(",")[0].trim() || "http";
  return `${proto}://${resolveHost(headers)}`;
}

/** Das Ortsetikett: QR nur für Lagerorte (Entscheidung 2026-11-01), die Ware trägt ihre EAN. */
export const ortZiel = (basis: string, id: string): string => `${basis}/o/${id}`;

/** Der Helfer-Link; der Code steht in der Adresse, wie auf dem Kärtchen im Lagerbuch. */
export const helferLinkZiel = (basis: string, code: string): string => `${basis}/t/${code}`;
