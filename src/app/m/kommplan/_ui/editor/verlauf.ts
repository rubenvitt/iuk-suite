import type { PlanInhalt } from "../../_lib/plan/schema";

/**
 * RÜCKGÄNGIG/WIEDERHOLEN (Spec §6.6): ein Stapel von Dokumenten, gültig bis zum Neuladen. Weil jede
 * Planoperation ein NEUES Objekt liefert, ist „dasselbe Objekt" gleichbedeutend mit „keine
 * Änderung" — der Speicherer (`speicherer.ts`) nutzt dieselbe Gleichheit.
 *
 * BÜNDELN: Änderungen mit demselben Schlüssel (z. B. `titel:<stelle>`) innerhalb von `BUENDEL_MS`
 * seit der LETZTEN solchen Änderung sind ein Schritt — sonst wäre jeder Tastendruck im Titelfeld
 * ein eigener Rückgängig-Schritt.
 */
export interface Verlauf {
  vergangen: readonly PlanInhalt[];
  jetzt: PlanInhalt;
  zukunft: readonly PlanInhalt[];
  buendel: { schluessel: string; bis: number } | null;
}
export const VERLAUF_TIEFE = 200;
export const BUENDEL_MS = 1500;

export function neuerVerlauf(inhalt: PlanInhalt): Verlauf {
  return { vergangen: [], jetzt: inhalt, zukunft: [], buendel: null };
}

export function tue(v: Verlauf, neu: PlanInhalt, jetzt: number, schluessel?: string): Verlauf {
  if (neu === v.jetzt) return v;
  const buendel = schluessel === undefined ? null : { schluessel, bis: jetzt + BUENDEL_MS };
  const weiter = schluessel !== undefined && v.buendel?.schluessel === schluessel && jetzt <= v.buendel.bis && v.vergangen.length > 0;
  if (weiter) return { vergangen: v.vergangen, jetzt: neu, zukunft: [], buendel };
  return { vergangen: [...v.vergangen, v.jetzt].slice(-VERLAUF_TIEFE), jetzt: neu, zukunft: [], buendel };
}

export function rueckgaengig(v: Verlauf): Verlauf {
  if (v.vergangen.length === 0) return v;
  return { vergangen: v.vergangen.slice(0, -1), jetzt: v.vergangen[v.vergangen.length - 1], zukunft: [v.jetzt, ...v.zukunft], buendel: null };
}

export function wiederholen(v: Verlauf): Verlauf {
  if (v.zukunft.length === 0) return v;
  return { vergangen: [...v.vergangen, v.jetzt], jetzt: v.zukunft[0], zukunft: v.zukunft.slice(1), buendel: null };
}

export const kannRueckgaengig = (v: Verlauf) => v.vergangen.length > 0;
export const kannWiederholen = (v: Verlauf) => v.zukunft.length > 0;
