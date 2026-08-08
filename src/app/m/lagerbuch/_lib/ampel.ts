import type { AmpelTon } from "./format";

/** Die fachsemantische Palette des Lagerbuchs; sie ist kein Suite-Theme. */
export type AmpelPaar = { readonly text: string; readonly flaeche: string };

export const AMPEL_HELL: Readonly<Record<AmpelTon, AmpelPaar>> = {
  ok: { text: "#1e7a3c", flaeche: "#e4f2e9" },
  gelb: { text: "#8a5200", flaeche: "#fbf1dc" },
  rot: { text: "#8c0d16", flaeche: "#f6e3e0" },
  grau: { text: "#5b6570", flaeche: "#e7eaec" },
} as const;

/** Der Umschalter ist `data-theme`, nie die Systemfarbabfrage. */
export const AMPEL_DUNKEL: Readonly<Record<AmpelTon, AmpelPaar>> = {
  ok: { text: "#7ee0a0", flaeche: "#10261a" },
  gelb: { text: "#d9a032", flaeche: "#2a1e05" },
  rot: { text: "#e8837c", flaeche: "#2a1113" },
  grau: { text: "#9aa4ad", flaeche: "#1c2024" },
} as const;

/** `grau` bedeutet keine Messung und steht deshalb außerhalb der Rangfolge. */
export const AMPEL_RANG = ["ok", "gelb", "rot"] as const satisfies readonly AmpelTon[];

export function ampelVar(ton: AmpelTon, rolle: "text" | "flaeche"): string {
  return `--lb-ampel-${ton}-${rolle}`;
}
