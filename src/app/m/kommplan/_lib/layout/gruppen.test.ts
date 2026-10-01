import { describe, expect, it } from "vitest";
import { baue } from "../beispiele/bau";
import { baueBaum } from "../plan/baum";
import type { Stelle } from "../plan/schema";
import {
  anzeigereihenfolge, bildeGruppen, budgetFuer, gruppenAnzahl, gruppenBreite, reihenNachBreite,
} from "./gruppen";
import { LINIEN_LUFT } from "./kontur";
import { ABSTAND } from "./masse";

const V = ["v1", "v2", "v3"].map((id) => ({ id, art: "tmo" as const, bezeichnung: id }));
const plan = baue({
  verbindungen: [{ id: "v2", art: "tmo", bezeichnung: "R_UE_2" }, { id: "v3", art: "tmo", bezeichnung: "R_UE_3" }],
  stellen: [
    { id: "el", titel: "EL" },
    { id: "a", titel: "A", eltern: "el", verbindung: "v2" },
    { id: "b", titel: "B", eltern: "el", verbindung: "v3" },
    { id: "c", titel: "C", eltern: "el", verbindung: "v2" },
    { id: "d", titel: "D", eltern: "el" },
  ],
});
const kinder = baueBaum(plan).unter("el");
/** n Kinder einer Wurzel; `verbindung(i)` legt die Gruppe fest. */
function reihe(n: number, verbindung: (i: number) => string): Stelle[] {
  const p = baue({ verbindungen: V, stellen: [
    { id: "w", titel: "W" },
    ...Array.from({ length: n }, (_, i) => ({ id: `k${i}`, titel: `K${i}`, eltern: "w", verbindung: verbindung(i) })),
  ] });
  return baueBaum(p).unter("w");
}
const B46 = () => 46;
const immer = () => true;

describe("Busgruppen", () => {
  it("Geschwister mit derselben Verbindung stehen zusammen; Gruppen nach kleinster reihenfolge", () => {
    const g = bildeGruppen(kinder, B46, Infinity, immer);
    expect(g.map((x) => [x.verbindungId, x.kinder.map((k) => k.id)])).toEqual([["v2", ["a", "c"]], ["v3", ["b"]], [null, ["d"]]]);
    expect(g.every((x) => x.reihen.length === 1)).toBe(true);
    expect(gruppenAnzahl(kinder)).toBe(3);
    expect(anzeigereihenfolge(kinder).map((k) => k.id)).toEqual(["a", "c", "b", "d"]);
  });
});

describe("Kamm nach Breite über die ganze Kinderreihe (Spec §5.5, Abweichung 13)", () => {
  it("Reihen gierig nach Breite; ein zu breites Kind steht allein, nie gar keins", () => {
    expect(reihenNachBreite(Array.from({ length: 13 }, (_, i) => i), B46, 316).map((r) => r.length)).toEqual([6, 6, 1]);
    expect(reihenNachBreite([100, 30, 30], (x) => x, 90)).toEqual([[100], [30, 30]]);
    expect(reihenNachBreite([], B46, 100)).toEqual([]);
  });
  it("Budget: A4 quer 369,3 mm, A3 quer und Bildschirm 533,3 mm", () => {
    expect(budgetFuer("a4-quer")).toBeCloseTo(277 / 0.75, 9);
    expect(budgetFuer("a3-quer")).toBeCloseTo(400 / 0.75, 9);
    expect(budgetFuer("bildschirm")).toBe(budgetFuer("a3-quer"));
  });
  it("eine Gruppe bricht erst um, wenn ihre Reihe das Budget sprengt — dann mit Kammrücken", () => {
    const acht = reihe(8, () => "v1");
    expect(bildeGruppen(acht, B46, 8 * 46 + 7 * 8, immer)[0].reihen.map((r) => r.length)).toEqual([8]);
    const g = bildeGruppen(acht, B46, 320, immer)[0];
    expect(g.reihen.map((r) => r.length)).toEqual([6, 2]);
    expect(gruppenBreite(g.reihen, B46)).toBeCloseTo(6 * 46 + 5 * 8 + ABSTAND.kammEinzug + LINIEN_LUFT / 2, 9);
  });
  it("das Budget gilt für ALLE Gruppen einer Stelle: drei Gruppen à fünf Kinder auf A4 kämmen jede", () => {
    const g = bildeGruppen(reihe(15, (i) => V[Math.floor(i / 5)].id), B46, budgetFuer("a4-quer"), immer);
    expect(g.map((x) => x.reihen.map((r) => r.length))).toEqual([[2, 2, 1], [2, 2, 1], [2, 2, 1]]);
    const summe = g.reduce((s, x) => s + gruppenBreite(x.reihen, B46), 0) + 2 * ABSTAND.gruppen;
    expect(summe).toBeLessThanOrEqual(budgetFuer("a4-quer"));
  });
  it("breite Kinder zählen mit ihrem Zeilenblock: sechs à 88 mm (zwei Einheitenspalten) und eines à 208 mm (Seitenstellen)", () => {
    const breite = (s: Stelle) => (s.id === "k6" ? 208 : 88);
    const g = bildeGruppen(reihe(7, () => "v1"), breite, budgetFuer("a4-quer"), immer)[0];
    expect(g.reihen.map((r) => r.length)).toEqual([3, 3, 1]);
    expect(gruppenBreite(g.reihen, breite)).toBeLessThanOrEqual(budgetFuer("a4-quer"));
  });
  it("eine Gruppe, in der ein Kind eigene Unterstellen zeigt, kämmt nie", () => {
    expect(bildeGruppen(reihe(8, () => "v1"), B46, 100, (s) => s.id !== "k3")[0].reihen).toHaveLength(1);
  });
  it("endet, auch wenn nichts mehr schrumpfen kann (jedes Kind allein breiter als das Budget)", () => {
    expect(bildeGruppen(reihe(8, () => "v1"), () => 500, 100, immer)[0].reihen.map((r) => r.length)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });
});
