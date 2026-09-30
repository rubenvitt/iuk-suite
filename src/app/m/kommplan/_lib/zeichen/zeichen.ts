import type { PlanInhalt } from "../plan/schema";
import type { Symbolquelle } from "./grundlagen";
import roh from "./zeichen.generiert.json";

/**
 * NUR SERVER. Das Rezept-Generat ist groß (alle Zeichen als fertiges SVG); ein Client-Import zöge es
 * in jedes Bündel. Der Betrachter bekommt `symboleFuer(plan)` als Prop (`grenze.test.ts` hält das).
 */
interface Eintrag extends Symbolquelle { titel: string; suchtext: string }
const ZEICHEN = roh.zeichen as unknown as Readonly<Record<string, Eintrag>>;
export const ZEICHEN_STAND = roh.stand;

export function findeZeichen(schluessel: string): Eintrag | null {
  return Object.prototype.hasOwnProperty.call(ZEICHEN, schluessel) ? ZEICHEN[schluessel] : null;
}

export function symboleFuer(inhalt: PlanInhalt): Record<string, Symbolquelle> {
  const schluessel = new Set<string>();
  for (const s of inhalt.stellen) {
    if (s.zeichen) schluessel.add(s.zeichen);
    for (const e of s.einheiten) if (e.zeichen) schluessel.add(e.zeichen);
  }
  return Object.fromEntries(
    [...schluessel].sort().flatMap((k) => {
      const e = findeZeichen(k);
      return e ? [[k, { viewBox: e.viewBox, inhalt: e.inhalt }]] : [];
    }),
  );
}
