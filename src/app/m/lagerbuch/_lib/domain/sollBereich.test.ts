import { describe, expect, it } from "vitest";
import { obergrenze, sollMaxNorm, sollText, ueberschuss } from "./sollBereich";

describe("Soll mit „OK bis“ (IDA-247)", () => {
  it("ohne Bereich ist das Soll die Obergrenze", () => {
    expect(obergrenze(2, null)).toBe(2);
    expect(ueberschuss(8, 2, null)).toBe(6);
    expect(ueberschuss(2, 2, undefined)).toBe(0);
  });

  it("mit Bereich zählt erst, was über „OK bis“ liegt", () => {
    expect(obergrenze(2, 4)).toBe(4);
    expect(ueberschuss(4, 2, 4)).toBe(0);
    expect(ueberschuss(7, 2, 4)).toBe(3);
  });

  it("eine Lücke ist nie Überschuss", () => {
    expect(ueberschuss(0, 2, 4)).toBe(0);
  });

  it("„OK bis“ gleich oder unter dem Soll ist kein Bereich", () => {
    expect(sollMaxNorm(4, 4)).toBeNull();
    expect(sollMaxNorm(5, 4)).toBeNull();
    expect(sollMaxNorm(2, 4)).toBe(4);
    expect(obergrenze(5, 4)).toBe(5);
  });

  it("schreibt den Bereich mit Halbgeviertstrich", () => {
    expect(sollText(2, null)).toBe("2");
    expect(sollText(2, 4)).toBe("2–4");
    expect(sollText(4, 4)).toBe("4");
  });
});
