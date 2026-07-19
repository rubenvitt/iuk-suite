import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "@/app/m/qr/_lib/slug";

describe("slugify", () => {
  it("kleinschreibt und ersetzt Leerzeichen", () => {
    expect(slugify("Mein Preset")).toBe("mein-preset");
  });
  it("transliteriert Umlaute statt sie zu entfernen", () => {
    expect(slugify("Übung Größe")).toBe("uebung-groesse");
  });
  it("wirft Sonderzeichen weg und trimmt Bindestriche", () => {
    expect(slugify("  !!Hallo?? Welt!! ")).toBe("hallo-welt");
  });
  it("kürzt auf 60 Zeichen", () => {
    expect(slugify("a".repeat(100))).toHaveLength(60);
  });
  it("fällt auf 'preset' zurück, wenn nichts übrig bleibt", () => {
    expect(slugify("???")).toBe("preset");
  });
  // Slugs sind laut Global Constraints zugleich Preset-IDs, und die
  // ID-Prüfung in validatePresetInput verbietet einen Bindestrich am Ende.
  // Der Schnitt auf 60 Zeichen darf deshalb keinen erzeugen.
  it("lässt keinen Bindestrich am 60-Zeichen-Schnitt stehen", () => {
    expect(slugify(`${"a".repeat(59)} ${"b".repeat(10)}`)).toBe("a".repeat(59));
  });
});

describe("uniqueSlug", () => {
  it("gibt den Basis-Slug zurück, wenn frei", () => {
    expect(uniqueSlug(() => false, "test")).toBe("test");
  });
  it("hängt -2, -3 … an, bis frei", () => {
    const taken = new Set(["test", "test-2"]);
    expect(uniqueSlug((id) => taken.has(id), "test")).toBe("test-3");
  });
  it("bricht ab, statt endlos zu laufen", () => {
    expect(() => uniqueSlug(() => true, "test")).toThrow();
  });
});
