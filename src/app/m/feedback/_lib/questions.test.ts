import { describe, it, expect } from "vitest";
import { STANDARD_QUESTIONS, isRatingType, ratingScale, coerceAnswer, type Question } from "./questions";

describe("STANDARD_QUESTIONS", () => {
  it("hat 14 Fragen: 8 schulnote (q1-q8) + 6 text (q9-q14)", () => {
    expect(STANDARD_QUESTIONS).toHaveLength(14);
    expect(STANDARD_QUESTIONS.filter((q) => q.type === "schulnote")).toHaveLength(8);
    expect(STANDARD_QUESTIONS.filter((q) => q.type === "text")).toHaveLength(6);
    expect(STANDARD_QUESTIONS.map((q) => q.id)).toEqual(
      Array.from({ length: 14 }, (_, i) => `q${i + 1}`),
    );
  });
  it("erste Frage ist der Gesamteindruck", () => {
    expect(STANDARD_QUESTIONS[0]).toEqual({
      id: "q1",
      type: "schulnote",
      text: "Wie war der Dienstabend insgesamt?",
    });
  });
});

describe("isRatingType / ratingScale", () => {
  it("schulnote und stars sind Ratings, text nicht", () => {
    expect(isRatingType("schulnote")).toBe(true);
    expect(isRatingType("stars")).toBe(true);
    expect(isRatingType("text")).toBe(false);
  });
  it("schulnote skaliert 1-6, stars 1-5", () => {
    expect(ratingScale("schulnote")).toBe(6);
    expect(ratingScale("stars")).toBe(5);
  });
});

describe("coerceAnswer", () => {
  const schulnote: Question = { id: "q1", type: "schulnote", text: "…" };
  const stars: Question = { id: "q9", type: "stars", text: "…" };
  const text: Question = { id: "q9", type: "text", text: "…" };

  it("übernimmt gültige Rating-Werte im Bereich 1..Skala", () => {
    expect(coerceAnswer(schulnote, "1")).toBe(1);
    expect(coerceAnswer(schulnote, "6")).toBe(6);
    expect(coerceAnswer(stars, "5")).toBe(5);
  });

  it("verwirft Rating-Werte außerhalb des Bereichs (kein Clamping)", () => {
    expect(coerceAnswer(schulnote, "99999")).toBeUndefined();
    expect(coerceAnswer(schulnote, "0")).toBeUndefined();
    expect(coerceAnswer(schulnote, "7")).toBeUndefined();
    expect(coerceAnswer(stars, "-1")).toBeUndefined();
    expect(coerceAnswer(stars, "6")).toBeUndefined();
  });

  it("verwirft nicht-ganzzahlige oder nicht-numerische Rating-Werte", () => {
    expect(coerceAnswer(schulnote, "3.5")).toBeUndefined();
    expect(coerceAnswer(schulnote, "abc")).toBeUndefined();
  });

  it("übernimmt Text-Antworten unverändert (keine Bereichsprüfung)", () => {
    expect(coerceAnswer(text, "irgendein Text")).toBe("irgendein Text");
    expect(coerceAnswer(text, "99999")).toBe("99999");
  });

  // Entwurf 3.7: 500 Zeichen sind die physische Grenze am Feld (maxLength) UND
  // serverseitig — der Server darf sich nicht auf das Feld verlassen.
  it("schneidet Freitexte auf 500 Zeichen", () => {
    expect(coerceAnswer(text, "a".repeat(600))).toBe("a".repeat(500));
    expect(coerceAnswer(text, "a".repeat(500))).toHaveLength(500);
    expect(coerceAnswer(text, "a".repeat(499))).toHaveLength(499);
  });

  it("liefert undefined für leere/fehlende Antworten", () => {
    expect(coerceAnswer(schulnote, null)).toBeUndefined();
    expect(coerceAnswer(schulnote, "")).toBeUndefined();
    expect(coerceAnswer(schulnote, "   ")).toBeUndefined();
    expect(coerceAnswer(text, null)).toBeUndefined();
  });
});
