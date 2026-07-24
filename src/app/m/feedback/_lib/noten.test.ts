import { describe, expect, it } from "vitest";
import {
  NOTEN_DUNKEL,
  NOTEN_HELL,
  NOTEN_WORT,
  ampelStufe,
  notenFarbe,
} from "./noten";

/**
 * WCAG-Relativluminanz. Steht im Test, nicht im Modul: die Palette ist ein
 * Ergebnis, die Rechnung ist der Beweis dafuer. Die Produktion braucht sie
 * nicht, dieser Test schon — er ist der Waechter ueber den einen Kanal, der
 * Rot-Gruen-Blindheit und Graustufen uebersteht.
 */
function luminanz(hex: string): number {
  const kanaele = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * kanaele[0] + 0.7152 * kanaele[1] + 0.0722 * kanaele[2];
}

function kontrast(a: string, b: string): number {
  const [l1, l2] = [luminanz(a), luminanz(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe("Notenpalette: wortgenau der geprueften Vorlage", () => {
  it("hell traegt genau die sechs Werte aus Abschnitt 3.4, Index 0 = Note 1", () => {
    expect(NOTEN_HELL).toEqual([
      "#2F7F59",
      "#54782A",
      "#7E6103",
      "#904708",
      "#912E10",
      "#811221",
    ]);
  });

  it("dunkel traegt genau die sechs Werte aus Abschnitt 3.4, Index 0 = Note 1", () => {
    expect(NOTEN_DUNKEL).toEqual([
      "#A1DBC0",
      "#AACF7F",
      "#DAB22F",
      "#EB9549",
      "#EA7A58",
      "#E55C6E",
    ]);
  });

  it("beide Paletten haben je sechs Eintraege", () => {
    expect(NOTEN_HELL).toHaveLength(6);
    expect(NOTEN_DUNKEL).toHaveLength(6);
  });

  it("Notenwoerter laufen von 'sehr gut' bis 'ungenuegend'", () => {
    expect(NOTEN_WORT).toEqual([
      "sehr gut",
      "gut",
      "befriedigend",
      "ausreichend",
      "mangelhaft",
      "ungenügend",
    ]);
  });

  it("kein Wert ist das DRK-Rot #c8000f — Rot ist Marke, nicht Note 6", () => {
    for (const wert of [...NOTEN_HELL, ...NOTEN_DUNKEL]) {
      expect(wert.toLowerCase()).not.toBe("#c8000f");
    }
  });
});

describe("Notenpalette: Luminanz als farbunabhaengiger Rangkanal", () => {
  it("hell faellt streng monoton von Note 1 zu Note 6", () => {
    const werte = NOTEN_HELL.map(luminanz);
    for (let i = 1; i < werte.length; i++) {
      expect(werte[i]).toBeLessThan(werte[i - 1]);
    }
  });

  /**
   * Auch dunkel FAELLT die Luminanz (.620 → .254). Der Plan zu Task 10 sagt an
   * einer Stelle "bzw. steigt monoton (dunkel)" — das ist eine Verwechslung mit
   * dem TONWERTKEIL, der im Dunkelmodus tatsaechlich die Richtung umkehrt
   * ("heller = schwerer", §3.4). Die NOTENFARBEN kehren nicht um: der Entwurf
   * legt viermal das Gegenteil fest, zuletzt wortgenau in §3.4/Z.305 "Luminanz
   * fällt monoton von 1 nach 6 (hell .165→.052, dunkel .620→.254)" und in
   * `feedback-admin.md` §4.11. Da die Hexwerte wortgenau vorgegeben sind,
   * entscheiden sie: eine steigende Reihe waere nur mit anderen Farben zu
   * haben, und die sind auf Kontrast geprueft.
   */
  it("dunkel faellt ebenfalls streng monoton von Note 1 zu Note 6", () => {
    const werte = NOTEN_DUNKEL.map(luminanz);
    for (let i = 1; i < werte.length; i++) {
      expect(werte[i]).toBeLessThan(werte[i - 1]);
    }
  });

  it("beide Moden laufen in DERSELBEN Richtung — Note 1 ist stets die hellste", () => {
    for (const palette of [NOTEN_HELL, NOTEN_DUNKEL]) {
      const werte = palette.map(luminanz);
      expect(Math.max(...werte)).toBe(werte[0]);
      expect(Math.min(...werte)).toBe(werte[5]);
    }
  });

  it("die Luminanzen entsprechen den in Abschnitt 3.4 belegten Werten", () => {
    expect(NOTEN_HELL.map((h) => Number(luminanz(h).toFixed(3)))).toEqual([
      0.165, 0.155, 0.13, 0.105, 0.08, 0.052,
    ]);
    expect(NOTEN_DUNKEL.map((h) => Number(luminanz(h).toFixed(3)))).toEqual([
      0.62, 0.547, 0.47, 0.396, 0.321, 0.254,
    ]);
  });

  it("jede Chipfuellung erreicht AA gegen ihre Ziffernfarbe (hell #FFFFFF, dunkel #101214)", () => {
    for (const wert of NOTEN_HELL) {
      expect(kontrast(wert, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    }
    for (const wert of NOTEN_DUNKEL) {
      expect(kontrast(wert, "#101214")).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("notenFarbe: Note 1 ist der erste Eintrag, nicht der zweite", () => {
  it("hell liefert fuer Note 1 bis 6 die Palette in Reihenfolge", () => {
    for (let note = 1; note <= 6; note++) {
      expect(notenFarbe(note, "light")).toBe(NOTEN_HELL[note - 1]);
    }
    expect(notenFarbe(1, "light")).toBe("#2F7F59");
    expect(notenFarbe(6, "light")).toBe("#811221");
  });

  it("dunkel liefert fuer Note 1 bis 6 die Palette in Reihenfolge", () => {
    for (let note = 1; note <= 6; note++) {
      expect(notenFarbe(note, "dark")).toBe(NOTEN_DUNKEL[note - 1]);
    }
    expect(notenFarbe(1, "dark")).toBe("#A1DBC0");
    expect(notenFarbe(6, "dark")).toBe("#E55C6E");
  });

  it("liefert auch ausserhalb von 1..6 eine Farbe statt undefined", () => {
    expect(notenFarbe(0, "light")).toBe("#2F7F59");
    expect(notenFarbe(9, "dark")).toBe("#E55C6E");
  });
});

describe("ampelStufe: die Schwellen aus Abschnitt 4.11, an den Raendern geprueft", () => {
  it("faerbt an jeder Bereichsgrenze wie die Tabelle", () => {
    const grenzen: ReadonlyArray<readonly [number, number]> = [
      [1.0, 1],
      [1.49, 1],
      [1.5, 2],
      [2.49, 2],
      [2.5, 3],
      [3.49, 3],
      [3.5, 4],
      [4.49, 4],
      [4.5, 5],
      [5.49, 5],
      [5.5, 6],
      [6.0, 6],
    ];
    for (const [durchschnitt, erwartet] of grenzen) {
      expect(ampelStufe(durchschnitt)).toBe(erwartet);
    }
  });

  it("klemmt Werte unter 1 und ueber 6 auf die Randnoten", () => {
    expect(ampelStufe(0.4)).toBe(1);
    expect(ampelStufe(0)).toBe(1);
    expect(ampelStufe(6.7)).toBe(6);
    expect(ampelStufe(12)).toBe(6);
  });

  it("faerbt nach dem GERUNDETEN Wert — 2,4 ist Note 2, 2,5 ist Note 3", () => {
    expect(ampelStufe(2.4)).toBe(2);
    expect(ampelStufe(2.5)).toBe(3);
    expect(notenFarbe(ampelStufe(2.4), "light")).toBe("#54782A");
    expect(notenFarbe(ampelStufe(2.5), "light")).toBe("#7E6103");
  });

  it("keine Stufe faellt aus dem Wertebereich 1..6", () => {
    for (let i = 0; i <= 80; i++) {
      const stufe = ampelStufe(i / 10);
      expect(stufe).toBeGreaterThanOrEqual(1);
      expect(stufe).toBeLessThanOrEqual(6);
      expect(Number.isInteger(stufe)).toBe(true);
    }
  });
});
