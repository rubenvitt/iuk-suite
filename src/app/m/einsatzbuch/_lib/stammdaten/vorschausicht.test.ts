import { describe, expect, it } from "vitest";
import { sichtbareZeilen, startSicht, zaehleSichten } from "./vorschausicht";

const NICHT = ["ohne_quali", "doppelt"];
const ZEILEN = [
  { name: "Jürgens, Jens", klasse: "neu" },
  { name: "Albers, Jana", klasse: "unveraendert" },
  { name: "Kruse, Marie", klasse: "deaktivieren" },
  { name: "Hansen, Ole", klasse: "doppelt" },
  { name: "Meyer, Lea", klasse: "demo" },
];
const name = (z: { name: string }) => z.name;

describe("vorschausicht", () => {
  it("zählt Änderungen, nicht Übernommenes und alle", () => {
    expect(zaehleSichten(ZEILEN, NICHT)).toEqual({ aenderungen: 2, nicht: 1, alle: 5 });
  });

  it("startet auf der ersten Sicht, in der etwas steht", () => {
    expect(startSicht({ aenderungen: 2, nicht: 1, alle: 5 })).toBe("aenderungen");
    expect(startSicht({ aenderungen: 0, nicht: 1, alle: 5 })).toBe("nicht");
    expect(startSicht({ aenderungen: 0, nicht: 0, alle: 5 })).toBe("alle");
  });

  it("filtert nach Sicht und findet Namen ohne Umlaut und Großschreibung", () => {
    expect(sichtbareZeilen(ZEILEN, "aenderungen", NICHT, "", name).map(name)).toEqual(["Jürgens, Jens", "Kruse, Marie"]);
    expect(sichtbareZeilen(ZEILEN, "nicht", NICHT, "", name).map(name)).toEqual(["Hansen, Ole"]);
    expect(sichtbareZeilen(ZEILEN, "alle", NICHT, " jurgens ", name).map(name)).toEqual(["Jürgens, Jens"]);
    expect(sichtbareZeilen(ZEILEN, "aenderungen", NICHT, "albers", name)).toEqual([]);
  });
});
