import type { SymbolSpec } from "@einsatzzeichen/schema";

/**
 * Die Feldreihenfolge des kanonischen Schluessels. HANDGESCHRIEBEN, und deshalb
 * von `kanon.test.ts` gegen die tatsaechlich in den Rezepten vorkommenden Felder
 * gehalten: ein neues SymbolSpec-Feld wuerde sonst still weggelassen, und zwei
 * verschiedene Zeichen bekaemen denselben Schluessel.
 *
 * ⚠️ Das ist ein REINER TYPIMPORT aus @einsatzzeichen/schema. Er verschwindet im
 * Build und zaehlt deshalb in `naht.test.ts` nicht als Katalog-Import.
 */
export const ORDNUNG = [
  "kind",
  "bodyVariant",
  "organization",
  "technicalFill",
  "strength",
  "technicalHeadMark",
  "administrativeLevel",
  "functionRole",
  "vehicleCategory",
  "capabilities",
  "bodyMarks",
  "designation",
  "labels",
] as const;

/**
 * Ein stabiler Schluessel fuer eine Zusammenstellung. Vier Regeln:
 * undefined/null/"" weglassen · leere Arrays weglassen · Arrays sortieren ·
 * Felder in fester Reihenfolge serialisieren, `labels`-Zonen alphabetisch.
 *
 * GEMESSEN kollisionsfrei ueber alle 232 Hauptrezepte.
 */
export function kanonischerSchluessel(spec: SymbolSpec): string {
  const teile: string[] = [];
  for (const feld of ORDNUNG) {
    const wert = (spec as unknown as Record<string, unknown>)[feld];
    if (wert === undefined || wert === null || wert === "") continue;
    if (Array.isArray(wert)) {
      if (wert.length === 0) continue;
      teile.push(`${feld}=${[...wert].map(String).sort().join(",")}`);
      continue;
    }
    if (typeof wert === "object") {
      const zonen = Object.entries(wert as Record<string, unknown>)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${String(v)}`);
      if (zonen.length === 0) continue;
      teile.push(`${feld}={${zonen.join(",")}}`);
      continue;
    }
    teile.push(`${feld}=${String(wert)}`);
  }
  return teile.join("|");
}
