import { describe, expect, it } from "vitest";
import { passt, vergleichsform } from "./typen";

describe("Vergleichsform und Suche der Bibliothek", () => {
  it("getrimmt, Leerraum zusammengezogen, ohne Groß/Klein — auch Umlaute", () => {
    expect(vergleichsform("  RK UE   40-83-5 ")).toBe("rk ue 40-83-5");
    expect(vergleichsform("ÜBUNG")).toBe(vergleichsform("übung"));
  });
  it("jedes Wort der Suche muss in einem der Felder stehen; leere Suche passt immer", () => {
    expect(passt("ue 83", ["RTW", "RK UE 40-83-5", null])).toBe(true);
    expect(passt("ktw 83", ["RTW", "RK UE 40-83-5"])).toBe(false);
    expect(passt("   ", ["x"])).toBe(true);
  });
});
