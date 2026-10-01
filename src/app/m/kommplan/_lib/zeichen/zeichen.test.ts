import { describe, expect, it } from "vitest";
import { BEISPIELE } from "../beispiele";
import { baue } from "../beispiele/bau";
import { findeZeichen, symboleFuer, symboleFuerSchluessel, zeichenIndex } from "./zeichen";

describe("Zeichen-Zugriff", () => {
  it("findet ein Rezept und ein Zusatzzeichen, liefert null für Unbekanntes", () => {
    expect(findeZeichen("rezept:D.1.4")?.titel).toBe("Einsatzleitung im Einsatz");
    expect(findeZeichen("zusatz:eal")?.inhalt).toContain("EAL");
    expect(findeZeichen("gibt-es-nicht")).toBeNull();
  });
  it("symboleFuer liefert genau die benutzten Zeichen", () => {
    expect(Object.keys(symboleFuer(BEISPIELE[0].inhalt)).sort()).toEqual(["rezept:D.1.4", "zusatz:eal"]);
    const unbekannt = baue({ stellen: [{ id: "a", titel: "A", zeichen: "rezept:ZZZ" }] });
    expect(symboleFuer(unbekannt)).toEqual({});
  });
  it("symboleFuer mit schwarzweiss: dieselben Schlüssel, grauer Inhalt", () => {
    const inhalt = baue({ stellen: [{ id: "a", titel: "A", zeichen: "rezept:C.1.1" }] });
    const farbig = symboleFuer(inhalt);
    const sw = symboleFuer(inhalt, { schwarzweiss: true });
    expect(Object.keys(sw)).toEqual(Object.keys(farbig));
    expect(farbig["rezept:C.1.1"].inhalt).toContain("#fa1919");
    expect(sw["rezept:C.1.1"].inhalt).not.toContain("#fa1919");
    expect(symboleFuerSchluessel(["gibt:es-nicht"], { schwarzweiss: true })).toEqual({});
  });
});

describe("Zeichen-Index für den Editor (Entscheidung 4)", () => {
  it("führt jedes Zeichen mit Titel und Suchtext, ohne SVG, klein genug für die Seite", () => {
    const index = zeichenIndex();
    expect(index.length).toBeGreaterThan(200);
    expect(index[0]).toEqual({ schluessel: expect.any(String), titel: expect.any(String), suchtext: expect.any(String) });
    expect(JSON.stringify(index).length).toBeLessThan(40_000);
    const titel = index.map((e) => e.titel);
    expect(titel).toEqual([...titel].sort((a, b) => a.localeCompare(b, "de")));
  });
  it("liefert SVG-Quellen nur für bekannte Schlüssel", () => {
    const k = zeichenIndex()[0].schluessel;
    expect(Object.keys(symboleFuerSchluessel([k, "gibt:es-nicht"]))).toEqual([k]);
  });
});
