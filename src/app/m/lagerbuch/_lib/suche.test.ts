import { describe, it, expect } from "vitest";
import { falte } from "./suche";

describe("falte — die EINE Faltung beider Suchhaelften", () => {
  it("faltet ASCII", () => {
    expect(falte("Verband")).toBe("verband");
  });

  it("faltet Umlaute — genau die Stelle, an der SQLites LIKE aussteigt", () => {
    // SQLites eingebautes LIKE faltet nur A–Z: 'PÄCKCHEN' LIKE '%päckchen%' ist 0.
    // Beide Haelften benutzen ab jetzt DIESE Funktion, also gibt es die Divergenz
    // nicht mehr.
    expect(falte("PÄCKCHEN")).toBe("päckchen");
    expect(falte("Größe")).toBe("größe");
  });

  it("faltet NICHT ss/ß — das ist eine gemeinsame Luecke, keine Divergenz", () => {
    // Gemessen: 'Straße' LIKE '%STRASSE%' → 0, und "STRASSE".toLowerCase() ist
    // "strasse", was in "straße" nicht vorkommt. Eine Normalisierung, die ß auf ss
    // faltet, erzeugt Treffer, die niemand gesucht hat („Massen"/„Maßen") — sie ist
    // teurer als das Problem und bleibt bewusst aus.
    expect(falte("STRASSE")).toBe("strasse");
    expect(falte("Straße")).toBe("straße");
    expect(falte("Straße")).not.toBe(falte("STRASSE"));
  });

  it("ist idempotent", () => {
    expect(falte(falte("PÄCKCHEN"))).toBe(falte("PÄCKCHEN"));
  });
});
