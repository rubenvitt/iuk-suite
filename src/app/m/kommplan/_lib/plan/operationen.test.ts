import { describe, expect, it } from "vitest";
import { PlanFehler, fuegeStelleEin, fuegeVerbindungEin, leererPlan, naechsteReihenfolge } from "./operationen";

describe("Planoperationen", () => {
  it("leerer Plan ist gültig und hat VS-NfD an", () => {
    expect(leererPlan()).toMatchObject({ schema: 1, stellen: [], verbindungen: [], optionen: { vermerkVsNfD: true, leerzeilen: false } });
  });
  it("fügt eine Stelle mit Vorgaben ein und hängt sie ans Ende der Geschwister", () => {
    let p = fuegeStelleEin(leererPlan(), { id: "w", titel: "Wurzel" });
    p = fuegeStelleEin(p, { id: "a", titel: "A", eltern: "w" });
    p = fuegeStelleEin(p, { id: "b", titel: "B", eltern: "w" });
    expect(p.stellen.map((s) => [s.id, s.reihenfolge])).toEqual([["w", 0], ["a", 0], ["b", 1]]);
    expect(p.stellen[1]).toMatchObject({ lage: "unter", zeichen: null, kanaele: [], kontakte: [], einheiten: [], hervorheben: false });
    expect(naechsteReihenfolge(p, "w", "unter")).toBe(2);
    expect(naechsteReihenfolge(p, "w", "links")).toBe(0);
  });
  it("ist rein: die Eingabe bleibt unverändert", () => {
    const p = leererPlan();
    fuegeStelleEin(p, { id: "w", titel: "W" });
    expect(p.stellen).toEqual([]);
  });
  it("wirft PlanFehler bei verletzter Invariante", () => {
    expect(() => fuegeStelleEin(leererPlan(), { id: "x", titel: "X", eltern: "fehlt" })).toThrow(PlanFehler);
    const p = fuegeStelleEin(leererPlan(), { id: "w", titel: "W" });
    expect(() => fuegeStelleEin(p, { id: "w", titel: "doppelt" })).toThrow("ID doppelt: w");
  });
  it("fügt eine Verbindung ein", () => {
    const p = fuegeVerbindungEin(leererPlan(), { id: "v", art: "tmo", bezeichnung: "R_UE_1" });
    expect(p.verbindungen).toEqual([{ id: "v", art: "tmo", bezeichnung: "R_UE_1" }]);
  });
});
