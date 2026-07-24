// `stars` ist nur für den LESE-Pfad (importierte Alt-Umfragen). Neue Umfragen
// erzeugen ausschließlich schulnote+text (STANDARD_QUESTIONS). single_choice/
// multi_choice der Alt-App werden bewusst nicht portiert (toter Code).
export type QuestionType = "schulnote" | "text" | "stars";

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
}

// Texte 1:1 aus da-feedback questions.go:3-21.
export const STANDARD_QUESTIONS: Question[] = [
  { id: "q1", type: "schulnote", text: "Wie war der Dienstabend insgesamt?" },
  { id: "q2", type: "schulnote", text: "Wie spannend war das Thema für dich?" },
  { id: "q3", type: "schulnote", text: "Wurden deine Erwartungen erfüllt?" },
  { id: "q4", type: "schulnote", text: "Wie gut war der Abend strukturiert?" },
  { id: "q5", type: "schulnote", text: "Hat man den Aufwand dahinter gemerkt?" },
  { id: "q6", type: "schulnote", text: "Wie gut war alles vorbereitet?" },
  { id: "q7", type: "schulnote", text: "Wurdest du als Teilnehmer einbezogen?" },
  { id: "q8", type: "schulnote", text: "Hast du etwas Neues mitgenommen?" },
  { id: "q9", type: "text", text: "Was hat dir am besten gefallen?" },
  { id: "q10", type: "text", text: "Worauf sollten wir beim nächsten Mal näher eingehen?" },
  { id: "q11", type: "text", text: "Was könnten wir besser machen?" },
  { id: "q12", type: "text", text: "Hast du einen Tipp für uns?" },
  { id: "q13", type: "text", text: "Welches Thema würde dich als Nächstes interessieren?" },
  { id: "q14", type: "text", text: "Gibt es sonst noch etwas, das du loswerden möchtest?" },
];

/**
 * Zeichengrenze der Freitexte (Entwurf 3.7). Am Feld ist sie `maxLength` — eine
 * physische Grenze, die keine Fehlermeldung erzeugen kann. Der Server spiegelt
 * sie, weil er sich auf das Feld nicht verlassen darf.
 */
export const MAX_TEXT_LENGTH = 500;

export function isRatingType(t: QuestionType): boolean {
  return t === "schulnote" || t === "stars";
}

export function ratingScale(t: QuestionType): number {
  return t === "schulnote" ? 6 : 5;
}

/**
 * Wandelt eine rohe Formular-Antwort in einen speicherbaren Wert um.
 * Rating-Fragen werden auf den gültigen Wertebereich (1..ratingScale) begrenzt —
 * liefert `undefined`, wenn der Rohwert leer, keine Ganzzahl oder außerhalb des
 * Bereichs ist. Der Aufrufer überspringt die Frage dann, statt einen erfundenen
 * Wert zu speichern (ein anonymer Teilnehmer könnte sonst z. B. q1=99999 senden
 * und jeden Durchschnitt verzerren) — bei Pflichtnoten zählt sie damit als fehlend.
 * Freitexte werden auf `MAX_TEXT_LENGTH` gekürzt.
 */
export function coerceAnswer(
  q: Question,
  raw: FormDataEntryValue | null,
): string | number | undefined {
  if (raw === null || String(raw).trim() === "") return undefined;
  if (isRatingType(q.type)) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > ratingScale(q.type)) return undefined;
    return n;
  }
  return String(raw).slice(0, MAX_TEXT_LENGTH);
}
