// Schrittautomat des Live-Quiz: ein absoluter Schritt (0 = Lobby) bestimmt die Ansicht.
// Reine Funktionen, kein "use client" (Falle 6, `CLAUDE.md`).
import type { QuizFrage, QuizModus } from "./fragen";

export type Phase =
  | { art: "vorStart" } // nur für Aufrufer ohne Runde; `phaseFuer` liefert sie nie
  | { art: "lobby" }
  | { art: "frage"; index: number; offen: boolean; endetUm: number | null }
  | { art: "aufloesung"; index: number }
  | { art: "rangliste"; nachIndex: number }
  | { art: "schluss" };

/** Schritte je Frage: Lagebild 2; Wettbewerb 3, nach der letzten Frage ohne Rangliste. */
function schritteJeFrage(i: number, n: number, modus: QuizModus): number {
  return modus === "wettbewerb" && i < n - 1 ? 3 : 2;
}

/** Lobby + Fragenschritte + Schluss. */
export function schrittAnzahl(n: number, modus: QuizModus): number {
  let summe = 2;
  for (let i = 0; i < n; i++) summe += schritteJeFrage(i, n, modus);
  return summe;
}

export function phaseFuer(
  schritt: number,
  fragen: QuizFrage[],
  modus: QuizModus,
  schrittSeit: number,
  jetzt: number,
): Phase {
  const n = fragen.length;
  if (schritt <= 0) return { art: "lobby" };
  let rest = schritt - 1;
  for (let i = 0; i < n; i++) {
    const breite = schritteJeFrage(i, n, modus);
    if (rest < breite) {
      if (rest === 0) {
        const zeit = fragen[i].zeit_s;
        const endetUm = zeit ? schrittSeit + zeit * 1000 : null;
        return { art: "frage", index: i, offen: endetUm === null || jetzt < endetUm, endetUm };
      }
      return rest === 1 ? { art: "aufloesung", index: i } : { art: "rangliste", nachIndex: i };
    }
    rest -= breite;
  }
  return { art: "schluss" };
}

/**
 * `phaseFuer` mit der Sperre für schon passierte Fragen: offen ist eine Frage nur auf dem
 * weitesten je gezeigten Schritt (`quiz_runden.hoechster_schritt`). Wer zurück- und wieder
 * vorblättert, sieht die Frage, kann sie aber nicht mehr beantworten — mit und ohne `zeit_s`.
 * Ein eigener Wrapper, damit `phaseFuer` die reine Funktion (Schritt, Zeit) → Ansicht bleibt.
 */
export function phaseMitSperre(
  schritt: number,
  hoechsterSchritt: number,
  fragen: QuizFrage[],
  modus: QuizModus,
  schrittSeit: number,
  jetzt: number,
): Phase {
  const phase = phaseFuer(schritt, fragen, modus, schrittSeit, jetzt);
  if (phase.art === "frage" && schritt < hoechsterSchritt) return { ...phase, offen: false };
  return phase;
}
