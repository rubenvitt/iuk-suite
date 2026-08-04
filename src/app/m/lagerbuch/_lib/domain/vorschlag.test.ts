import { describe, it, expect } from "vitest";
import { braucht, vorschlagsmenge } from "./vorschlag";

describe("braucht — STRIKT kleiner", () => {
  it("ist wahr, wenn der Bestand unter dem Mindestbestand liegt", () => {
    expect(braucht(3, 5)).toBe(true);
    expect(braucht(0, 1)).toBe(true);
  });

  it("ist FALSCH bei Gleichstand", () => {
    // Mit `<=` fuellte sich die Bestellliste mit Zeilen, die „bestelle 0 Stueck"
    // sagen — die Vorschlagsmenge waere dort ohnehin 0.
    expect(braucht(5, 5)).toBe(false);
  });

  it("ist falsch bei Ueberdeckung", () => {
    expect(braucht(9, 5)).toBe(false);
  });

  it("behandelt einen Mindestbestand von 0 richtig", () => {
    // Der haeufigste Fall im Bestand: Artikel ohne gepflegten Mindestbestand
    // (Vorgabe 0, `schema.ts:50`) tauchen NIE im Bestellvorschlag auf.
    expect(braucht(0, 0)).toBe(false);
    expect(braucht(-2, 0)).toBe(true);   // theoretisch; I2 schliesst es aus
  });
});

describe("vorschlagsmenge — die Luecke, kein Faktor", () => {
  it("ist die Differenz bis zum Mindestbestand", () => {
    expect(vorschlagsmenge(3, 5)).toBe(2);
    expect(vorschlagsmenge(0, 12)).toBe(12);
  });

  it("ist NIE negativ", () => {
    expect(vorschlagsmenge(9, 5)).toBe(0);
    expect(vorschlagsmenge(5, 5)).toBe(0);
  });

  it("ist fuer jede Zeile der Bestellliste >= 1", () => {
    // Die Kopplung zwischen den beiden Funktionen: die Liste enthaelt genau die
    // aktiven Artikel, fuer die `braucht` wahr ist (`queries.ts:516`, `:522`).
    for (const [b, m] of [[0, 1], [3, 5], [11, 12]] as const) {
      expect(braucht(b, m)).toBe(true);
      expect(vorschlagsmenge(b, m)).toBeGreaterThanOrEqual(1);
    }
  });

  it("kennt KEINEN Faktor und KEINEN Puffer", () => {
    // BESTELL_FAKTOR ist ersatzlos gestrichen (Betreiber-Entscheidung 5, §10.2).
    // Diese Zeile ist die Zusage dagegen: 5 − 3 = 2, nicht 2 · irgendwas.
    expect(vorschlagsmenge(3, 5)).toBe(2);
    expect(vorschlagsmenge(0, 10)).toBe(10);
  });
});
