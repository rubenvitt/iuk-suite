import { describe, expect, it } from "vitest";
import { datumText, dauerMinuten, dauerText, wandzeitZuInstant, zeitpunktText } from "./zeit";

const Z = "Europe/Berlin";
const einsatz = (bd: string, bz: string, ed: string | null, ez: string | null) =>
  ({ beginnDatum: bd, beginnZeit: bz, endeDatum: ed, endeZeit: ez });

describe("zeit", () => {
  it("rechnet Wanduhrzeit in der Suite-Zone in einen Zeitpunkt um (Sommer und Winter)", () => {
    expect(new Date(wandzeitZuInstant("2026-09-23", "18:42", Z)).toISOString()).toBe("2026-09-23T16:42:00.000Z");
    expect(new Date(wandzeitZuInstant("2026-01-10", "08:00", Z)).toISOString()).toBe("2026-01-10T07:00:00.000Z");
  });
  it("zählt die Dauer über die Zeitumstellung richtig", () => {
    expect(dauerMinuten(einsatz("2026-10-25", "01:30", "2026-10-25", "03:30"), Z)).toBe(180);
    expect(dauerMinuten(einsatz("2026-03-29", "01:30", "2026-03-29", "03:30"), Z)).toBe(60);
    expect(dauerMinuten(einsatz("2026-09-23", "18:42", "2026-09-23", "21:05"), Z)).toBe(143);
  });
  it("offenes Ende ergibt null, Ende vor Beginn eine negative Zahl", () => {
    expect(dauerMinuten(einsatz("2026-09-23", "18:42", null, null), Z)).toBeNull();
    expect(dauerMinuten(einsatz("2026-09-23", "18:42", "2026-09-23", "18:00"), Z)).toBe(-42);
  });
  it("schreibt Datum, Zeitpunkt und Dauer wie die Vorlage", () => {
    expect(datumText("2026-08-22")).toBe("22.8.2026");
    expect(zeitpunktText("2026-09-23T19:08:00.000Z", Z)).toBe("23.9.2026, 21:08 Uhr");
    expect(zeitpunktText("2026-01-05T06:03:00Z", Z)).toBe("5.1.2026, 07:03 Uhr");
    expect(zeitpunktText("2026-09-23T19:08:00Z", "UTC")).toBe("23.9.2026, 19:08 Uhr");
    expect(dauerText(143)).toBe("2 h 23 min");
    expect(dauerText(5)).toBe("0 h 05 min");
  });
});
