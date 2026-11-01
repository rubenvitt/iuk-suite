/**
 * Welche Qualifikation eine Anforderung erfüllt. Höhere Stufen einer Leiter zählen mit — eine
 * Rettungssanitäterin deckt „Sanitäter“. Erkannt wird eine Stufe am Kürzel ODER am Namen (ohne Groß-
 * und Kleinschreibung), weil die Listen in HiOrg je Kreisverband anders heißen können. Was auf keiner
 * Leiter steht, erfüllt nur sich selbst (gleiches Kürzel).
 */
import type { Quali } from "./typen";

const LEITERN: readonly (readonly (readonly [kurz: string, name: string])[])[] = [
  [["EH", "Ersthelfer"], ["SanH", "Sanitätshelfer"], ["San", "Sanitäter"], ["RS", "Rettungssanitäter"], ["RA", "Rettungsassistent"], ["NotSan", "Notfallsanitäter"]],
  [["TrF", "Truppführer"], ["GrF", "Gruppenführer"], ["ZF", "Zugführer"], ["VF", "Verbandführer"]],
  // Fahrerlaubnis (IDA-313, aus dem Helfer-Modul): C deckt C1, C1 deckt B. Anhängerklassen stehen für sich.
  [["B", "Fahrerlaubnis B"], ["C1", "Fahrerlaubnis C1"], ["C", "Fahrerlaubnis C"]],
];

const klein = (s: string) => s.trim().toLocaleLowerCase("de");

function stufe(q: Quali): { leiter: number; rang: number } | null {
  for (let l = 0; l < LEITERN.length; l++) {
    const r = LEITERN[l].findIndex(([k, n]) => klein(k) === klein(q.kurz) || klein(n) === klein(q.name));
    if (r >= 0) return { leiter: l, rang: r };
  }
  return null;
}

export function erfuellt(hat: readonly Quali[], gefordert: Quali): boolean {
  const g = stufe(gefordert);
  return hat.some((q) => {
    if (klein(q.kurz) === klein(gefordert.kurz)) return true;
    if (!g) return false;
    const s = stufe(q);
    return s !== null && s.leiter === g.leiter && s.rang >= g.rang;
  });
}

/** Strengere Anforderungen zuerst: höherer Rang einer Leiter vor niedrigerem, Leiterlose zuletzt. */
export function strenge(q: Quali): number {
  return stufe(q)?.rang ?? -1;
}

/** Alle wählbaren Qualifikationen: die Leitern plus alles, was im Bestand vorkommt, ohne Doppel. */
export function qualiKatalog(bestand: readonly Quali[]): Quali[] {
  const out = new Map<string, Quali>();
  for (const leiter of LEITERN) for (const [kurz, name] of leiter) out.set(klein(kurz), { kurz, name });
  for (const q of bestand) {
    const s = stufe(q);
    if (s) continue; // schon über die Leiter da, in deren Schreibweise
    if (!out.has(klein(q.kurz))) out.set(klein(q.kurz), { kurz: q.kurz, name: q.name });
  }
  return [...out.values()];
}

/** Eine Fahrerlaubnisklasse aus dem Helfer-Modul als Qualifikation („C1“ → „Fahrerlaubnis C1“). */
export const alsFahrerlaubnis = (klasse: string): Quali => ({ kurz: klasse, name: `Fahrerlaubnis ${klasse}` });
