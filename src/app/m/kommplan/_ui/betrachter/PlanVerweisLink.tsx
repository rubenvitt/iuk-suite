import type { KarteL } from "../../_lib/layout/typen";

/**
 * Der Verweis einer Karte auf einen anderen Plan als Link (IDA-355) — Betrachter und Editor. Nur, wenn der Server ihn für
 * diesen Betrachter als erreichbar gemeldet hat; die Zeile selbst zeichnet `Karte`, auch im Druck und in der Token-Ansicht.
 */
export function PlanVerweisLink({ k, erreichbar }: { k: KarteL; erreichbar: ReadonlySet<string> }) {
  const v = k.planVerweis;
  if (!v || !erreichbar.has(v.planId)) return null;
  return (
    <a href={`/p/${encodeURIComponent(v.planId)}`} data-planverweis={v.planId} aria-label={`Plan öffnen: ${v.zeile.text.replace(/^→\s*/, "")}`}>
      <rect y={v.y} width={k.breite} height={v.hoehe} fill="transparent" style={{ cursor: "pointer" }} />
    </a>
  );
}
