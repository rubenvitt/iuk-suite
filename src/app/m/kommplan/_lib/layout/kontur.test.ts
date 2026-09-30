import { describe, expect, it } from "vitest";
import { LEER, abstand, istLeer, maxX, minX, nebeneinander, rechteck, strecke, vereinige, verschiebe } from "./kontur";

describe("Kontur", () => {
  it("Rechteck: links = x, rechts = x + b; Höhe 0 ist leer", () => {
    const k = rechteck(2, 0, 10, 5);
    expect(k.links).toEqual([{ y0: 0, y1: 5, x: 2 }]);
    expect(k.rechts).toEqual([{ y0: 0, y1: 5, x: 12 }]);
    expect(istLeer(rechteck(0, 0, 5, 0))).toBe(true);
  });
  it("waagerechte Strecke belegt ein Band von 0,5 mm", () => {
    const k = strecke(0, 10, 20, 10);
    expect(k.links[0]).toMatchObject({ y0: 9.75, y1: 10.25 });
    expect(maxX(k)).toBeCloseTo(20.25, 9);
  });
  it("Vereinigung ist die Stufenfunktion aus min/max", () => {
    const k = vereinige(rechteck(0, 0, 10, 10), rechteck(5, 5, 20, 10));
    expect(k.links).toEqual([{ y0: 0, y1: 10, x: 0 }, { y0: 10, y1: 15, x: 5 }]);
    expect(k.rechts).toEqual([{ y0: 0, y1: 5, x: 10 }, { y0: 5, y1: 15, x: 25 }]);
  });
  it("Vereinigung mit LEER ändert nichts; benachbarte gleiche Stufen verschmelzen", () => {
    const a = rechteck(0, 0, 10, 10);
    expect(vereinige(a, LEER)).toEqual(a);
    expect(vereinige(rechteck(0, 0, 10, 5), rechteck(0, 5, 10, 5)).links).toEqual([{ y0: 0, y1: 10, x: 0 }]);
  });
  it("Abstand: nur wo sich die Höhen überlappen", () => {
    const links = vereinige(rechteck(0, 0, 10, 10), rechteck(0, 20, 50, 10));
    const rechts = rechteck(0, 0, 10, 10);
    expect(abstand(links, rechts, 8)).toBe(18);
    expect(abstand(links, rechteck(0, 20, 10, 5), 8)).toBe(58);
    expect(abstand(links, rechteck(0, 12, 10, 5), 8)).toBe(-Infinity);
  });
  it("ein schmaler, tiefer Teilbaum schiebt sich unter einen breiten, flachen", () => {
    const breitFlach = rechteck(0, 0, 100, 10);
    const schmalTief = vereinige(rechteck(0, 0, 10, 10), rechteck(-40, 30, 10, 10));
    expect(abstand(breitFlach, schmalTief, 8)).toBe(108);
  });
  it("Berührung und weniger als 2 mm Höhenabstand zählen wie Überlappung, ab 2 mm nicht", () => {
    expect(abstand(rechteck(0, 0, 10, 10), rechteck(0, 10, 10, 10), 8)).toBe(18);
    expect(abstand(rechteck(0, 0, 10, 10), rechteck(0, 11.5, 10, 10), 8)).toBe(18);
    expect(abstand(rechteck(0, 0, 10, 10), rechteck(0, 12, 10, 10), 8)).toBe(-Infinity);
  });
  it("nebeneinander ohne Überlappung: rechts neben alles", () => {
    expect(nebeneinander(rechteck(0, 0, 10, 10), rechteck(5, 50, 10, 10), 8)).toBe(13);
  });
  it("Verschieben verschiebt beide Seiten", () => {
    const k = verschiebe(rechteck(0, 0, 10, 10), 5, 3);
    expect(minX(k)).toBe(5);
    expect(maxX(k)).toBe(15);
    expect(k.links[0]).toMatchObject({ y0: 3, y1: 13 });
  });
});
