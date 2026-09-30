import { describe, expect, it } from "vitest";
import { BEISPIELE } from "../beispiele";
import { baue } from "../beispiele/bau";
import { findeZeichen, symboleFuer } from "./zeichen";

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
});
