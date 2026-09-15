import { describe, it, expect } from "vitest";
import { journalZeile } from "./journalZeile";

describe("journalZeile — Vorzeichen und Zustand", () => {
  it("eine Entnahme ist NEGATIV und traegt ein Minus", () => {
    expect(journalZeile({ typ: "entnahme", menge: -3, referenz: null }))
      .toEqual({ mengeText: "-3", zustand: "negativ", typText: "Entnahme" });
  });

  it("ein Zugang ist POSITIV und traegt ein PLUS", () => {
    // Das Plus ist der Punkt: `String(5)` waere "5" und saehe aus wie eine
    // Bestandszahl statt wie eine Veraenderung.
    expect(journalZeile({ typ: "zugang", menge: 5, referenz: null }))
      .toEqual({ mengeText: "+5", zustand: "positiv", typText: "Wareneingang" });
  });

  it("eine Menge 0 ist NEUTRAL und traegt KEIN Vorzeichen", () => {
    expect(journalZeile({ typ: "korrektur", menge: 0, referenz: null }))
      .toEqual({ mengeText: "0", zustand: "neutral", typText: "Korrektur" });
  });

  it("der Zustand haengt am VORZEICHEN, nicht am Typ", () => {
    // Eine Korrektur kann in beide Richtungen gehen, eine Umlagerung erzeugt
    // ZWEI Legs mit entgegengesetztem Vorzeichen (I3).
    expect(journalZeile({ typ: "korrektur", menge: 7, referenz: null }).zustand).toBe("positiv");
    expect(journalZeile({ typ: "korrektur", menge: -7, referenz: null }).zustand).toBe("negativ");
    expect(journalZeile({ typ: "umlagerung", menge: -2, referenz: null }).zustand).toBe("negativ");
    expect(journalZeile({ typ: "umlagerung", menge: 2, referenz: null }).zustand).toBe("positiv");
  });

  it("uebersetzt den Typ ueber vorgangLabel und faellt auf den Rohwert zurueck", () => {
    expect(journalZeile({ typ: "umlagerung", menge: 1, referenz: null }).typText).toBe("Umlagerung");
    expect(journalZeile({ typ: "was-neues", menge: 1, referenz: null }).typText).toBe("was-neues");
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
      const d = journalZeile({ typ: "korrektur", menge, referenz: null });
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
    expect(journalZeile({ typ: "entnahme", menge: -3, referenz: null }).mengeText).toBe("-3");
    expect(journalZeile({ typ: "entnahme", menge: -3, referenz: null }).mengeText).not.toContain("−");
  });
});

describe("journalZeile — die REFERENZ verfeinert den Typ (DRK-344)", () => {
  /**
   * ⚠️ DIE MUTATION, DIE DAS FAENGT: `referenz` in `vorgangText(b)` fallen
   * lassen. Alle drei Zeilen hier tragen `typ: "korrektur"` — ohne das Feld
   * liefern sie denselben Text, und der Unterschied zwischen einer
   * Materialentsorgung und einer Zaehlkorrektur verschwindet STILL.
   */
  it("`aussondern:` macht aus der Korrektur eine Aussonderung", () => {
    expect(journalZeile({ typ: "korrektur", menge: -4, referenz: "aussondern:handlager" }).typText)
      .toBe("Aussonderung");
  });

  it("`inventur:` macht aus der Korrektur eine Inventur", () => {
    expect(journalZeile({ typ: "korrektur", menge: 2, referenz: "inventur:iv-1" }).typText)
      .toBe("Inventur");
  });

  it("eine Korrektur OHNE Referenz bleibt eine Korrektur", () => {
    expect(journalZeile({ typ: "korrektur", menge: -1, referenz: null }).typText)
      .toBe("Korrektur");
  });

  it("`check:` bekommt KEINEN eigenen Text — der feste Kommentar nennt ihn bereits", () => {
    // Die Entscheidung samt Tabelle steht in `_lib/vorgang.ts`. Der Test haelt
    // sie fest, damit ein spaeterer Griff sie nicht beilaeufig umkehrt.
    expect(journalZeile({ typ: "korrektur", menge: -1, referenz: "check:c-1" }).typText)
      .toBe("Korrektur");
    expect(journalZeile({ typ: "umlagerung", menge: 3, referenz: "check:c-1" }).typText)
      .toBe("Umlagerung");
  });

  it("`entnahme-ziel:` bleibt eine Umlagerung — das Praefix nennt das ZIEL, nicht die Art", () => {
    expect(journalZeile({ typ: "umlagerung", menge: -2, referenz: "entnahme-ziel:fz-1" }).typText)
      .toBe("Umlagerung");
  });

  it("die Referenz aendert NUR den Text, nie Vorzeichen oder Zustand", () => {
    const aus = journalZeile({ typ: "korrektur", menge: -4, referenz: "aussondern:handlager" });
    expect(aus.mengeText).toBe("-4");
    expect(aus.zustand).toBe("negativ");
  });
});
