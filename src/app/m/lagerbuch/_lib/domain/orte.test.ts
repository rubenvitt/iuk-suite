import { describe, it, expect } from "vitest";
import { teilbaum, type OrtZeile } from "./orte";

const ORTE: OrtZeile[] = [
  { id: "handlager", parentId: null, sortierung: 0 },
  { id: "schrank-gf", parentId: "handlager", sortierung: 90 },
  { id: "schrank-1", parentId: "handlager", sortierung: 10 },
  { id: "schrank-2", parentId: "handlager", sortierung: 20 },
  { id: "rtw-1", parentId: null, sortierung: 0 },
];

describe("teilbaum", () => {
  it("liefert die Wurzel zuerst, dann die Kinder nach Reihenfolge", () => {
    expect(teilbaum(ORTE, "handlager"))
      .toEqual(["handlager", "schrank-1", "schrank-2", "schrank-gf"]);
  });

  it("ein Ort ohne Kinder ist sein eigener Teilbaum", () => {
    expect(teilbaum(ORTE, "rtw-1")).toEqual(["rtw-1"]);
  });

  /** Die Wurzel MUSS immer dabei sein: eine leere Liste wuerde in `inArray`
   *  zu `WHERE false` und liesse jeden Bestand still auf 0 fallen. */
  it("eine unbekannte Wurzel liefert trotzdem sich selbst", () => {
    expect(teilbaum(ORTE, "gibt-es-nicht")).toEqual(["gibt-es-nicht"]);
  });

  it("bei gleicher Reihenfolge entscheidet die ID, nicht die Eingabereihenfolge", () => {
    const gleich: OrtZeile[] = [
      { id: "wurzel", parentId: null, sortierung: 0 },
      { id: "b", parentId: "wurzel", sortierung: 5 },
      { id: "a", parentId: "wurzel", sortierung: 5 },
    ];
    expect(teilbaum(gleich, "wurzel")).toEqual(["wurzel", "a", "b"]);
  });

  /** Ein Schrank ist heute nie Elternteil — wenn es doch einmal so kommt,
   *  soll die Funktion nicht in eine Endlosschleife laufen. */
  it("ein Zyklus laeuft nicht endlos", () => {
    const zyklus: OrtZeile[] = [
      { id: "a", parentId: "b", sortierung: 0 },
      { id: "b", parentId: "a", sortierung: 0 },
    ];
    expect(teilbaum(zyklus, "a")).toEqual(["a", "b"]);
  });
});
