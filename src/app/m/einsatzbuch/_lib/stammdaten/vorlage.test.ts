import { describe, expect, it } from "vitest";
import { VORLAGE_FAHRZEUGE, VORLAGE_PERSONAL, VORLAGE_STICHWORTE } from "./vorlage";

describe("Stammdaten der Vorlage", () => {
  it("56 Fahrzeuge, Kennung = ID, Funkrufname nach Muster", () => {
    expect(VORLAGE_FAHRZEUGE).toHaveLength(56);
    expect(new Set(VORLAGE_FAHRZEUGE.map((f) => f.kennung)).size).toBe(56);
    expect(VORLAGE_FAHRZEUGE.find((f) => f.kennung === "11-11-1")).toEqual({ id: "11-11-1", typ: "ELW 1", kennung: "11-11-1", ruf: "Rotkreuz Uelzen 11-11-1", standort: "Uelzen", aktiv: true });
    expect(VORLAGE_FAHRZEUGE.filter((f) => f.standort === "Bad Bodenteich").map((f) => f.kennung)).toEqual(["18-83-1", "18-85-1", "18-64-1", "18-19-1", "18-19-2", "18-10-1"]);
  });
  it("112 Personen mit festen IDs aus dem Generator der Vorlage", () => {
    expect(VORLAGE_PERSONAL).toHaveLength(112);
    expect(VORLAGE_PERSONAL.find((p) => p.id === "p1")).toMatchObject({ name: "Albers, Jana", quali: "SanH", ov: "Uelzen" });
    expect(VORLAGE_PERSONAL.find((p) => p.id === "p4")).toMatchObject({ name: "Dierks, Paul", quali: "SanH", ov: "Bad Bodenteich" });
    expect(VORLAGE_PERSONAL.find((p) => p.id === "p8")).toMatchObject({ name: "Hansen, Finn", quali: "NotSan", ov: "Suderburg" });
    expect(new Set(VORLAGE_PERSONAL.map((p) => p.name)).size).toBe(112);
  });
  it("12 Stichworte in 5 Gruppen, eindeutige Namen", () => {
    expect(VORLAGE_STICHWORTE).toHaveLength(12);
    expect(VORLAGE_STICHWORTE.find((s) => s.name === "Unterstützung RD")).toEqual({ id: "sw-unterstuetzung-rd", gruppe: "Rettungsdienst", name: "Unterstützung RD", reihenfolge: 3, aktiv: true });
  });
});
