import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { zeitzone } from "@/core/zeit";
import { ausZivilzeit, monatsEnde, startDesTages, tagesGrenzen, fmtTs, fmtDatumZeit, heuteIso, uhrzeit }
  from "./zeit";

/**
 * Der Test verstellt `process.env.TZ` ABSICHTLICH und behauptet in beiden Laeufen
 * dasselbe Ergebnis. Genau daran haengt die Entscheidung aus §12.6 Punkt 1, KEINEN
 * globalen TZ-Pin in `iuk-suite/vitest.config.ts` zu ziehen: dieser Test beweist die
 * Unabhaengigkeit, die ein Pin verstecken wuerde.
 *
 * Pacific/Kiritimati ist UTC+14 und findet Vorzeichenfehler, die UTC nicht findet.
 */
const ZONEN = ["UTC", "Pacific/Kiritimati"] as const;
let vorher: string | undefined;

beforeEach(() => { vorher = process.env.TZ; });
afterEach(() => { process.env.TZ = vorher; });

describe.each(ZONEN)("unter Prozess-TZ %s", (tz) => {
  beforeEach(() => { process.env.TZ = tz; });

  it("ZEITZONE ist Europe/Berlin", () => {
    expect(zeitzone()).toBe("Europe/Berlin");
  });

  it("monatsEnde trifft den Sommerzeit-Rand", () => {
    expect(monatsEnde("2026-08").toISOString()).toBe("2026-08-31T21:59:59.999Z");
  });

  it("monatsEnde trifft den Winterzeit-Rand — kein fester Offset verdrahtet", () => {
    expect(monatsEnde("2026-01").toISOString()).toBe("2026-01-31T22:59:59.999Z");
  });

  it("heuteIso nimmt den Berliner Tag, nicht den UTC-Tag", () => {
    expect(heuteIso(new Date("2026-08-03T22:30:00Z"))).toBe("2026-08-04");
  });

  it("fmtTs schiebt eine Buchung nach Mitternacht NICHT auf den Vortag", () => {
    // Unter UTC stuende hier "02.08. 23:30" — jede Buchung zwischen 00:00 und
    // 02:00 Ortszeit landete auf dem Vortag (Analyse-Falle 2).
    expect(fmtTs(new Date("2026-08-02T23:30:00Z"))).toBe("03.08. 01:30");
  });

  it("fmtDatumZeit traegt das JAHR — ein Check von vor 13 Monaten sieht sonst aus wie gestern", () => {
    // Der Unterschied zu `fmtTs` daneben ist genau das Jahr, und er ist der
    // ganze Zweck der zweiten Funktion (DRK-306): „14.09., 08:12" ist von
    // „14.09. des Vorjahres" nicht zu unterscheiden — aber genau diese Frage
    // stellt sich vor einem Fahrzeug-Check.
    expect(fmtDatumZeit(new Date("2026-09-14T06:12:00Z"))).toBe("14.09.2026, 08:12");
  });

  it("fmtDatumZeit rechnet in ZEITZONE, nicht in der Prozesszone", () => {
    // Dieselbe Zusage wie bei `fmtTs`: eine Buchung um 01:30 Ortszeit darf
    // nicht als Vortag 23:30 erscheinen. Der Test laeuft unter beiden
    // Prozesszonen und behauptet dasselbe Ergebnis.
    expect(fmtDatumZeit(new Date("2026-08-02T23:30:00Z"))).toBe("03.08.2026, 01:30");
  });

  it("fmtDatumZeit trägt das Jahr der ZONE, nicht das der Prozess-TZ", () => {
    // Silvester 23:30 Berlin ist unter UTC noch der 31.12. des Vorjahres — der
    // Jahreswechsel ist der eine Rand, an dem ein falsches Jahr auch bei
    // richtigem Tag herauskäme.
    expect(fmtDatumZeit(new Date("2026-12-31T22:30:00Z"))).toBe("31.12.2026, 23:30");
    expect(fmtDatumZeit(new Date("2026-12-31T23:30:00Z"))).toBe("01.01.2027, 00:30");
  });

  it("uhrzeit liefert HH:MM in der Zone", () => {
    expect(uhrzeit(new Date("2026-08-02T23:30:00Z"))).toBe("01:30");
  });

  it("startDesTages ist Mitternacht Ortszeit", () => {
    expect(startDesTages(new Date("2026-08-03T14:00:00Z")).toISOString())
      .toBe("2026-08-02T22:00:00.000Z");
  });

  it("tagesGrenzen sind inklusiv und zonenrichtig", () => {
    const { von, bis } = tagesGrenzen("2026-08-03");
    expect(von.toISOString()).toBe("2026-08-02T22:00:00.000Z");
    expect(bis.toISOString()).toBe("2026-08-03T21:59:59.999Z");
  });

  // Die zwei DST-Raender aus §4.5, benannt entschieden:
  it("Sprungloch: 02:30 am letzten Maerzsonntag gibt es nicht → 03:30 Ortszeit", () => {
    // 2026-03-29, Umstellung 02:00 → 03:00 Ortszeit.
    expect(ausZivilzeit(2026, 3, 29, 2, 30).toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("Doppeldeutigkeit: 02:30 am letzten Oktobersonntag gibt es zweimal → Sommerzeit-Lesart", () => {
    // 2026-10-25: 00:30Z ist 02:30 CEST, 01:30Z ist 02:30 CET. Die ERSTE gewinnt.
    expect(ausZivilzeit(2026, 10, 25, 2, 30).toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });

  it("Normalfall: die Zivilzeit trifft genau einen Zeitpunkt", () => {
    expect(ausZivilzeit(2026, 8, 15, 12, 0).toISOString()).toBe("2026-08-15T10:00:00.000Z");
  });
});
