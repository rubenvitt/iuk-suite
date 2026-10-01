import type { PlanInhalt } from "../plan/schema";
import type { Symbolquelle, ZeichenIndexEintrag } from "./grundlagen";
import roh from "./zeichen.generiert.json";
import rohSw from "./zeichen-sw.generiert.json";

/**
 * NUR SERVER. Das Rezept-Generat ist groß (alle Zeichen als fertiges SVG); ein Client-Import zöge es
 * in jedes Bündel. Der Betrachter bekommt `symboleFuer(plan)` als Prop (`grenze.test.ts` hält das).
 */
interface Eintrag extends Symbolquelle { titel: string; suchtext: string }
const ZEICHEN = roh.zeichen as unknown as Readonly<Record<string, Eintrag>>;
/** Derselbe Satz im Druckthema (Phase 5, Entscheidung 14) — nur für Druck und SVG-Export, nie für den Bildschirm. */
const ZEICHEN_SW = rohSw.zeichen as unknown as Readonly<Record<string, Symbolquelle>>;
export interface SymbolOptionen { schwarzweiss?: boolean }

export function findeZeichen(schluessel: string): Eintrag | null {
  return Object.prototype.hasOwnProperty.call(ZEICHEN, schluessel) ? ZEICHEN[schluessel] : null;
}

export function symboleFuer(inhalt: PlanInhalt, optionen: SymbolOptionen = {}): Record<string, Symbolquelle> {
  return symboleFuerSchluessel(inhalt.stellen.flatMap((s) => [s.zeichen, ...s.einheiten.map((e) => e.zeichen)]).filter((k): k is string => k !== null), optionen);
}

export function symboleFuerSchluessel(schluessel: readonly string[], optionen: SymbolOptionen = {}): Record<string, Symbolquelle> {
  return Object.fromEntries(
    [...new Set(schluessel)].sort().flatMap((k) => {
      const e = findeZeichen(k);
      if (!e) return [];
      const q = optionen.schwarzweiss && Object.prototype.hasOwnProperty.call(ZEICHEN_SW, k) ? ZEICHEN_SW[k] : e;
      return [[k, { viewBox: q.viewBox, inhalt: q.inhalt }]];
    }),
  );
}

/** Der Index für die Suche im Editor: rund 20 KB statt rund 220 KB, weil ohne SVG. */
export function zeichenIndex(): ZeichenIndexEintrag[] {
  return Object.keys(ZEICHEN)
    .map((k) => ({ schluessel: k, titel: ZEICHEN[k].titel, suchtext: ZEICHEN[k].suchtext }))
    .sort((a, b) => a.titel.localeCompare(b.titel, "de") || (a.schluessel < b.schluessel ? -1 : 1));
}
