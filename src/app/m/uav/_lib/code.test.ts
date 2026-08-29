import { describe, it, expect } from "vitest";
import { CODE_ALPHABET, codeNormalisieren, loginCodeErzeugen } from "./code";

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
