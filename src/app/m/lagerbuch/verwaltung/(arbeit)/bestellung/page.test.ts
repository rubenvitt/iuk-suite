import { describe, expect, it } from "vitest";
import type { BestellZeile } from "../../../_lib/lesepfade/bestellung";
import { bestellAnzeigeZeile } from "./page";

describe("bestellAnzeigeZeile — RSC-/Client-Grenze", () => {
  it("formatiert den Zeitpunkt in Europe/Berlin und gibt kein Date weiter", () => {
    const roh: BestellZeile = {
      id: "a1",
      name: "Pflaster",
      einheit: "Pkg",
      fach: "B2",
      bestand: 0,
      mindestbestand: 5,
      vorschlag: 5,
      bestellt: true,
      // Nach Berliner Mitternacht, in UTC noch am Vortag.
      bestelltSeit: new Date("2026-08-01T23:30:00Z"),
      wareOffenbarDa: false,
    };

    const anzeige = bestellAnzeigeZeile(roh);
    expect(anzeige.bestelltSeitText).toBe("02.08.2026");
    expect("bestelltSeit" in anzeige).toBe(false);
    expect((Object.values(anzeige) as unknown[]).some((wert) => wert instanceof Date)).toBe(false);
  });

  it("bildet eine fehlende Markierung als null statt eines erfundenen Datums ab", () => {
    const roh: BestellZeile = {
      id: "a2",
      name: "Mullbinde",
      einheit: "Stk",
      fach: "A1",
      bestand: 2,
      mindestbestand: 10,
      vorschlag: 8,
      bestellt: false,
      bestelltSeit: null,
      wareOffenbarDa: false,
    };
    expect(bestellAnzeigeZeile(roh).bestelltSeitText).toBeNull();
  });
});
