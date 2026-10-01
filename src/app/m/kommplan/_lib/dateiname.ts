import type { Papierformat } from "./layout/typen";

const ERSATZ: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", Ä: "Ae", Ö: "Oe", Ü: "Ue", ß: "ss" };

/**
 * ASCII-sicherer Teil eines Dateinamens (Entscheidung 15): Umlaute ausgeschrieben, Diakritika weg, alles außer
 * A–Z a–z 0–9 zu einem Bindestrich, höchstens `max` Zeichen, ohne Bindestrich am Rand. Kann leer werden.
 */
export function asciiTeil(text: string, max = 60): string {
  return text.replace(/[äöüÄÖÜß]/g, (c) => ERSATZ[c])
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, max).replace(/-+$/, "");
}

export function svgDateiname(p: { titel: string; tag: string; blatt: number; von: number; format: Papierformat }): string {
  const titel = asciiTeil(p.titel) || "kommunikationsplan";
  return `${titel}_${p.tag}_blatt-${p.blatt}-von-${p.von}_${p.format === "a3-quer" ? "a3" : "a4"}.svg`;
}
