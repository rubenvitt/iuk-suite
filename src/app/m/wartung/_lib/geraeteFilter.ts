/**
 * DIE FILTER DER GERÄTELISTE (IDA-381) — `?frist=` und `?zustand=`, damit jede Kennzahl der Übersicht auf
 * genau die Geräte führt, die sie zählt. Die Übersicht zählt mit DENSELBEN Prädikaten, die die Liste filtert;
 * zwei Fassungen liefen auseinander. Kein `"use client"` (Falle 6): Server- und Client-Seite lesen sie.
 *
 * Die Frist-Kennzahlen zählen GERÄTE, nicht Fristen: ein Gerät mit zwei überfälligen Fristen ist eine Zeile
 * der Liste. Eingeordnet wird nach der dringendsten Frist (`naechste`, `fristen.ts`), also nach dem Chip in
 * der Spalte „Nächste Frist“ — „bald“ heißt: nichts überfällig, aber etwas bald.
 */
import type { Stufe, Zustand } from "./fristen";

export type FristFilter = Exclude<Stufe, "ok">;

export interface GeraeteFilter {
  frist: FristFilter | null;
  zustand: Zustand | null;
}

const FRISTEN: readonly FristFilter[] = ["ueberfaellig", "bald"];
const ZUSTAENDE: readonly Zustand[] = ["ok", "mangel", "defekt"];

const einer = (p: string | string[] | undefined): string | undefined => (Array.isArray(p) ? p[0] : p);

/** Unbekannte Werte fallen still auf „kein Filter“ zurück. */
export function geraeteFilterAus(params: Record<string, string | string[] | undefined>): GeraeteFilter {
  const frist = einer(params.frist);
  const zustand = einer(params.zustand);
  return {
    frist: FRISTEN.find((f) => f === frist) ?? null,
    zustand: ZUSTAENDE.find((z) => z === zustand) ?? null,
  };
}

type Zeile = { naechste: { stufe: Stufe } | null; zustand: Zustand };

export function passtGeraet(g: Zeile, f: GeraeteFilter): boolean {
  return (f.frist === null || g.naechste?.stufe === f.frist) && (f.zustand === null || g.zustand === f.zustand);
}

/** Die Adresse der gefilterten Liste; `gruppe` bleibt erhalten. */
export function geraeteHref(f: Partial<GeraeteFilter> & { gruppe?: string | null }): string {
  const q = new URLSearchParams();
  if (f.gruppe) q.set("gruppe", f.gruppe);
  if (f.frist) q.set("frist", f.frist);
  if (f.zustand) q.set("zustand", f.zustand);
  const s = q.toString();
  return s ? `/geraete?${s}` : "/geraete";
}

/** Einzahl oder Mehrzahl zur Zahl — „1 Gerät“, „0 Geräte“, „2 Geräte“. */
export const zahlwort = (n: number, einzahl: string, mehrzahl: string): string => (n === 1 ? einzahl : mehrzahl);
