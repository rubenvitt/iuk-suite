import { describe, it, expect } from "vitest";
import { STANDARD_QUESTIONS, isRatingType, ratingScale } from "./questions";

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
