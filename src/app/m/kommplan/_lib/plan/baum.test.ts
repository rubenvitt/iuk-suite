import { describe, expect, it } from "vitest";
import { baue } from "../beispiele/bau";
import { baueBaum, nachkommen, ordne, teilbaumGroesse, tiefensuche, versteckteAnzahl } from "./baum";

const inhalt = baue({
  stellen: [
    { id: "w", titel: "Wurzel" },
    { id: "b", titel: "B", eltern: "w" },
    { id: "a", titel: "A", eltern: "w" },
    { id: "l", titel: "L", eltern: "w", lage: "links" },
    { id: "b1", titel: "B1", eltern: "b" },
    { id: "b1s", titel: "B1s", eltern: "b1", lage: "rechts" },
  ],
});

describe("Baum", () => {
  it("ordnet nach reihenfolge, bei Gleichstand nach id", () => {
    expect(ordne([{ id: "z", reihenfolge: 1 }, { id: "a", reihenfolge: 1 }, { id: "m", reihenfolge: 0 }]).map((x) => x.id))
      .toEqual(["m", "a", "z"]);
  });
  it("trennt Unter- und Seitenstellen", () => {
    const b = baueBaum(inhalt);
    expect(b.wurzeln.map((s) => s.id)).toEqual(["w"]);
    expect(b.unter("w").map((s) => s.id)).toEqual(["b", "a"]);
    expect(b.seiten("w").links.map((s) => s.id)).toEqual(["l"]);
    expect(b.seiten("b1").rechts.map((s) => s.id)).toEqual(["b1s"]);
    expect(b.unter("unbekannt")).toEqual([]);
  });
  it("zählt Nachkommen, Teilbaumgröße und was Einklappen verbirgt", () => {
    const b = baueBaum(inhalt);
    expect(nachkommen(b, "w").map((s) => s.id).sort()).toEqual(["a", "b", "b1", "b1s", "l"]);
    expect(teilbaumGroesse(b, "b")).toBe(3);
    expect(versteckteAnzahl(b, "w")).toBe(4); // b, a, b1, b1s — nicht die eigene Seitenstelle l
  });
  it("Tiefensuche: Stelle, Seiten links/rechts, dann Unterstellen", () => {
    expect(tiefensuche(baueBaum(inhalt)).map((s) => s.id)).toEqual(["w", "l", "b", "b1", "b1s", "a"]);
  });
});
