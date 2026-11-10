import { describe, expect, it } from "vitest";
import { auswahlsumme, entscheidungen, knopfText, nichtsGewaehlt, rueckfrage } from "./auswahl";
import type { Vorschlag } from "./plan";

const v = (schluessel: string, ziel: Vorschlag["ziel"]): Vorschlag => ({ schluessel, kandidaten: [], ziel });
const NEU = (s: string) => v(s, { art: "neu", fahrzeug: { art: "fahrzeug", typ: "RTW", funkrufname: s, funkkenner: "", kennzeichen: "", standort: "Uelzen", bemerkung: "", aktiv: true } });
const BESTAND = (s: string) => v(s, { art: "bestand", stammId: `id-${s}`, anzeige: s });
const OFFEN = (s: string) => v(s, { art: "offen", grund: "unklar" });

const plan = [NEU("n1"), NEU("n2"), BESTAND("b1"), OFFEN("o1"), OFFEN("o2"), OFFEN("o3")];

describe("auswahlsumme", () => {
  it("zählt angehakte neue und vorhandene sowie die Wahl der offenen", () => {
    const e = entscheidungen(new Set(["n1", "n2", "b1"]), { o1: { art: "stamm", id: "x" }, o2: { art: "kein" } });
    const s = auswahlsumme(plan, e);
    expect(s).toEqual({ anlegen: 2, zuordnen: 2, ohne: 1 });
    expect(knopfText(s)).toBe("Übernehmen: 2 anlegen, 2 zuordnen, 1 ohne Fahrzeug");
  });

  it("lässt eine Wahl auf ein abgewähltes neues Fahrzeug fallen", () => {
    const e = entscheidungen(new Set(["n2"]), { o1: { art: "vorschlag", schluessel: "n1" }, o2: { art: "vorschlag", schluessel: "n2" } });
    expect(e.offen).toEqual({ o2: { art: "vorschlag", schluessel: "n2" } });
    expect(auswahlsumme(plan, e)).toEqual({ anlegen: 1, zuordnen: 1, ohne: 0 });
  });

  it("ohne Auswahl heißt der Knopf nur „Übernehmen“", () => {
    const s = auswahlsumme(plan, entscheidungen(new Set(), {}));
    expect(nichtsGewaehlt(s)).toBe(true);
    expect(knopfText(s)).toBe("Übernehmen");
  });
});

describe("rueckfrage", () => {
  it("nennt die Zahl der neuen Fahrzeuge im Titel", () => {
    expect(rueckfrage({ anlegen: 51, zuordnen: 8, ohne: 0 })).toEqual({
      titel: "51 Fahrzeuge neu anlegen?",
      text: "In der Fahrzeugverwaltung entstehen 51 Fahrzeuge. 8 Vorschläge werden einem Fahrzeug zugeordnet.",
    });
  });

  it("sagt ausdrücklich, wenn nichts entsteht", () => {
    expect(rueckfrage({ anlegen: 0, zuordnen: 1, ohne: 1 })).toEqual({
      titel: "Zuordnungen übernehmen?",
      text: "Es entsteht kein neues Fahrzeug. 1 Vorschlag wird einem Fahrzeug zugeordnet. 1 Vorschlag wird als „kein Fahrzeug“ vermerkt.",
    });
  });
});
