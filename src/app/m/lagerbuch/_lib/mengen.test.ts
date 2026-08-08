import { describe, it, expect } from "vitest";
import { toggleInSet } from "./mengen";

describe("toggleInSet", () => {
  it("fuegt ein fehlendes Element hinzu", () => {
    expect([...toggleInSet(new Set(["a"]), "b")].sort()).toEqual(["a", "b"]);
  });

  it("entfernt ein vorhandenes Element", () => {
    expect([...toggleInSet(new Set(["a", "b"]), "a")]).toEqual(["b"]);
  });

  it("arbeitet auf einer leeren Menge", () => {
    expect([...toggleInSet(new Set<string>(), "a")]).toEqual(["a"]);
  });

  it("liefert IMMER eine neue Referenz und laeszt die alte unberuehrt", () => {
    // DIE EIGENTLICHE ZUSICHERUNG. Mutierte die Funktion die uebergebene
    // Menge, bliebe die Referenz gleich, React renderte nicht neu, und der
    // Filterchip saehe unveraendert aus — ein Klick, der nichts tut, ohne
    // Fehler und ohne Meldung.
    const vorher = new Set(["a"]);
    const nachher = toggleInSet(vorher, "b");
    expect(nachher).not.toBe(vorher);
    expect([...vorher]).toEqual(["a"]);
    const wiederWeg = toggleInSet(nachher, "b");
    expect(wiederWeg).not.toBe(nachher);
    expect([...nachher].sort()).toEqual(["a", "b"]);
  });

  it("traegt beliebige Werttypen", () => {
    expect([...toggleInSet(new Set([1, 2]), 3)].sort()).toEqual([1, 2, 3]);
  });
});
