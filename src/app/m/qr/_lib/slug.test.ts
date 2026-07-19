import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "@/app/m/qr/_lib/slug";

describe("slugify", () => {
  it("kleinschreibt und ersetzt Leerzeichen", () => {
    expect(slugify("Mein Preset")).toBe("mein-preset");
  });
  it("transliteriert Umlaute statt sie zu entfernen", () => {
    expect(slugify("Übung Größe")).toBe("uebung-groesse");
  });
  // Sichtbar derselbe Text, nur dekomponiert — etwa aus macOS-Dateinamen oder
  // Importdaten. Ohne NFC-Normalisierung ergäbe das "ubung-grosse", also eine
  // zweite Preset-ID für denselben Namen.
  it("transliteriert Umlaute auch bei dekomponierter Eingabe", () => {
    expect(slugify("Übung Größe".normalize("NFD"))).toBe("uebung-groesse");
  });
  // Deckt zwei Dinge zugleich ab: das "ä" der UMLAUT_MAP und die
  // NFKD-Transliteration der übrigen Diakritika (ohne sie bliebe "caf-").
  it("transliteriert Akzentzeichen über NFKD", () => {
    expect(slugify("Café Anhänger")).toBe("cafe-anhaenger");
  });
  // Kombinationszeichen zwischen zwei Buchstaben: nur das Mark-Stripping hält
  // das Wort zusammen, sonst zerfällt es zu "nai-ve".
  it("entfernt Kombinationszeichen, statt das Wort zu trennen", () => {
    expect(slugify("naïve")).toBe("naive");
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
  // Nagelt den Startwert fest: der Mehrfachkollisionsfall unten liefert mit
  // Start 2 und Start 3 dasselbe Ergebnis und prüft ihn deshalb nicht.
  it("beginnt bei -2", () => {
    const taken = new Set(["test"]);
    expect(uniqueSlug((id) => taken.has(id), "test")).toBe("test-2");
  });
  it("hängt -2, -3 … an, bis frei", () => {
    const taken = new Set(["test", "test-2"]);
    expect(uniqueSlug((id) => taken.has(id), "test")).toBe("test-3");
  });
  it("bricht ab, statt endlos zu laufen", () => {
    expect(() => uniqueSlug(() => true, "test")).toThrow();
  });
});
