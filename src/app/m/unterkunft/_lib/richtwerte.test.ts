import { describe, expect, it } from "vitest";
import { BEFUND, RICHTWERTE, RICHTWERTE_BASIS, ZELTTYPEN, mitOverrides, zeltName } from "./richtwerte";

describe("Richtwerte aus der Basis von Lifeline Hub", () => {
  it("hat jeden Schlüssel genau einmal, mit Wert in seinen Grenzen und einer Quelle", () => {
    const schluessel = RICHTWERTE_BASIS.map((r) => r.schluessel);
    expect(new Set(schluessel).size).toBe(schluessel.length);
    for (const r of RICHTWERTE_BASIS) {
      expect(r.wert, r.schluessel).toBeGreaterThanOrEqual(r.min);
      expect(r.wert, r.schluessel).toBeLessThanOrEqual(r.max);
      expect(r.quelle.length, r.schluessel).toBeGreaterThan(0);
      if (r.ganzzahl) expect(Number.isInteger(r.wert), r.schluessel).toBe(true);
    }
  });

  it("trägt für jeden Zelttyp Feldbetten, Garnituren und Maße", () => {
    for (const { typ } of ZELTTYPEN) {
      for (const teil of ["schlafplaetze", "garnituren", "laenge_m", "breite_m"]) {
        expect(RICHTWERTE[`zelt_${typ}_${teil}`], `zelt_${typ}_${teil}`).toBeGreaterThan(0);
      }
    }
    expect(zeltName("sg40")).toBe("SG 40");
  });

  it("ordnet jedem Wert außer den Zeltdaten einen Befund zu, und nur bekannten Schlüsseln", () => {
    for (const r of RICHTWERTE_BASIS) {
      if (!r.schluessel.startsWith("zelt_sg")) expect(BEFUND[r.schluessel], r.schluessel).toMatch(/^(W\d|F6)$/);
    }
    for (const k of Object.keys(BEFUND)) expect(RICHTWERTE[k], k).toBeDefined();
  });

  it("legt Overrides über die Basis und lässt Unbekanntes und null erben", () => {
    const rw = mitOverrides({ wasser_je_person_l: 15, fremd: 9, decken_je_person: null });
    expect(rw.wasser_je_person_l).toBe(15);
    expect(rw.decken_je_person).toBe(2);
    expect("fremd" in rw).toBe(false);
    expect(RICHTWERTE.wasser_je_person_l).toBe(25);
  });
});
