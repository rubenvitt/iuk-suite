// SCHRIFTSTUFEN DER BEAMER-ANSICHT. Auf dem Beamer wird nie gekürzt oder abgeschnitten: ein langer
// Text bekommt eine kleinere Stufe (`data-stufe`, die Größen stehen in `beamer.module.css`).
// Kein "use client": reine Werte (Falle 6, `CLAUDE.md`).
//
// Die Grenzen sind so gewählt, dass der längste gültige Inhalt (`_lib/quiz/fragen.ts`: Frage 300,
// sechs Optionen à 120, Erklärung `ERKLAERUNG_MAX`) bei 1280×720 ganz auf die 16:9-Bühne passt.
// Wer eine Grenze oder eine Schriftgröße ändert, misst den schlimmsten Fall neu (Bericht Task 7).
export { MAX_FRAGE, MAX_OPTION } from "@/app/m/feedback/_lib/quiz/fragen";

/** Obergrenzen (Zeichen) je Stufe; darüber die nächste. Die letzte Stufe hat keine Grenze. */
export const STUFEN = {
  /** Fragetext im Bild „Frage“ (6,2 · 5,2 · 4,4 · 3,8 cqh). */
  frage: [90, 160, 230],
  /** Längste Option auf den Kacheln (4,6 · 3,8 · 3,2 cqh; bei 5–6 Optionen 3,8 · 3,2 · 2,8). */
  kachel: [40, 80],
  /** Fragetext in der Auflösung (4,6 · 3,6 · 3,0 cqh). */
  aufloesung: [100, 200],
  /** Längste Option in den Balken (3,6 · 3,0 · 2,6 cqh). */
  option: [50, 90],
  /** Erklärung (3,4 · 3,0 · 2,6 cqh). */
  erklaerung: [150, 280],
  /** Quiztitel groß vor dem Start (12 · 8,4 · 6,2 cqh). */
  titel: [30, 60],
  /** Spitzname auf dem Podest. */
  name: [12],
} as const satisfies Record<string, readonly number[]>;

export type LaengenArt = keyof typeof STUFEN;

/** Die Stufe für einen Text (oder den längsten von mehreren). 0 = größte Schrift. */
export function laengenStufe(art: LaengenArt, ...texte: string[]): number {
  const laenge = Math.max(0, ...texte.map((t) => Array.from(t).length));
  const grenzen: readonly number[] = STUFEN[art];
  const i = grenzen.findIndex((g) => laenge <= g);
  return i === -1 ? grenzen.length : i;
}
