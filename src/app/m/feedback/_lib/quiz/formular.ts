// Formularzustand der Quiz-Verwaltung. Kein "use client": die Actions und die Seiten lesen diese
// Werte (Falle 6, `CLAUDE.md`).

/**
 * Wie `FormState` (`_lib/formState.ts`), nur mit `fragen` als LISTE: `pruefeFragen` meldet je
 * Frage einen eigenen Satz („Frage 3: …"), und der Editor zeigt sie untereinander.
 * Zugriffsverletzungen gehören nicht hierher, sie werfen weiter (wie bei `FormState`).
 */
export type QuizFormState =
  | { ok: true; gespeichert?: boolean }
  | {
      ok: false;
      fieldErrors: { titel?: string; modus?: string; fragen?: string[] };
      values: Record<string, string>;
    };

export const QUIZ_FORM_START: QuizFormState = { ok: true };

export const MODUS_TEXT = {
  lagebild: "Lagebild (anonym)",
  wettbewerb: "Wettbewerb",
} as const;

export const MODUS_ERKLAERUNG = {
  lagebild: "Ohne Namen und ohne Punkte. Zeigt, was die Gruppe weiß.",
  wettbewerb: "Mit Spitznamen, Punkten und Rangliste.",
} as const;

export const TITEL_MAX = 120;

/**
 * `clicks` für Slidev: `$clicks` läuft 0..clicks, die Schritte 0..schrittAnzahl-1 — Klick k ist
 * Schritt k. Der nächste Klick nach dem Schluss blättert Slidev selbst auf die nächste Folie.
 */
export function slidevKlicks(schritte: number): number {
  return schritte - 1;
}

/**
 * Der Slidev-Schnipsel (Spec §5.5): eine eigene Folie mit `clicks` aus `slidevKlicks` und der
 * Beamer-Adresse. Hier und nicht im Editor, damit Seite und Test dieselbe Fassung lesen.
 */
export function slidevSchnipsel(clicks: number, beamerUrl: string): string {
  return `---\nclicks: ${clicks}\n---\n<LiveQuiz src="${beamerUrl}" />`;
}

/** Der Warntext aus Spec §5.6, wörtlich. */
export const BEAMER_WARNUNG =
  "Wer die Adresse kennt, kann das Quiz steuern. Foliensätze mit dieser Adresse nicht öffentlich ablegen.";
