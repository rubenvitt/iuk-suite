import { describe, expect, it } from "vitest";
import { asciiTeil, svgDateiname } from "./dateiname";

describe("Dateiname der SVG-Datei (Entscheidung 15, Review Focus 6)", () => {
  it("Umlaute ausgeschrieben, Diakritika weg, alles andere ein Bindestrich, höchstens 60 Zeichen", () => {
    expect(asciiTeil("Übung Großenkneten 01.07.2022")).toBe("Uebung-Grossenkneten-01-07-2022");
    expect(asciiTeil("Café / „Nord“ — EA 3: 🚒 Süd")).toBe("Cafe-Nord-EA-3-Sued");
    expect(asciiTeil("x".repeat(70))).toHaveLength(60);
    expect(asciiTeil(`${"a".repeat(59)} b`)).toBe("a".repeat(59));
    expect(asciiTeil("„“ / 🚒")).toBe("");
  });
  it("Titel, Tag, Blatt und Format; leerer Titel → kommunikationsplan", () => {
    expect(svgDateiname({ titel: "Einsatz Süd", tag: "2026-02-22", blatt: 2, von: 3, format: "a3-quer" })).toBe("Einsatz-Sued_2026-02-22_blatt-2-von-3_a3.svg");
    expect(svgDateiname({ titel: "🚒", tag: "2026-10-01", blatt: 1, von: 1, format: "a4-quer" })).toBe("kommunikationsplan_2026-10-01_blatt-1-von-1_a4.svg");
    expect(svgDateiname({ titel: "x", tag: "2026-10-01", blatt: 1, von: 1, format: "a4-quer" })).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});
