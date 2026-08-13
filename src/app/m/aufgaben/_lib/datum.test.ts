import { describe, expect, it } from "vitest";
import { fmtTagKurz, isoTag, minutenVon, montagDerWoche, wochenTage, wochentagVon } from "./datum";

describe("isoTag", () => {
  /*
   * DIE ZONE IST `Europe/Berlin`, UND ZWAR HIER UND NUR HIER. In UTC gerechnet
   * liefert `isoTag` zwischen 00:00 und 02:00 deutscher Sommerzeit den VORTAG —
   * und davon haengen die Ueberfaelligkeits-Kachel und die „heute"-Markierung
   * ab. Der Fehler ist still: er trifft nur nachts, tagsueber stimmt alles.
   */
  it("rechnet in Europe/Berlin, nicht in UTC", () => {
    // 2026-08-13 00:30 Berliner Sommerzeit = 2026-08-12 22:30 UTC
    expect(isoTag(new Date("2026-08-12T22:30:00Z"))).toBe("2026-08-13");
  });

  it("liefert das ISO-Tagesformat", () => {
    expect(isoTag(new Date("2026-08-13T10:00:00Z"))).toBe("2026-08-13");
    expect(isoTag(new Date("2026-01-05T10:00:00Z"))).toBe("2026-01-05");
  });

  it("rechnet auch in der Winterzeit richtig", () => {
    // 2026-01-05 00:30 MEZ = 2026-01-04 23:30 UTC
    expect(isoTag(new Date("2026-01-04T23:30:00Z"))).toBe("2026-01-05");
  });
});

describe("wochentagVon", () => {
  it("bildet Montag auf 0 und Freitag auf 4 ab", () => {
    expect(wochentagVon("2026-08-10")).toBe(0);
    expect(wochentagVon("2026-08-14")).toBe(4);
  });

  /*
   * Samstag und Sonntag ergeben null, nicht 5 und 6. Das Modul kennt eine
   * Fuenftagewoche; eine 5 waere ein Index neben das Wochengitter, und ein
   * Zugriff darauf `undefined` — still leer statt laut falsch.
   */
  it("gibt am Wochenende null", () => {
    expect(wochentagVon("2026-08-15")).toBeNull();
    expect(wochentagVon("2026-08-16")).toBeNull();
  });
});

describe("montagDerWoche", () => {
  it("findet den Montag derselben Woche", () => {
    expect(montagDerWoche("2026-08-13")).toBe("2026-08-10");
    expect(montagDerWoche("2026-08-10")).toBe("2026-08-10");
  });

  /*
   * DER FALL, DER EINE NAIVE FASSUNG KIPPT: `getUTCDay()` gibt am Sonntag 0, und
   * `tag - 0 + 1` landet auf dem Montag der FOLGENDEN Woche. Fachlich gehoert
   * der Sonntag zur Woche, die am Montag davor begann.
   */
  it("rechnet am Sonntag rueckwaerts, nicht vorwaerts", () => {
    expect(montagDerWoche("2026-08-16")).toBe("2026-08-10");
  });

  it("laeuft ueber einen Monatswechsel", () => {
    expect(montagDerWoche("2026-09-02")).toBe("2026-08-31");
  });
});

describe("wochenTage", () => {
  it("gibt Montag bis Freitag", () => {
    expect(wochenTage("2026-08-10")).toEqual([
      "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14",
    ]);
  });

  it("laeuft ueber einen Monatswechsel", () => {
    expect(wochenTage("2026-08-31")).toEqual([
      "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04",
    ]);
  });
});

describe("fmtTagKurz", () => {
  it("schreibt Wochentag plus Datum, nie ISO", () => {
    expect(fmtTagKurz("2026-08-13")).toBe("Do, 13.08.");
    expect(fmtTagKurz("2026-08-10")).toBe("Mo, 10.08.");
  });
});

describe("minutenVon", () => {
  it("rechnet HH:MM in Minuten seit Mitternacht", () => {
    expect(minutenVon("00:00")).toBe(0);
    expect(minutenVon("08:00")).toBe(480);
    expect(minutenVon("11:30")).toBe(690);
    expect(minutenVon("23:59")).toBe(1439);
  });
});
