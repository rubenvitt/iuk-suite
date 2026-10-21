import { describe, expect, it } from "vitest";
import { monatsraster, zeitraumAus, ZEITRAUM_VORGABE } from "./zeitraum";

describe("zeitraumAus", () => {
  it.each([
    ["3", 3], ["24", 24], [["6", "12"], 6],
    [undefined, ZEITRAUM_VORGABE], ["5", ZEITRAUM_VORGABE], ["abc", ZEITRAUM_VORGABE], ["", ZEITRAUM_VORGABE],
  ] as const)("%o -> %s", (roh, erwartet) => {
    expect(zeitraumAus(roh as string | string[] | undefined)).toBe(erwartet);
  });
});

describe("monatsraster", () => {
  it("geht ueber den Jahreswechsel zurueck und endet mit dem laufenden Monat", () => {
    const { monate } = monatsraster(new Date("2027-01-20T12:00:00Z"), 3);
    expect(monate).toEqual([
      { schluessel: "2026-11", label: "Nov 26" },
      { schluessel: "2026-12", label: "Dez 26" },
      { schluessel: "2027-01", label: "Jan 27" },
    ]);
  });

  it("setzt die Grenzen auf Mitternacht in Berlin, Sommer- wie Winterzeit", () => {
    const { grenzen } = monatsraster(new Date("2026-11-10T12:00:00Z"), 2);
    expect(grenzen.map((d) => d.toISOString())).toEqual([
      "2026-09-30T22:00:00.000Z", // 1.10. 00:00 MESZ
      "2026-10-31T23:00:00.000Z", // 1.11. 00:00 MEZ
      "2026-11-30T23:00:00.000Z", // 1.12. 00:00 MEZ
    ]);
  });

  it("schaut fuer die Vorschau ab dem laufenden Monat nach vorn", () => {
    const { monate } = monatsraster(new Date("2026-10-15T12:00:00Z"), 3, "vor");
    expect(monate.map((m) => m.schluessel)).toEqual(["2026-10", "2026-11", "2026-12"]);
  });
});
