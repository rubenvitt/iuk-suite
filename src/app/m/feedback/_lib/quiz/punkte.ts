// Wertung einer Antwort. Reine Funktionen, kein "use client" (Falle 6, `CLAUDE.md`).
import type { QuizFrage } from "./fragen";

/** Mehrfachauswahl zählt nur, wenn die gewählte Menge genau der richtigen entspricht. */
export function istRichtig(frage: QuizFrage, gewaehlt: number[]): boolean {
  const g = new Set(gewaehlt);
  const r = new Set(frage.richtig);
  return g.size === r.size && [...r].every((i) => g.has(i));
}

/** Richtig: 1000 bis 500 je nach Antwortzeit; ohne `zeit_s` oder Zeit 1000; falsch 0. */
export function punkte(frage: QuizFrage, gewaehlt: number[], antwortzeitMs: number | null): number {
  if (!istRichtig(frage, gewaehlt)) return 0;
  if (!frage.zeit_s || antwortzeitMs === null) return 1000;
  const grenze = frage.zeit_s * 1000;
  return Math.round(1000 * (1 - (0.5 * Math.min(antwortzeitMs, grenze)) / grenze));
}
