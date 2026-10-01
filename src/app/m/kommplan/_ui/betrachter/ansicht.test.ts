import { describe, expect, it } from "vitest";
import { GRENZEN, einpassen, nachziehen, tasteZuAktion, untergrenze, verdeckterTeil, verschiebe, zoome } from "./ansicht";

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

describe("einpassen mit Optionen (Entscheidung 18)", () => {
  it("ohne Optionen wie bisher; max deckelt den Maßstab, unten hält Platz frei", () => {
    expect(einpassen(200, 100, 1000, 600)).toEqual(einpassen(200, 100, 1000, 600, {}));
    const eine = einpassen(46, 20, 1000, 600, { max: 4 }); // eine einzelne Karte
    expect(eine.massstab).toBe(4);
    expect(eine.x).toBeCloseTo((1000 - 46 * 4) / 2, 6);
    const hoch = einpassen(100, 500, 1000, 600, { unten: 80 });
    expect(hoch.massstab).toBeCloseTo((600 - 16 - 80) / 500, 6);
    const breit = einpassen(1000, 100, 1000, 600, { seite: 84 });
    expect(breit.massstab).toBeCloseTo((1000 - 2 * 84) / 1000, 6);
    expect(breit.x).toBeCloseTo(84, 6);
  });
});

describe("nachziehen: wie weit zeige() eine Karte samt Griffrand ins Bild holt (Entscheidung 18)", () => {
  const rand = { oben: 16, seite: 84, unten: 120 };
  it("eine Karte genau am Rand der eingepassten Ansicht braucht nichts — auch mit Rundungsrest", () => {
    const a = einpassen(300, 100, 1000, 600, { seite: 84, unten: 120 });
    // rechte Randkarte: ihre rechte Kante liegt rechnerisch genau bei w − seite; Gleitkomma darf nicht verschieben
    expect(nachziehen(a, { x: 254, y: 0, breite: 46, hoehe: 20 }, 1000, 600, rand)).toEqual({ dx: 0, dy: 0 });
    expect(nachziehen(a, { x: 0, y: 80, breite: 46, hoehe: 20 }, 1000, 600, rand)).toEqual({ dx: 0, dy: 0 });
    expect(nachziehen({ ...a, x: a.x + 1e-9 }, { x: 254, y: 0, breite: 46, hoehe: 20 }, 1000, 600, rand)).toEqual({ dx: 0, dy: 0 });
  });
  it("verschiebt um genau den Überstand, links wie rechts, oben wie unten", () => {
    const a = { massstab: 2, x: 0, y: 0 };
    expect(nachziehen(a, { x: 10, y: 20, breite: 40, hoehe: 20 }, 1000, 600, rand)).toEqual({ dx: 64, dy: 0 });
    expect(nachziehen(a, { x: 450, y: 20, breite: 40, hoehe: 20 }, 1000, 600, rand)).toEqual({ dx: -64, dy: 0 });
    expect(nachziehen(a, { x: 100, y: 0, breite: 40, hoehe: 20 }, 1000, 600, rand)).toEqual({ dx: 0, dy: 16 });
    expect(nachziehen(a, { x: 100, y: 240, breite: 40, hoehe: 20 }, 1000, 600, rand)).toEqual({ dx: 0, dy: -40 });
  });
});

describe("verdeckterTeil: wie viel Pixel der Fläche rechts unter einem offenen Flyin liegen (Entscheidung 18)", () => {
  it("ohne Flyin nichts; ragt die Fläche unter das Flyin, der Überstand; neben dem Flyin nichts", () => {
    expect(verdeckterTeil(1400, 900, 1440, null)).toBe(0);
    expect(verdeckterTeil(1400, 900, 1440, 520)).toBe(480); // 1400 − (1440 − 520)
    expect(verdeckterTeil(900, 400, 1440, 520)).toBe(0); // Editor hält die Flyin-Breite frei (U10)
    expect(verdeckterTeil(380, 360, 390, 520)).toBeCloseTo(380 - (390 - 390 * 0.92), 6); // Telefon: 92 vw
  });
});
