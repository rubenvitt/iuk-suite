import { describe, expect, it } from "vitest";
import type { QuizFrage } from "./fragen";
import { istRichtig, punkte } from "./punkte";

const einfach: QuizFrage = { text: "?", typ: "einfach", optionen: ["A", "B", "C"], richtig: [1], zeit_s: 20 };
const mehr: QuizFrage = { text: "?", typ: "mehrfach", optionen: ["A", "B", "C"], richtig: [0, 2] };

describe("punkte", () => {
  it("gibt 1000 für sofort, 750 bei halber Zeit, 500 bei Ablauf oder später", () => {
    expect(punkte(einfach, [1], 0)).toBe(1000);
    expect(punkte(einfach, [1], 10_000)).toBe(750);
    expect(punkte(einfach, [1], 99_999)).toBe(500);
  });
  it("gibt 0 für falsch", () => {
    expect(punkte(einfach, [0], 0)).toBe(0);
  });
  it("gibt 1000 ohne Antwortzeit oder ohne zeit_s", () => {
    expect(punkte(einfach, [1], null)).toBe(1000);
    expect(punkte({ ...einfach, zeit_s: undefined }, [1], 50_000)).toBe(1000);
  });
  it("zählt Mehrfach nur bei exakt gleicher Menge", () => {
    expect(punkte(mehr, [0], 0)).toBe(0);
    expect(punkte(mehr, [2, 0], 0)).toBe(1000);
    expect(istRichtig(mehr, [0, 2, 1])).toBe(false);
    expect(istRichtig(mehr, [0, 0, 2])).toBe(true);
  });
});
