import { describe, it, expect } from "vitest";
import { buildCsv, joinTexts } from "./csv";

describe("buildCsv (RFC 4180)", () => {
  it("quotet Felder mit Komma, Anführungszeichen, Zeilenumbruch", () => {
    const csv = buildCsv([
      ["a", "b,c", 'd"e'],
      ["f\ng", "h", "i"],
    ]);
    expect(csv).toBe('a,"b,c","d""e"\r\n"f\ng",h,i');
  });
  it("leere Matrix → leerer String", () => {
    expect(buildCsv([])).toBe("");
  });
});

describe("joinTexts", () => {
  it("verbindet Freitexte mit ' | ' — kein Doppel-JSON wie die Alt-App", () => {
    expect(joinTexts(["super", "mehr Praxis"])).toBe("super | mehr Praxis");
  });
  it("leeres Array → leerer String", () => {
    expect(joinTexts([])).toBe("");
  });
});
