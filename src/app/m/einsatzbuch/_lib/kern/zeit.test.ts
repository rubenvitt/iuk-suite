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
  it("pinnt die Umstellungsnächte: die nicht existierende Stunde springt vor, die doppelte nimmt die zweite Instanz", () => {
    // Frühjahr, 29.3.2026: 02:00–02:59 gibt es nicht (Sprung nach 03:00 Sommerzeit).
    // 02:30 wird um die Umstellung nach vorn geschoben → 03:30 Sommerzeit (UTC+2) = 01:30 UTC.
    expect(new Date(wandzeitZuInstant("2026-03-29", "02:30", Z)).toISOString()).toBe("2026-03-29T01:30:00.000Z");
    // Herbst, 25.10.2026: 02:00–02:59 gibt es doppelt (erst Sommer-, dann Winterzeit).
    // 02:30 ergibt die zweite, spätere Instanz (Winterzeit, UTC+1) = 01:30 UTC.
    expect(new Date(wandzeitZuInstant("2026-10-25", "02:30", Z)).toISOString()).toBe("2026-10-25T01:30:00.000Z");
  });
  it("lehnt ein Datum ab, das nicht im Format JJJJ-MM-TT steht", () => {
    expect(() => datumText("2026-9-3")).toThrow("Kein Datum im Format JJJJ-MM-TT: 2026-9-3");
  });
  it("lehnt eine Uhrzeit ab, die nicht im Format HH:MM steht", () => {
    expect(() => wandzeitZuInstant("2026-09-23", "8:42", Z)).toThrow("Keine Uhrzeit im Format HH:MM: 8:42");
  });
  it("lehnt einen ungültigen Zeitpunkt ab", () => {
    expect(() => zeitpunktText("kaputt", Z)).toThrow("Kein gültiger Zeitpunkt: kaputt");
  });
  it("lehnt eine Dauer ab, die negativ oder keine ganze Zahl ist", () => {
    expect(() => dauerText(-125)).toThrow("Dauer muss eine ganze Zahl ab 0 sein");
    expect(() => dauerText(1.5)).toThrow("Dauer muss eine ganze Zahl ab 0 sein");
  });
  it("dauerText(0) ergibt „0 h 00 min“", () => {
    expect(dauerText(0)).toBe("0 h 00 min");
  });
});
