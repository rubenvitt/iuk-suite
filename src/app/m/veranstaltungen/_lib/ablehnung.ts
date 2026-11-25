import { auditDenied } from "@/core/audit/server";
import { AblehnungsDrossel } from "@/core/audit/drossel";

/**
 * Obergrenze für Audit-Zeilen abgelehnter Abholungen durch Lifeline Hub (`api/abruf`, LLH-2097). Ein
 * Adapter mit widerrufenem Schlüssel fragt weiter in seinem Takt; wie beim Lagemonitor
 * (`lagemonitor/_lib/ablehnung.ts`) höchstens `ABHOLUNG_AUDIT_ABLEHNUNGEN_PRO_STUNDE` einzelne Zeilen je Stunde, dann
 * EINE `access_throttled` als Spur eines Scans. Die Antwort (401) ändert das nicht.
 */
export const ABHOLUNG_AUDIT_ABLEHNUNGEN_PRO_STUNDE = 5;

let drossel = neueDrossel();
function neueDrossel(): AblehnungsDrossel {
  return new AblehnungsDrossel({ max: ABHOLUNG_AUDIT_ABLEHNUNGEN_PRO_STUNDE, windowMs: 60 * 60_000 });
}

export function abholungAbgelehnt(): void {
  const entscheid = drossel.entscheiden();
  if (entscheid === "einzeln") auditDenied("veranstaltungen");
  else if (entscheid === "gedrosselt") auditDenied("veranstaltungen", { kind: "anonymous" }, "access_throttled");
}

/** Nur für Tests: frisches Fenster. */
export function abholungDrosselZuruecksetzen(): void {
  drossel = neueDrossel();
}
