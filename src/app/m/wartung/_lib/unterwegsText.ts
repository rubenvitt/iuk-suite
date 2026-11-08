import { zeitFormat } from "@/core/zeit";
import type { OffeneEntnahme, Unterwegs } from "./unterwegs";

const TAG = zeitFormat("de-DE", { day: "2-digit", month: "2-digit" });

/** „07.11.“ in der Anzeigezone der Suite. */
export const seitText = (ms: number): string => TAG.format(ms);

function eine(e: OffeneEntnahme, mitNamen: boolean): string {
  // Der Zweck steht wie der Name nur mit Anmeldung da (Entscheidung IDA-372).
  const rest = [`seit ${seitText(e.seit)}`, ...(mitNamen ? [e.zweck, e.wer] : [])].filter(Boolean);
  const teile = e.positionen.filter((p) => p.offen > 0).map((p) => `${p.offen} × ${p.text}`).join(", ");
  const kopf = e.ganz ? "Ganze Kiste unterwegs" : `Unterwegs: ${teile}`;
  return `${kopf} – ${rest.join(", ")}`;
}

/** Eine Zeile für den Steckbrief; `null`, wenn nichts unterwegs ist. Ohne Anmeldung ohne Name und Zweck. */
export function unterwegsText(u: Unterwegs, mitNamen: boolean): string | null {
  return u.entnahmen.length ? u.entnahmen.map((e) => eine(e, mitNamen)).join(" · ") : null;
}
