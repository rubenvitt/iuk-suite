import type { PlanInhalt } from "../plan/schema";
import type { Symbolquelle, ZeichenIndexEintrag } from "./grundlagen";
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
  return symboleFuerSchluessel(inhalt.stellen.flatMap((s) => [s.zeichen, ...s.einheiten.map((e) => e.zeichen)]).filter((k): k is string => k !== null));
}

export function symboleFuerSchluessel(schluessel: readonly string[]): Record<string, Symbolquelle> {
  return Object.fromEntries(
    [...new Set(schluessel)].sort().flatMap((k) => {
      const e = findeZeichen(k);
      return e ? [[k, { viewBox: e.viewBox, inhalt: e.inhalt }]] : [];
    }),
  );
}

/** Der Index für die Suche im Editor: rund 20 KB statt rund 220 KB, weil ohne SVG. */
export function zeichenIndex(): ZeichenIndexEintrag[] {
  return Object.keys(ZEICHEN)
    .map((k) => ({ schluessel: k, titel: ZEICHEN[k].titel, suchtext: ZEICHEN[k].suchtext }))
    .sort((a, b) => a.titel.localeCompare(b.titel, "de") || (a.schluessel < b.schluessel ? -1 : 1));
}
