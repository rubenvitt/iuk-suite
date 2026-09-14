import { describe, expect, it } from "vitest";
import { fachOptionen, filterIstLeer, inventurTrifft, LEERER_INVENTUR_FILTER } from "./inventurFilter";
import { kategorieSchluessel } from "./kategorie";

const HYG = kategorieSchluessel("Hygiene");

describe("inventurTrifft", () => {
  it("laesst mit leerem Filter alles durch, auch Artikel ohne Kategorie", () => {
    expect(inventurTrifft({ fach: "A1", kategorie: null }, LEERER_INVENTUR_FILTER)).toBe(true);
    expect(filterIstLeer(LEERER_INVENTUR_FILTER)).toBe(true);
  });

  it("vergleicht Kategorien gefaltet und schliesst Artikel ohne Kategorie aus, sobald gefiltert wird", () => {
    const f = { kategorien: [HYG], faecher: [] };
    expect(inventurTrifft({ fach: "A1", kategorie: "hygiene" }, f)).toBe(true);
    expect(inventurTrifft({ fach: "A1", kategorie: "Technik" }, f)).toBe(false);
    expect(inventurTrifft({ fach: "A1", kategorie: null }, f)).toBe(false);
  });

  it("vergleicht Faecher exakt und verknuepft beide Filter mit UND", () => {
    const f = { kategorien: [HYG], faecher: ["A1"] };
    expect(inventurTrifft({ fach: "A1", kategorie: "Hygiene" }, f)).toBe(true);
    expect(inventurTrifft({ fach: "a1", kategorie: "Hygiene" }, f)).toBe(false);
    expect(inventurTrifft({ fach: "B2", kategorie: "Hygiene" }, f)).toBe(false);
  });
});

describe("fachOptionen", () => {
  it("liefert jedes Fach einmal, sortiert", () => {
    expect(fachOptionen([{ fach: "B2" }, { fach: "A1" }, { fach: "B2" }])).toEqual(["A1", "B2"]);
  });
});
