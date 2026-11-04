import { LAENGE, type PlanInhalt, type PlanVerweis } from "./schema";

/** Ein Plan, auf den eine Stelle verweisen kann (IDA-355): Auswahl im Flyin. */
export interface PlanZiel { id: string; titel: string }

/** Die Kennungen aller Pläne, auf die dieser Plan verweist — ohne Doppel. */
export function verweisIds(inhalt: PlanInhalt): string[] {
  return [...new Set(inhalt.stellen.flatMap((s) => (s.planVerweis ? [s.planVerweis.id] : [])))];
}

/** Der Verweis, wie er ins Dokument kommt: Titel auf die Feldgrenze gekürzt, damit Wählen nie in einen Schemafehler läuft. */
export function verweisAuf(ziel: PlanZiel): PlanVerweis {
  return { id: ziel.id, titel: ziel.titel.slice(0, LAENGE.titel) };
}
