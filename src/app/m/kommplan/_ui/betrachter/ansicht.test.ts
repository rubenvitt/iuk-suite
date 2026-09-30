import { describe, expect, it } from "vitest";
import { GRENZEN, einpassen, tasteZuAktion, untergrenze, verschiebe, zoome } from "./ansicht";

describe("Ansicht", () => {
  it("einpassen: ganze Zeichnung sichtbar, waagerecht mittig", () => {
    const a = einpassen(200, 100, 1000, 600);
    expect(a.massstab).toBeCloseTo(Math.min(968 / 200, 568 / 100), 9);
    expect(a.x + 200 * a.massstab / 2).toBeCloseTo(500, 9);
  });
  it("einpassen: auch eine sehr breite Zeichnung auf Telefonbreite ganz, weiter herauszoomen nicht", () => {
    // große Stab-Lage am Bildschirm: 1789 × 239 mm, Fenster 375 px
    const a = einpassen(1789, 239, 375, 600);
    expect(a.x).toBeGreaterThanOrEqual(16 - 1e-9);
    expect(a.x + 1789 * a.massstab).toBeLessThanOrEqual(375 - 16 + 1e-9);
    expect(a.massstab).toBeLessThan(GRENZEN.min);
    expect(zoome(a, 1 / 1.25, 0, 0, untergrenze(a)).massstab).toBeCloseTo(a.massstab, 9);
    expect(zoome(a, 1.25, 0, 0, untergrenze(a)).massstab).toBeCloseTo(a.massstab * 1.25, 9);
    expect(untergrenze(einpassen(200, 100, 1000, 600))).toBe(GRENZEN.min);
  });
  it("einpassen ohne Maße (jsdom, leerer Plan) liefert einen festen Anfang", () => {
    expect(einpassen(0, 0, 0, 0)).toEqual({ massstab: 4, x: 16, y: 16 });
  });
  it("zoomen hält den Punkt unter dem Zeiger fest und klemmt", () => {
    const a = { massstab: 2, x: 10, y: 20 };
    const b = zoome(a, 2, 110, 120);
    expect((110 - b.x) / b.massstab).toBeCloseTo((110 - a.x) / a.massstab, 9);
    expect(zoome(a, 1000, 0, 0).massstab).toBe(GRENZEN.max);
    expect(zoome(a, 0.0001, 0, 0).massstab).toBe(GRENZEN.min);
  });
  it("verschieben und Tasten", () => {
    expect(verschiebe({ massstab: 1, x: 0, y: 0 }, 5, -3)).toEqual({ massstab: 1, x: 5, y: -3 });
    expect(tasteZuAktion("+")).toEqual({ art: "zoom", faktor: 1.25 });
    expect(tasteZuAktion("0")).toEqual({ art: "einpassen" });
    expect(tasteZuAktion("ArrowRight")).toEqual({ art: "verschiebe", dx: -48, dy: 0 });
    expect(tasteZuAktion("x")).toBeNull();
  });
});
