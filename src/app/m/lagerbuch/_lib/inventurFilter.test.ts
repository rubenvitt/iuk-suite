import { describe, expect, it } from "vitest";
import { filterIstLeer, inventurSucheTrifft, inventurTrifft, LEERER_INVENTUR_FILTER } from "./inventurFilter";
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

describe("inventurSucheTrifft (IDA-237)", () => {
  const zeile = { name: "Kompresse steril 10×10", fach: "Regal B" };

  it("findet ueber Name und Fach, gefaltet und ohne Rand", () => {
    expect(inventurSucheTrifft(zeile, "KOMPRESSE")).toBe(true);
    expect(inventurSucheTrifft(zeile, " regal b ")).toBe(true);
    expect(inventurSucheTrifft(zeile, "10×10")).toBe(true);
    expect(inventurSucheTrifft(zeile, "Pflaster")).toBe(false);
  });

  it("laesst mit leerer Suche alles durch", () => {
    expect(inventurSucheTrifft(zeile, "")).toBe(true);
    expect(inventurSucheTrifft(zeile, "   ")).toBe(true);
  });
});
