import { describe, expect, it } from "vitest";
import { geltende, pruefplan, selbstPruefung, type PruefartZeile } from "./pruefplan";

const KATALOG: PruefartZeile[] = [
  { id: "dguv", name: "Elektroprüfung", wer: "elektrofachkraft", monate: 12, stunden: null, position: 1 },
  { id: "quartal", name: "Quartalsprüfung", wer: "intern", monate: 3, stunden: null, position: 0 },
  { id: "motor", name: "Motorwartung", wer: "fachfirma", monate: 12, stunden: 100, position: 2 },
];

describe("Prüfplan eines Geräts (IDA-368)", () => {
  it("ohne Abweichung gilt, was die Art hat, in der Reihenfolge des Katalogs", () => {
    const plan = pruefplan(KATALOG, ["dguv", "quartal"], []);
    expect(geltende(plan).map((v) => v.id)).toEqual(["quartal", "dguv"]);
    expect(selbstPruefung(plan)?.id).toBe("quartal");
  });

  it("abgewählt, zusätzlich und eigenes Intervall", () => {
    const plan = pruefplan(KATALOG, ["quartal", "dguv"], [
      { pruefartId: "dguv", an: false, monate: null, stunden: null },
      { pruefartId: "motor", an: true, monate: 24, stunden: null },
    ]);
    expect(plan.map((p) => [p.pruefart.id, p.standard, p.an])).toEqual([["quartal", true, true], ["dguv", true, false], ["motor", false, true]]);
    // Das eigene Intervall ersetzt beide Werte: 24 Monate, nicht mehr nach Stunden.
    expect(geltende(plan).find((v) => v.id === "motor")).toMatchObject({ monate: 24, stunden: null });
  });

  it("eine Abwahl ohne Standard und ein leeres eigenes Intervall ändern nichts", () => {
    const plan = pruefplan(KATALOG, ["quartal"], [
      { pruefartId: "motor", an: false, monate: null, stunden: null },
      { pruefartId: "quartal", an: true, monate: null, stunden: null },
    ]);
    expect(plan.map((p) => p.pruefart.id)).toEqual(["quartal"]);
    expect(plan[0].eigenes).toBeNull();
  });
});
