import { describe, expect, it } from "vitest";
import { baue, type StelleEingabe } from "../beispiele/bau";
import type { Verbindung } from "../plan/schema";
import { budgetFuer } from "./gruppen";
import { maxX, minX } from "./kontur";
import { ABSTAND, EINHEIT, KARTE, STIEL } from "./masse";
import { setzeTeilbaum, umgebungFuer } from "./teilbaum";
import type { KarteL, Ziel } from "./typen";

const V: Verbindung[] = [
  { id: "v2", art: "tmo", bezeichnung: "R_UE_2" },
  { id: "v3", art: "tmo", bezeichnung: "R_UE_3" },
  { id: "v4", art: "dmo", bezeichnung: "DMO 608" },
];
function setze(stellen: StelleEingabe[], budget?: number, ziel: Ziel = "bildschirm") {
  const u = umgebungFuer(baue({ verbindungen: V, stellen }), ziel, {}, budget);
  const t = setzeTeilbaum(u.sicht.wurzeln[0], 0, u);
  const karte = (id: string) => t.elemente.karten.find((k) => k.id === id)!;
  return { t, u, karte };
}
const mitte = (k: KarteL) => k.x + k.breite / 2;
const kinder = (eltern: string, n: number, verbindung?: string): StelleEingabe[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${eltern}${i}`, titel: `K${i}`, eltern, verbindung }));

describe("Teilbaum", () => {
  it("Elternstelle mittig über der Busspanne; Kinder oben bündig im Abstand 8", () => {
    const { t, u, karte } = setze([{ id: "r", titel: "R" }, ...kinder("r", 3, "v2")]);
    const sp = t.elemente.spannen.find((s) => s.stelleId === "r")!;
    expect(mitte(karte("r"))).toBeCloseTo((sp.links + sp.rechts) / 2, 9);
    const ks = ["r0", "r1", "r2"].map(karte);
    expect(new Set(ks.map((k) => k.y)).size).toBe(1);
    expect(ks[0].y).toBeCloseTo(u.zeilen.hoehe[0] + u.zeilen.luecke[0], 9);
    expect(ks[1].x - ks[0].x).toBeCloseTo(KARTE.breite + ABSTAND.geschwister, 9);
  });

  it("zwei Verbindungen: zwei Sechsecke, zwei Netze, getrennte Busse, eigene Stiele ab der Kartenunterkante", () => {
    const { t, karte } = setze([{ id: "el", titel: "EL" }, ...kinder("el", 3, "v2"), { id: "d", titel: "D", eltern: "el", verbindung: "v3" }]);
    expect(t.elemente.sechsecke.map((s) => s.beschriftung.text).sort()).toEqual(["R_UE_2", "R_UE_3"]);
    expect(karte("d").x - (karte("el2").x + KARTE.breite)).toBeGreaterThanOrEqual(ABSTAND.gruppen - 1e-9);
    const el = karte("el");
    for (const netz of ["el>v2", "el>v3"]) {
      const linien = t.elemente.linien.filter((l) => l.netz === netz);
      expect(linien.some((l) => l.x1 === l.x2 && l.y1 === el.hoehe && l.x1 > el.x && l.x1 < el.x + el.breite), netz).toBe(true);
    }
    const busY = karte("el0").y - STIEL.busZuKarte;
    const busse = t.elemente.linien.filter((l) => l.y1 === l.y2 && Math.abs(l.y1 - busY) < 1e-9 && l.x1 !== l.x2);
    expect(busse.map((b) => b.netz)).toEqual(["el>v2"]); // v3 hat nur ein Kind: kein waagerechter Bus
  });

  it("Kinder ohne Verbindung: dünne Linie, kein Sechseck", () => {
    const { t } = setze([{ id: "r", titel: "R" }, ...kinder("r", 2)]);
    expect(t.elemente.sechsecke).toEqual([]);
    expect(t.elemente.linien.every((l) => l.duenn)).toBe(true);
  });

  it("Kamm: 8 Kinder, Budget 320 mm (6 × 46 + 5 × 8 = 316) → zwei Reihen unter demselben Bus, Rücken links", () => {
    const { t, karte } = setze([{ id: "r", titel: "R" }, ...kinder("r", 8, "v2")], 320);
    const reihe0 = [0, 1, 2, 3, 4, 5].map((i) => karte(`r${i}`));
    const reihe1 = [6, 7].map((i) => karte(`r${i}`));
    expect(new Set(reihe0.map((k) => k.y)).size).toBe(1);
    expect(reihe1[0].y).toBeCloseTo(reihe1[1].y, 9);
    expect(reihe1[0].y).toBeGreaterThanOrEqual(reihe0[0].y + reihe0[0].hoehe + ABSTAND.kammReihe - 1e-9);
    expect(reihe1[0].x).toBeCloseTo(reihe0[0].x, 9);
    const ruecken = t.elemente.linien.find((l) => l.netz === "r>v2" && l.x1 === l.x2 && l.x1 < reihe0[0].x)!;
    expect(ruecken.x1).toBeCloseTo(reihe0[0].x - ABSTAND.kammEinzug, 9);
    expect(ruecken.y2).toBeCloseTo(reihe1[0].y - STIEL.busZuKarte, 9);
  });

  it("das Budget gilt für die ganze Kinderreihe: drei Verbindungen à fünf Kinder auf A4 kämmen alle", () => {
    const stellen: StelleEingabe[] = [{ id: "r", titel: "R" },
      ...["v2", "v3", "v4"].flatMap((v) => kinder(`r-${v}-`, 5, v).map((k) => ({ ...k, eltern: "r" })))];
    const { t, u, karte } = setze(stellen, undefined, "a4-quer");
    expect(u.gruppen(u.sicht.wurzeln[0]).map((g) => g.reihen.length)).toEqual([3, 3, 3]);
    const r = karte("r");
    const breite = maxX(t.kontur) - minX(t.kontur);
    expect(breite).toBeLessThanOrEqual(budgetFuer("a4-quer"));
    expect(breite).toBeGreaterThan(r.breite);
  });

  it("Kinder mit eigenen Unterstellen kämmen nicht — auch wenn die Reihe das Budget sprengt", () => {
    const stellen: StelleEingabe[] = [{ id: "r", titel: "R" }];
    for (let i = 0; i < 12; i++) {
      stellen.push({ id: `eal${i}`, titel: `EAL ${i}`, eltern: "r", verbindung: "v2" });
      for (let e = 0; e < 3; e++) stellen.push({ id: `ea-${i}-${e}`, titel: `EA ${e}`, eltern: `eal${i}`, verbindung: "v4" });
    }
    const { u } = setze(stellen);
    expect(u.gruppen(u.sicht.wurzeln[0]).map((g) => g.reihen.length)).toEqual([1]);
  });

  it("Einheiten und Kinder: der Stiel läuft in der Gasse links neben der Einheitenspalte", () => {
    const { t, karte } = setze([{ id: "r", titel: "R", einheiten: ["RTW 1", "RTW 2"] }, ...kinder("r", 2, "v2")]);
    const r = karte("r");
    const stiel = t.elemente.linien.find((l) => l.netz === "r>v2" && l.x1 === l.x2 && l.y1 === r.hoehe)!;
    expect(stiel.x1).toBeCloseTo(STIEL.gasseStart, 9);
    const ersteEinheit = t.elemente.einheiten.find((e) => e.stelleId === "r")!;
    expect(stiel.x1).toBeLessThan(ersteEinheit.x);
    expect(stiel.y2).toBeGreaterThanOrEqual(ersteEinheit.y + EINHEIT.hoehe);
  });

  it("Kanäle und Kinder: Stiel links in der Gasse, Kanallinie rechts daneben, Sechsecke im Block", () => {
    const { t, karte } = setze([
      { id: "r", titel: "R", kanaele: ["v4", "v3"], einheiten: ["RTW 1"] }, ...kinder("r", 2, "v2"),
    ]);
    const r = karte("r");
    const stiel = t.elemente.linien.find((l) => l.netz === "r>v2" && l.x1 === l.x2 && l.y1 === r.hoehe)!;
    const kanal = t.elemente.linien.find((l) => l.netz === "r#kanal" && l.x1 === l.x2)!;
    expect(stiel.x1).toBeLessThan(kanal.x1);
    expect(t.elemente.sechsecke.filter((s) => s.netz === "r#kanal").map((s) => s.verbindungId)).toEqual(["v4", "v3"]);
    const ersteEinheit = t.elemente.einheiten.find((e) => e.stelleId === "r")!;
    expect(ersteEinheit.y).toBeGreaterThan(Math.max(...t.elemente.sechsecke.filter((s) => s.netz === "r#kanal").map((s) => s.y)));
  });

  it("ein schmaler, tiefer Nachbar rückt an die Karte heran, nicht an die breite Ebene darunter", () => {
    const { karte } = setze([
      { id: "r", titel: "R" }, { id: "a", titel: "A", eltern: "r" }, { id: "a1", titel: "A1", eltern: "a" },
      ...kinder("a1", 6), { id: "b", titel: "B", eltern: "r" },
    ]);
    expect(karte("b").x - karte("a").x).toBeCloseTo(KARTE.breite + ABSTAND.geschwister, 9);
  });

  it("die Einheitenspalte belegt Platz: ein Nachbar rückt nicht hinein", () => {
    const zwoelf = Array.from({ length: 12 }, (_, i) => `RTW ${i}`);
    const { karte } = setze([{ id: "r", titel: "R" }, { id: "a", titel: "A", eltern: "r", einheiten: zwoelf }, { id: "b", titel: "B", eltern: "r" }]);
    expect(karte("b").x - karte("a").x).toBeCloseTo(EINHEIT.einzugMin + 2 * EINHEIT.breite + EINHEIT.spaltenAbstand + ABSTAND.geschwister, 9);
  });

  it("alle Karten einer Tiefe stehen oben bündig, auch über Teilbäume hinweg", () => {
    const neun = Array.from({ length: 9 }, (_, i) => `KTW ${i}`);
    const { karte } = setze([
      { id: "r", titel: "R" }, { id: "a", titel: "A", eltern: "r", einheiten: neun }, { id: "a1", titel: "A1", eltern: "a" },
      { id: "b", titel: "B", eltern: "r" }, { id: "b1", titel: "B1", eltern: "b" },
    ]);
    expect(karte("a1").y).toBeCloseTo(karte("b1").y, 9);
  });
});
