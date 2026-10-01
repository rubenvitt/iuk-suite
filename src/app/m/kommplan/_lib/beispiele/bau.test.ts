import { describe, expect, it } from "vitest";
import { baue } from "./bau";

describe("baue", () => {
  it("setzt Reihenfolge je Geschwistergruppe und Lage in Eingabereihenfolge", () => {
    const p = baue({ stellen: [
      { id: "w", titel: "W" }, { id: "x", titel: "X", eltern: "w" }, { id: "s", titel: "S", eltern: "w", lage: "links" },
      { id: "y", titel: "Y", eltern: "w" },
    ] });
    expect(Object.fromEntries(p.stellen.map((s) => [s.id, s.reihenfolge]))).toEqual({ w: 0, x: 0, s: 0, y: 1 });
  });
  it("Kontakte aus einem Record, Einheiten aus Text (erstes Wort = Typ) oder Paar, Kanäle durchgereicht", () => {
    const p = baue({
      verbindungen: [{ id: "v", art: "tmo", bezeichnung: "R_UE_2" }, { id: "k", art: "dmo", bezeichnung: "DMO 608" }],
      stellen: [{
        id: "ea", titel: "EA", verbindung: "v", kanaele: ["k"],
        kontakte: { telefon: ["1", "2"], digitalfunk: "RK UE 40-05-1" },
        einheiten: ["RTW RK UE 40-83-5", ["Foodtruck", ""]],
      }],
    });
    const ea = p.stellen[0];
    expect(ea.verbindungId).toBe("v");
    expect(ea.kanaele).toEqual(["k"]);
    expect(ea.kontakte).toEqual([
      { art: "digitalfunk", wert: "RK UE 40-05-1" }, { art: "telefon", wert: "1" }, { art: "telefon", wert: "2" },
    ]);
    expect(ea.einheiten).toEqual([
      { id: "ea-e1", typ: "RTW", rufname: "RK UE 40-83-5", zeichen: null },
      { id: "ea-e2", typ: "Foodtruck", rufname: "", zeichen: null },
    ]);
  });
  it("wirft bei ungültigem Ergebnis", () => {
    expect(() => baue({ stellen: [{ id: "a", titel: "A", eltern: "fehlt" }] })).toThrow();
  });
});
