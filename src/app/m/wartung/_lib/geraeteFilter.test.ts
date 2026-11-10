import { describe, expect, it } from "vitest";
import { ERGEBNIS_TEXT, mangelZustand, ZUSTAND_TEXT } from "./fristen";
import { geraeteFilterAus, geraeteHref, passtGeraet, zahlwort } from "./geraeteFilter";

/** IDA-381: jede Kennzahl der Übersicht führt auf genau die Geräte, die sie zählt. */
describe("Filter der Geräteliste", () => {
  it("liest `?frist=` und `?zustand=`, Unbekanntes fällt auf „kein Filter“", () => {
    expect(geraeteFilterAus({ frist: "ueberfaellig", zustand: "defekt" })).toEqual({ frist: "ueberfaellig", zustand: "defekt" });
    expect(geraeteFilterAus({ frist: ["bald", "x"] })).toEqual({ frist: "bald", zustand: null });
    expect(geraeteFilterAus({ frist: "ok", zustand: "kaputt" })).toEqual({ frist: null, zustand: null });
    expect(geraeteFilterAus({})).toEqual({ frist: null, zustand: null });
  });

  it("ordnet ein Gerät nach seiner dringendsten Frist ein — zwei überfällige Fristen sind eine Zeile", () => {
    const zwei = { naechste: { stufe: "ueberfaellig" as const }, zustand: "ok" as const };
    const bald = { naechste: { stufe: "bald" as const }, zustand: "mangel" as const };
    const ohne = { naechste: null, zustand: "defekt" as const };
    const alle = [zwei, bald, ohne];
    expect(alle.filter((g) => passtGeraet(g, { frist: "ueberfaellig", zustand: null }))).toEqual([zwei]);
    expect(alle.filter((g) => passtGeraet(g, { frist: "bald", zustand: null }))).toEqual([bald]);
    expect(alle.filter((g) => passtGeraet(g, { frist: null, zustand: "defekt" }))).toEqual([ohne]);
    expect(alle.filter((g) => passtGeraet(g, { frist: null, zustand: null }))).toEqual(alle);
  });

  it("baut die Adresse mit Gruppe", () => {
    expect(geraeteHref({ frist: "ueberfaellig" })).toBe("/geraete?frist=ueberfaellig");
    expect(geraeteHref({ gruppe: "g1", zustand: "defekt" })).toBe("/geraete?gruppe=g1&zustand=defekt");
    expect(geraeteHref({ gruppe: null })).toBe("/geraete");
  });

  it("Einzahl bei genau eins", () => {
    expect(zahlwort(1, "Gerät", "Geräte")).toBe("Gerät");
    expect(zahlwort(0, "Gerät", "Geräte")).toBe("Geräte");
    expect(zahlwort(2, "Mangel offen", "Mängel offen")).toBe("Mängel offen");
  });
});

describe("ein Wort je Zustand (IDA-381)", () => {
  it("der offene Mangel trägt den Zustand, den er dem Gerät gibt", () => {
    expect(mangelZustand(true)).toBe("mangel");
    expect(mangelZustand(false)).toBe("defekt");
  });

  it("das Prüfergebnis teilt die Wörter, nur „In Ordnung“ ist eigen", () => {
    expect(ERGEBNIS_TEXT).toEqual({ ...ZUSTAND_TEXT, ok: "In Ordnung" });
    expect(new Set(Object.values(ZUSTAND_TEXT)).size).toBe(3);
  });
});
