import { afterEach, describe, expect, it } from "vitest";
import { setzeAktiveZeitzone } from "@/core/zeit";
import { plusTage, tagInZone, uhrInZone, wochentag, zeitpunkt } from "./zeit";

afterEach(() => setzeAktiveZeitzone("Europe/Berlin"));

describe("Wanduhr der Gemeinschaft", () => {
  it("rechnet Tag und Uhr in der Suite-Zone hin und zurück", () => {
    const ms = zeitpunkt("2026-11-13", "18:00");
    expect(new Date(ms).toISOString()).toBe("2026-11-13T17:00:00.000Z");
    expect(tagInZone(ms)).toBe("2026-11-13");
    expect(uhrInZone(ms)).toBe("18:00");
  });

  it("trifft die Uhr auch am Tag der Zeitumstellung", () => {
    expect(uhrInZone(zeitpunkt("2026-10-25", "18:00"))).toBe("18:00");
    expect(uhrInZone(zeitpunkt("2026-03-29", "18:00"))).toBe("18:00");
  });

  it("folgt einer anderen Suite-Zone", () => {
    setzeAktiveZeitzone("America/New_York");
    expect(new Date(zeitpunkt("2026-11-13", "18:00")).toISOString()).toBe("2026-11-13T23:00:00.000Z");
  });

  it("zählt Kalendertage", () => {
    expect(plusTage("2026-12-30", 3)).toBe("2027-01-02");
    expect(wochentag("2026-11-01")).toBe(0);
  });
});
