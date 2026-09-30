import { describe, expect, it } from "vitest";
import { baue, type StelleEingabe } from "../beispiele/bau";
import { leererPlan } from "../plan/operationen";
import { layout } from "./layout";
import { BLATT, MIN_MASSSTAB, PAPIER } from "./masse";
import { legendenZeilen, massstabFuer, teileAuf, zeichenflaeche } from "./papier";

function grosserPlan() {
  const stellen: StelleEingabe[] = [{ id: "w", titel: "Stab" }];
  for (let i = 0; i < 5; i++) {
    stellen.push({ id: `a${i}`, titel: `EAL ${i}`, eltern: "w", verbindung: "v" });
    for (let j = 0; j < 8; j++) stellen.push({ id: `a${i}-${j}`, titel: `EA ${i}.${j}`, eltern: `a${i}`, einheiten: ["RTW 1", "RTW 2", "KTW 3", "KTW 4", "MTW 5"] });
  }
  return baue({ verbindungen: [{ id: "v", art: "tmo", bezeichnung: "R_UE_2" }], stellen });
}
const normaleKarten = (blaetter: ReturnType<typeof teileAuf>) =>
  blaetter.flatMap((b) => b.zeichnung.karten.filter((k) => k.art === "normal").map((k) => k.id));

describe("Papier", () => {
  it("Zeichenfläche A4 quer: Ränder, Kopf, Fuß, Legende", () => {
    expect(zeichenflaeche("a4-quer", 0)).toEqual({ x: 10, y: 22, breite: 277, hoehe: 210 - 22 - 8 - 7 });
    expect(zeichenflaeche("a4-quer", 2).hoehe).toBeCloseTo(210 - 22 - 8 - 7 - (2 * BLATT.legendeZeile + BLATT.legendeRand), 9);
  });
  it("Legende bricht in Zeilen um", () => {
    const viele = Array.from({ length: 30 }, (_, i) => ({ art: "tmo" as const, text: `Reserve K_UE_${i}`, reserve: true }));
    expect(legendenZeilen(viele, 277).length).toBeGreaterThan(1);
    expect(legendenZeilen([], 277)).toEqual([]);
  });
  it("Maßstab: nie größer als 1, leer = 1", () => {
    expect(massstabFuer({ breite: 0, hoehe: 0 } as never, { breite: 277, hoehe: 150 })).toBe(1);
    expect(massstabFuer({ breite: 100, hoehe: 50 } as never, { breite: 277, hoehe: 150 })).toBe(1);
    expect(massstabFuer({ breite: 554, hoehe: 50 } as never, { breite: 277, hoehe: 150 })).toBe(0.5);
  });
  it("leerer Plan: genau ein Blatt", () => {
    const b = teileAuf(leererPlan(), "a4-quer");
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ nummer: 1, von: 1, massstab: 1, unterMindestschrift: false });
  });
  it("ein kleiner Plan passt auf ein Blatt, waagerecht mittig", () => {
    const b = teileAuf(baue({ stellen: [{ id: "a", titel: "A" }, { id: "b", titel: "B", eltern: "a" }] }), "a4-quer");
    expect(b).toHaveLength(1);
    expect(b[0].ursprung.x + (b[0].zeichnung.breite * b[0].massstab) / 2).toBeCloseTo(PAPIER["a4-quer"].breite / 2, 6);
  });
  it("ein zu großer Plan teilt gierig auf: Verweiskarten, Anker, jede Stelle genau einmal", () => {
    const inhalt = grosserPlan();
    const b = teileAuf(inhalt, "a4-quer");
    expect(b.map((x) => x.nummer)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const blatt of b) {
      expect(blatt.von).toBe(6);
      expect(blatt.massstab).toBeGreaterThanOrEqual(MIN_MASSSTAB);
    }
    const verweise = b[0].zeichnung.karten.filter((k) => k.art === "verweis");
    expect(verweise.map((k) => k.verweis?.text)).toEqual(["→ Blatt 2", "→ Blatt 3", "→ Blatt 4", "→ Blatt 5", "→ Blatt 6"]);
    expect(b[1].zeichnung.karten.find((k) => k.id === "w")?.art).toBe("anker");
    expect(normaleKarten(b).sort()).toEqual(inhalt.stellen.map((s) => s.id).sort());
    expect(teileAuf(inhalt, "a4-quer")).toEqual(b);
  });
  it("unteilbar: ein Blatt unter Mindestschrift, kein Endlosversuch", () => {
    const sechzig = Array.from({ length: 60 }, (_, i) => `RTW ${i}`);
    const inhalt = baue({ stellen: [
      { id: "w", titel: "W", einheiten: sechzig },
      ...[1, 2, 3].map((i) => ({ id: `l${i}`, titel: `L${i}`, eltern: "w", lage: "links" as const, einheiten: sechzig })),
    ] });
    const b = teileAuf(inhalt, "a4-quer");
    expect(b).toHaveLength(1);
    expect(b[0].unterMindestschrift).toBe(true);
  });
  it("Blatt 1 behält die oberen Ebenen: LtS → EL → fünf EAL → je acht EA", () => {
    const stellen: StelleEingabe[] = [{ id: "lts", titel: "Leitstelle" }, { id: "el", titel: "EL", eltern: "lts", verbindung: "v" }];
    for (let a = 0; a < 5; a++) {
      stellen.push({ id: `eal-${a}`, titel: `EAL ${a}`, eltern: "el", verbindung: "v" });
      for (let e = 0; e < 8; e++) stellen.push({ id: `ea-${a}-${e}`, titel: `EA ${a}.${e}`, eltern: `eal-${a}`, einheiten: ["RTW 1", "KTW 2", "MTW 3"] });
    }
    const b = teileAuf(baue({ verbindungen: [{ id: "v", art: "tmo", bezeichnung: "R_UE_2" }], stellen }), "a4-quer");
    const erstes = b[0].zeichnung.karten;
    expect(erstes.find((k) => k.id === "el")?.art).toBe("normal"); // früher: EL als Verweis, Blatt 1 fast leer
    for (let a = 0; a < 5; a++) expect(erstes.some((k) => k.id === `eal-${a}`), `eal-${a} auf Blatt 1`).toBe(true);
    expect(erstes.some((k) => k.art === "verweis")).toBe(true);
    for (const blatt of b) expect(blatt.massstab).toBeGreaterThanOrEqual(MIN_MASSSTAB);
  });
  it("Verweisnummern steigen von links nach rechts, auch bei ungleich großen Teilbäumen", () => {
    const stellen: StelleEingabe[] = [{ id: "w", titel: "W" }];
    [2, 11, 5, 8].forEach((n, i) => {
      stellen.push({ id: `c${i}`, titel: `C${i}`, eltern: "w", verbindung: "v" });
      for (let e = 0; e < n; e++) stellen.push({ id: `c${i}-${e}`, titel: `EA ${e}`, eltern: `c${i}`, einheiten: ["RTW 1", "KTW 2", "MTW 3", "ELW 4"] });
    });
    const b = teileAuf(baue({ verbindungen: [{ id: "v", art: "tmo", bezeichnung: "R_UE_2" }], stellen }), "a4-quer");
    const verweise = b[0].zeichnung.karten.filter((k) => k.art === "verweis").sort((p, q) => p.x - q.x);
    expect(verweise.length).toBeGreaterThanOrEqual(2);
    expect(new Set(verweise.map((k) => k.y)).size).toBe(1);
    const nummern = verweise.map((k) => Number(k.verweis!.text.replace("→ Blatt ", "")));
    expect(nummern).toEqual([...nummern].sort((p, q) => p - q));
    verweise.forEach((k, i) => expect(b[nummern[i] - 1].wurzelId).toBe(k.id));
  });
  it("mehrere Wurzeln, die zusammen nicht passen: eine Wurzel bekommt ein eigenes Blatt ohne Anker", () => {
    const stellen: StelleEingabe[] = ["a", "b"].flatMap((w) => [
      { id: w, titel: w.toUpperCase() },
      ...Array.from({ length: 5 }, (_, i) => ({ id: `${w}${i}`, titel: `K${i}`, eltern: w, verbindung: "v" })),
    ]);
    const inhalt = baue({ verbindungen: [{ id: "v", art: "tmo", bezeichnung: "R_UE_2" }], stellen });
    const b = teileAuf(inhalt, "a4-quer");
    expect(b.length).toBeGreaterThanOrEqual(2);
    for (const blatt of b) expect(blatt.massstab).toBeGreaterThanOrEqual(MIN_MASSSTAB);
    expect(b.some((blatt) => blatt.wurzelId !== null && blatt.ankerId === null)).toBe(true);
    expect(normaleKarten(b).sort()).toEqual(inhalt.stellen.map((s) => s.id).sort());
  });
  it("breite Kinderreihen passen durch den Kamm auf EIN Blatt (drei Verbindungen à fünf; sechs breite Kinder und eines mit zwei Seitenstellen)", () => {
    const V = [{ id: "v", art: "tmo" as const, bezeichnung: "R_UE_2" }, { id: "w2", art: "tmo" as const, bezeichnung: "R_UE_3" },
      { id: "x", art: "tmo" as const, bezeichnung: "R_UE_4" }, { id: "d", art: "draht" as const, bezeichnung: "Standleitung" }];
    const blatt = (n: number, v: string, rest: object = {}) =>
      Array.from({ length: n }, (_, i) => ({ id: `${v}-${i}`, titel: `EA ${i}`, eltern: "w", verbindung: v, ...rest }));
    const drei = baue({ verbindungen: V, stellen: [{ id: "w", titel: "W" }, ...blatt(5, "v"), ...blatt(5, "w2"), ...blatt(5, "x")] });
    const zwoelf = Array.from({ length: 12 }, (_, i) => `RTW ${i}`);
    const breit = baue({ verbindungen: V, stellen: [
      { id: "w", titel: "W" }, ...blatt(6, "v", { einheiten: zwoelf }),
      { id: "breit", titel: "Breit", eltern: "w", verbindung: "v" },
      { id: "bl", titel: "L", eltern: "breit", lage: "links", verbindung: "d" },
      { id: "br", titel: "R", eltern: "breit", lage: "rechts", verbindung: "d" },
    ] });
    for (const inhalt of [drei, breit]) {
      const b = teileAuf(inhalt, "a4-quer");
      expect(b).toHaveLength(1);
      expect(b[0].massstab).toBeGreaterThanOrEqual(MIN_MASSSTAB);
    }
  });
  it("layout(): Bildschirm ohne Seiten, Papier mit", () => {
    const inhalt = grosserPlan();
    expect(layout(inhalt, "bildschirm").seiten).toEqual([]);
    expect(layout(inhalt, "a4-quer").seiten).toHaveLength(6);
  });
});
