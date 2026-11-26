import { describe, expect, it } from "vitest";
import { MAX_FRAGE, MAX_OPTION, laengenStufe, STUFEN } from "./groessen";

/**
 * Auf dem Beamer wird nie gekürzt oder abgeschnitten (Review Task 7): lange Texte bekommen eine
 * kleinere Schriftstufe. Die Grenzen sind so gewählt, dass der längste gültige Inhalt (Frage 300,
 * sechs Optionen à 120, Erklärung 400 Zeichen) bei 1280×720 noch ganz auf die Bühne passt —
 * nachgemessen per Screenshot (Bericht Task 7, Fix-Runde 1).
 */
describe("laengenStufe", () => {
  it("kurz bleibt groß, die Grenzen gehören zur kleineren Stufe nicht", () => {
    expect(laengenStufe("frage", "x".repeat(90))).toBe(0);
    expect(laengenStufe("frage", "x".repeat(91))).toBe(1);
    expect(laengenStufe("frage", "x".repeat(MAX_FRAGE))).toBe(3);
  });
  it("zählt Zeichen, nicht UTF-16-Einheiten", () => {
    expect(laengenStufe("option", "ä".repeat(40))).toBe(0);
    expect(laengenStufe("option", "😀".repeat(40))).toBe(0);
  });
  it("der längste gültige Text liegt in der kleinsten Stufe jeder Art", () => {
    for (const art of Object.keys(STUFEN) as (keyof typeof STUFEN)[]) {
      expect(laengenStufe(art, "x".repeat(MAX_OPTION * 10))).toBe(STUFEN[art].length);
    }
  });
});
