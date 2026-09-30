import { describe, expect, it } from "vitest";
import { sucheZeichen } from "./suche";

const INDEX = [
  { schluessel: "rezept:D.1.4", titel: "Einsatzleitung im Einsatz", suchtext: "einsatzleitung d.1.4" },
  { schluessel: "zusatz:eal", titel: "Einsatzabschnittsleitung", suchtext: "eal abschnitt" },
  { schluessel: "rezept:C.1.1", titel: "Löschstaffel", suchtext: "löschstaffel c.1.1" },
  { schluessel: "rezept:X.9", titel: "Führungsstelle", suchtext: "stelle einsatz" },
];

describe("Zeichen-Suche", () => {
  it("alle Wörter müssen vorkommen; Titelanfang vor Titelmitte vor Suchtext", () => {
    expect(sucheZeichen(INDEX, "einsatz").map((e) => e.schluessel)).toEqual(["zusatz:eal", "rezept:D.1.4", "rezept:X.9"]);
    expect(sucheZeichen(INDEX, "LÖSCH").map((e) => e.schluessel)).toEqual(["rezept:C.1.1"]);
    expect(sucheZeichen(INDEX, "einsatz leitung").map((e) => e.schluessel)).toEqual(["zusatz:eal", "rezept:D.1.4"]);
    expect(sucheZeichen(INDEX, "d.1.4").map((e) => e.schluessel)).toEqual(["rezept:D.1.4"]);
  });
  it("leere Anfrage: nichts; höchstens max Treffer", () => {
    expect(sucheZeichen(INDEX, "   ")).toEqual([]);
    expect(sucheZeichen(INDEX, "e", 2)).toHaveLength(2);
  });
});
