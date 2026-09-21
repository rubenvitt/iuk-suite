import { describe, it, expect } from "vitest";
import { CODE_ALPHABET, codeFormatGueltig, codeNormalisieren, loginCodeErzeugen } from "./code";

describe("codeNormalisieren — identisch zur Alt-Anwendung", () => {
  it.each([
    ["  abcd-efgh ", "ABCDEFGH"],
    ["il1o0uv", "11100VV"],   // I→1, L→1, O→0, U→V
    ["A B\tC\nD", "ABCD"],
    ["x-y-z", "XYZ"],
    ["", ""],
  ])("%j → %j", (rein, raus) => expect(codeNormalisieren(rein)).toBe(raus));
});

describe("loginCodeErzeugen", () => {
  it("liefert 8 Zeichen aus dem Crockford-Alphabet ohne I, L, O, U", () => {
    expect(CODE_ALPHABET).toBe("0123456789ABCDEFGHJKMNPQRSTVWXYZ");
    for (let i = 0; i < 200; i++) {
      const c = loginCodeErzeugen();
      expect(c).toHaveLength(8);
      for (const z of c) expect(CODE_ALPHABET).toContain(z);
    }
  });
  it("ist ein Fixpunkt der Normalisierung", () => {
    for (let i = 0; i < 50; i++) { const c = loginCodeErzeugen(); expect(codeNormalisieren(c)).toBe(c); }
  });
});

describe("codeFormatGueltig (DRK-287)", () => {
  it("nimmt jeden erzeugten Code und die festen Seed-Codes an", () => {
    for (let i = 0; i < 200; i++) expect(codeFormatGueltig(loginCodeErzeugen())).toBe(true);
    expect(codeFormatGueltig("E2ETEST1")).toBe(true);
    expect(codeFormatGueltig("E2EGESP2")).toBe(true);
  });
  it("nimmt einen abgetippten Code nach der Normalisierung an", () => {
    expect(codeFormatGueltig(codeNormalisieren(" e2et-est1 "))).toBe(true);
  });
  it.each([
    ["", "leer"],
    ["ABCDEFG", "zu kurz"],
    ["ABCDEFGHJ", "zu lang"],
    ["ABCDEFG!", "fremdes Zeichen"],
    ["ABCDEFGI", "I ist nicht im Alphabet"],
    ["abcdefgh", "nicht normalisiert"],
    ["A".repeat(1024), "überlang"],
  ])("%j (%s) → false", (code) => expect(codeFormatGueltig(code)).toBe(false));
});
