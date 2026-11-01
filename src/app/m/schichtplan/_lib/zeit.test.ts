import { afterEach, describe, expect, it } from "vitest";
import { setzeAktiveZeitzone, STANDARD_ZEITZONE } from "@/core/zeit";
import { ausWanduhr, rasten, stunden, wanduhr, zeitspanne } from "./zeit";

afterEach(() => setzeAktiveZeitzone(STANDARD_ZEITZONE));

describe("Zeiten in der Suite-Zone", () => {
  it("Wanduhr und zurück, unabhängig von der Zone des Prozesses", () => {
    setzeAktiveZeitzone("Europe/Berlin");
    const ms = ausWanduhr({ jahr: 2026, monat: 11, tag: 14, stunde: 8, minute: 0 });
    expect(new Date(ms).toISOString()).toBe("2026-11-14T07:00:00.000Z");
    expect(wanduhr(ms)).toEqual({ jahr: 2026, monat: 11, tag: 14, stunde: 8, minute: 0 });
  });

  it("an Zeitumstellungstagen bleibt die Wanduhr die eingegebene", () => {
    setzeAktiveZeitzone("Europe/Berlin");
    const iso = (stunde: number, minute: number, tag: number, monat: number) => new Date(ausWanduhr({ jahr: 2026, monat, tag, stunde, minute })).toISOString();
    expect(iso(8, 0, 29, 3)).toBe("2026-03-29T06:00:00.000Z");
    expect(iso(1, 30, 29, 3)).toBe("2026-03-29T00:30:00.000Z");
    expect(iso(2, 30, 29, 3)).toBe("2026-03-29T01:30:00.000Z"); // gibt es nicht: wird 03:30 Sommerzeit
    expect(iso(8, 0, 25, 10)).toBe("2026-10-25T07:00:00.000Z");
    expect(iso(2, 30, 25, 10)).toBe("2026-10-25T00:30:00.000Z"); // doppelt: das erste Vorkommen
    expect(iso(0, 0, 25, 10)).toBe("2026-10-24T22:00:00.000Z");
  });

  it("eine andere Suite-Zone verschiebt die Wanduhr", () => {
    setzeAktiveZeitzone("UTC");
    expect(new Date(ausWanduhr({ jahr: 2026, monat: 11, tag: 14, stunde: 8, minute: 0 })).toISOString()).toBe("2026-11-14T08:00:00.000Z");
  });

  it("Zeitspanne mit 24:00 am Tagesende und über Mitternacht", () => {
    setzeAktiveZeitzone("Europe/Berlin");
    const acht = ausWanduhr({ jahr: 2026, monat: 11, tag: 14, stunde: 16, minute: 0 });
    const mitternacht = ausWanduhr({ jahr: 2026, monat: 11, tag: 15, stunde: 0, minute: 0 });
    expect(zeitspanne(acht, mitternacht)).toBe("16:00–24:00");
    expect(zeitspanne(acht, mitternacht + 6 * 3_600_000)).toBe("Sa., 14.11. 16:00 – So., 15.11. 06:00");
  });

  it("rastet auf 15 Minuten und schreibt Stunden deutsch", () => {
    expect(rasten(7 * 60_000)).toBe(0);
    expect(rasten(8 * 60_000)).toBe(15 * 60_000);
    expect(stunden(9_000_000)).toBe("2,5 h");
    expect(stunden(13.75 * 3_600_000)).toBe("13,75 h");
    expect(stunden(15 * 60_000)).toBe("0,25 h");
    expect(stunden(8 * 3_600_000)).toBe("8 h");
  });
});
