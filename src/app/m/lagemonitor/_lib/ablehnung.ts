import { auditDenied } from "@/core/audit/server";
import { AblehnungsDrossel } from "@/core/audit/drossel";

/**
 * Obergrenze für Audit-Zeilen abgelehnter Abholungen (`api/konfiguration`). Ein Monitor mit
 * widerrufenem Schlüssel fragt weiter jede Minute; ungedrosselt wären das 1440 Zeilen am Tag je
 * Gerät. Deshalb ein Stundenfenster wie `AblehnungsDrossel` (`core/audit/drossel.ts`): höchstens
 * `ABHOLUNG_AUDIT_ABLEHNUNGEN_PRO_STUNDE` einzelne Zeilen, dann EINE `access_throttled` als Spur
 * eines Scans, danach still bis zum nächsten Fenster. Die Antwort (401) ändert das nicht.
 */
export const ABHOLUNG_AUDIT_ABLEHNUNGEN_PRO_STUNDE = 5;

let drossel = neueDrossel();
function neueDrossel(): AblehnungsDrossel {
  return new AblehnungsDrossel({ max: ABHOLUNG_AUDIT_ABLEHNUNGEN_PRO_STUNDE, windowMs: 60 * 60_000 });
}

export function abholungAbgelehnt(): void {
  const entscheid = drossel.entscheiden();
  if (entscheid === "einzeln") auditDenied("lagemonitor");
  else if (entscheid === "gedrosselt") auditDenied("lagemonitor", { kind: "anonymous" }, "access_throttled");
}

/** Nur für Tests: frisches Fenster. */
export function abholungDrosselZuruecksetzen(): void {
  drossel = neueDrossel();
}
