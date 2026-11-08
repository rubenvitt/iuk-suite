import { describe, expect, it } from "vitest";
import { fristStand } from "./fristen";
import { geltende, pruefplan, pruefungAmGeraet, punktGilt, type PruefartZeile } from "./pruefplan";

const KATALOG: PruefartZeile[] = [
  { id: "dguv", name: "Elektroprüfung", wer: "elektrofachkraft", monate: 12, stunden: null, position: 1, anlass: null },
  { id: "quartal", name: "Quartalsprüfung", wer: "intern", monate: 3, stunden: null, position: 0, anlass: null },
  { id: "motor", name: "Motorwartung", wer: "fachfirma", monate: 12, stunden: 100, position: 2, anlass: null },
];

describe("Prüfplan eines Geräts (IDA-368)", () => {
  it("ohne Abweichung gilt, was die Art hat, in der Reihenfolge des Katalogs", () => {
    const plan = pruefplan(KATALOG, ["dguv", "quartal"], []);
    expect(geltende(plan).map((v) => v.id)).toEqual(["quartal", "dguv"]);
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

  it("Prüfung am Gerät (IDA-369): die gewünschte, sonst die fällige auf Anlass, sonst die nach Frist", () => {
    const katalog: PruefartZeile[] = [
      ...KATALOG,
      { id: "vorher", name: "Kurzcheck", wer: "intern", monate: null, stunden: null, position: 3, anlass: "einsatz" },
    ];
    const plan = pruefplan(katalog, ["quartal", "vorher", "dguv"], [
      // Ein eigenes Intervall gibt es auf Anlass nicht.
      { pruefartId: "vorher", an: true, monate: 6, stunden: null },
    ]);
    expect(plan.find((p) => p.pruefart.id === "vorher")).toMatchObject({ eigenes: null, vorlage: { monate: null, anlass: "einsatz" } });
    const staende = (eingesetzt: boolean) => geltende(plan).map((v) => fristStand(
      v, { am: "2026-10-01", stunden: null, zeit: 1 }, null, "2026-11-01", eingesetzt && v.anlass ? { am: "2026-10-31", zeit: 2 } : null,
    ));
    expect(pruefungAmGeraet(staende(false))?.vorlage.id).toBe("quartal");
    expect(pruefungAmGeraet(staende(true))?.vorlage.id).toBe("vorher");
    expect(pruefungAmGeraet(staende(true), "quartal")?.vorlage.id).toBe("quartal");
    // Was nicht selbst erledigt wird, ist keine Prüfung am Gerät.
    expect(pruefungAmGeraet(staende(false), "dguv")).toBeNull();
  });

  it("ein Punkt ohne Zuordnung gehört zu allen Prüfarten", () => {
    expect(punktGilt({ pruefarten: [] }, "quartal")).toBe(true);
    expect(punktGilt({}, "quartal")).toBe(true);
    expect(punktGilt({ pruefarten: ["jahr"] }, "quartal")).toBe(false);
    expect(punktGilt({ pruefarten: ["jahr", "quartal"] }, "quartal")).toBe(true);
  });
});
