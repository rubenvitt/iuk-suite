import { describe, expect, it } from "vitest";
import { istTestanlass, plusMonate, testanfrageFaellig, testLoeschtag } from "./testanfrage";
import { zeitpunkt } from "./zeit";

describe("Testanfragen (IDA-375)", () => {
  it("nur genau „Test“, Groß-/Kleinschreibung und Rand egal", () => {
    for (const ja of ["Test", "test", " TEST ", "tEsT"]) expect(istTestanlass(ja), ja).toBe(true);
    for (const nein of ["Testament", "Test-Geburtstag", "Tests", "Mein Test", ""]) expect(istTestanlass(nein), nein).toBe(false);
  });

  it("ein Kalendermonat weiter, am Monatsende geklemmt, über den Jahreswechsel", () => {
    expect(plusMonate("2026-11-09", 1)).toBe("2026-12-09");
    expect(plusMonate("2026-01-31", 1)).toBe("2026-02-28");
    expect(plusMonate("2028-01-31", 1)).toBe("2028-02-29");
    expect(plusMonate("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("der Löschtag rechnet in der Suite-Zone: kurz nach Mitternacht zählt schon der neue Tag", () => {
    // 00:30 Uhr in Berlin ist in UTC noch der Vortag.
    expect(testLoeschtag(zeitpunkt("2026-11-01", "00:30"))).toBe("2026-12-01");
    const a = { anlass: "Test", eingegangenAm: zeitpunkt("2026-11-01", "00:30") };
    expect(testanfrageFaellig(a, zeitpunkt("2026-11-30", "23:59"))).toBe(false);
    expect(testanfrageFaellig(a, zeitpunkt("2026-12-01", "00:00"))).toBe(true);
    expect(testanfrageFaellig({ ...a, anlass: "Geburtstag" }, zeitpunkt("2030-01-01", "00:00"))).toBe(false);
  });
});
