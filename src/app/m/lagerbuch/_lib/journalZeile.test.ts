import { describe, it, expect } from "vitest";
import { journalZeile } from "./journalZeile";

describe("journalZeile — Vorzeichen und Zustand", () => {
  it("eine Entnahme ist NEGATIV und traegt ein Minus", () => {
    expect(journalZeile({ typ: "entnahme", menge: -3 }))
      .toEqual({ mengeText: "-3", zustand: "negativ", typText: "Entnahme" });
  });

  it("ein Zugang ist POSITIV und traegt ein PLUS", () => {
    // Das Plus ist der Punkt: `String(5)` waere "5" und saehe aus wie eine
    // Bestandszahl statt wie eine Veraenderung.
    expect(journalZeile({ typ: "zugang", menge: 5 }))
      .toEqual({ mengeText: "+5", zustand: "positiv", typText: "Wareneingang" });
  });

  it("eine Menge 0 ist NEUTRAL und traegt KEIN Vorzeichen", () => {
    expect(journalZeile({ typ: "korrektur", menge: 0 }))
      .toEqual({ mengeText: "0", zustand: "neutral", typText: "Korrektur" });
  });

  it("der Zustand haengt am VORZEICHEN, nicht am Typ", () => {
    // Eine Korrektur kann in beide Richtungen gehen, eine Umlagerung erzeugt
    // ZWEI Legs mit entgegengesetztem Vorzeichen (I3).
    expect(journalZeile({ typ: "korrektur", menge: 7 }).zustand).toBe("positiv");
    expect(journalZeile({ typ: "korrektur", menge: -7 }).zustand).toBe("negativ");
    expect(journalZeile({ typ: "umlagerung", menge: -2 }).zustand).toBe("negativ");
    expect(journalZeile({ typ: "umlagerung", menge: 2 }).zustand).toBe("positiv");
  });

  it("uebersetzt den Typ ueber typLabel und faellt auf den Rohwert zurueck", () => {
    expect(journalZeile({ typ: "umlagerung", menge: 1 }).typText).toBe("Umlagerung");
    expect(journalZeile({ typ: "was-neues", menge: 1 }).typText).toBe("was-neues");
  });
});

describe("journalZeile — die Zusicherung nennt KEINEN Hexwert", () => {
  it("liefert nur Zustandsnamen, keine Farben", () => {
    /**
     * §12.1, Punkt 4: ob Rot auf DIESER Datenflaeche bleiben darf, entscheidet
     * Entscheidung 30 (§6.6.2 — und sie entscheidet AMPEL-Rot #8c0d16, nicht
     * Suite-Rot #c8000f). Ein Test, der einen Hexwert festnagelt, entscheidet sie
     * versehentlich mit.
     */
    for (const menge of [-5, 0, 5]) {
      const d = journalZeile({ typ: "korrektur", menge });
      expect(JSON.stringify(d)).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
  });

  it("das Vorzeichen ist ASCII, kein typografisches Minus (Festlegung H6)", () => {
    /**
     * Ein `−` (U+2212) laese sich schoener und waere exakt die Klasse, vor der
     * §12.3 warnt: `/× aussondern/` haengt heute an einem typografischen × im
     * Knopftext, und niemand sieht einem Selektor an, dass er an einem
     * unsichtbaren Zeichenunterschied scheitert.
     */
    expect(journalZeile({ typ: "entnahme", menge: -3 }).mengeText).toBe("-3");
    expect(journalZeile({ typ: "entnahme", menge: -3 }).mengeText).not.toContain("−");
  });
});
