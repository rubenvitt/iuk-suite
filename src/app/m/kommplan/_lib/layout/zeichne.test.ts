import { describe, expect, it } from "vitest";
import { baue } from "../beispiele/bau";
import { leererPlan } from "../plan/operationen";
import { budgetFuer } from "./gruppen";
import { ABSTAND } from "./masse";
import { zeichne } from "./zeichne";

const V = [
  { id: "r1", art: "tmo" as const, bezeichnung: "R_UE_1" },
  { id: "d", art: "draht" as const, bezeichnung: "Standleitung" },
  { id: "k2", art: "tmo" as const, bezeichnung: "K_UE_2" },
];

describe("zeichne", () => {
  it("leerer Plan: nichts, Breite und Höhe 0, keine Legende", () => {
    expect(zeichne(leererPlan(), "bildschirm")).toMatchObject({ breite: 0, hoehe: 0, karten: [], linien: [], legende: [] });
  });
  it("jede sichtbare Stelle genau einmal als Karte, normiert auf 0/0", () => {
    const p = baue({ verbindungen: V, stellen: [
      { id: "lts", titel: "Leitstelle" }, { id: "el", titel: "EL", eltern: "lts", verbindung: "r1" },
      { id: "s", titel: "S", eltern: "el", lage: "links", verbindung: "d" },
    ] });
    const z = zeichne(p, "bildschirm");
    expect(z.karten.map((k) => k.id).sort()).toEqual(["el", "lts", "s"]);
    const xs = [...z.karten.map((k) => k.x), ...z.linien.flatMap((l) => [l.x1, l.x2]), ...z.sechsecke.map((s) => s.x)];
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.min(...xs)).toBeLessThan(1);
    expect(Math.min(...z.karten.map((k) => k.y))).toBe(0);
    expect(Math.max(...z.karten.map((k) => k.x + k.breite))).toBeLessThanOrEqual(z.breite + 1e-9);
  });
  it("mehrere Wurzeln stehen nebeneinander, oben bündig, mit 16 mm Abstand", () => {
    const z = zeichne(baue({ stellen: [{ id: "a", titel: "A" }, { id: "b", titel: "B" }] }), "bildschirm");
    const [a, b] = ["a", "b"].map((id) => z.karten.find((k) => k.id === id)!);
    expect(a.y).toBe(b.y);
    expect(b.x - (a.x + a.breite)).toBeCloseTo(ABSTAND.wurzeln, 6);
  });
  it("mehr Wurzeln, als das Budget fasst, brechen in eine zweite Reihe um, 16 mm unter der ersten", () => {
    const z = zeichne(baue({ stellen: Array.from({ length: 9 }, (_, i) => ({ id: `w${i}`, titel: `W ${i}` })) }), "a4-quer");
    expect(z.breite).toBeLessThanOrEqual(budgetFuer("a4-quer") + 1e-9);
    const ys = [...new Set(z.karten.map((k) => k.y))].sort((a, b) => a - b);
    expect(ys).toHaveLength(2);
    const ersteReihe = z.karten.filter((k) => k.y === ys[0]);
    expect(ys[1] - Math.max(...ersteReihe.map((k) => k.y + k.hoehe))).toBeCloseTo(ABSTAND.wurzeln, 6);
    // Reihenfolge bleibt die Lesereihenfolge: erst die ganze erste Reihe, dann die zweite
    expect(z.karten.map((k) => k.id)).toEqual(Array.from({ length: 9 }, (_, i) => `w${i}`));
  });
  it("Legende: gezeichnete Arten in fester Reihenfolge, dann Reserve", () => {
    const p = baue({ verbindungen: V, stellen: [
      { id: "lts", titel: "L" }, { id: "el", titel: "EL", eltern: "lts", verbindung: "r1" },
      { id: "s", titel: "S", eltern: "el", lage: "links", verbindung: "d" },
    ] });
    expect(zeichne(p, "bildschirm").legende).toEqual([
      { art: "tmo", text: "Digitalfunk TMO", reserve: false },
      { art: "draht", text: "Draht", reserve: false },
      { art: "tmo", text: "Reserve K_UE_2", reserve: true },
    ]);
  });
  it("ein benutzter Kanal ist keine Reserve, seine Art steht in der Legende", () => {
    const p = baue({ verbindungen: [...V, { id: "dmo", art: "dmo", bezeichnung: "DMO 608" }], stellen: [
      { id: "lts", titel: "L" }, { id: "ea", titel: "EA", eltern: "lts", verbindung: "r1", kanaele: ["dmo", "k2"] },
    ] });
    expect(zeichne(p, "bildschirm").legende).toEqual([
      { art: "tmo", text: "Digitalfunk TMO", reserve: false },
      { art: "dmo", text: "Digitalfunk DMO", reserve: false },
      { art: "draht", text: "Reserve Standleitung", reserve: true },
    ]);
  });
  it("Plan nur mit Reservekanälen: Legende nur Reserve", () => {
    const p = baue({ verbindungen: [V[2]], stellen: [{ id: "a", titel: "A" }] });
    expect(zeichne(p, "a4-quer").legende).toEqual([{ art: "tmo", text: "Reserve K_UE_2", reserve: true }]);
  });
  it("Einklappen: Kinder verschwinden, das Abzeichen zählt sie", () => {
    const p = baue({ stellen: [{ id: "w", titel: "W" }, { id: "a", titel: "A", eltern: "w" }, { id: "b", titel: "B", eltern: "a" }] });
    const z = zeichne(p, "bildschirm", { eingeklappt: new Set(["w"]) });
    expect(z.karten.map((k) => k.id)).toEqual(["w"]);
    expect(z.abzeichen[0].text.text).toBe("+2 Stellen");
    expect(z.karten[0]).toMatchObject({ einklappbar: true, eingeklappt: true });
  });
});
