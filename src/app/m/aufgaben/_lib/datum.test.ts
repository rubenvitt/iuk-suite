import { describe, expect, it } from "vitest";
import {
  ausgewaehlterTag,
  fmtTagKurz,
  fmtUhrzeit,
  fmtZeitpunkt,
  isoTag,
  minutenVon,
  montagAusParam,
  montagDerWoche,
  tagePlus,
  wochenTage,
  wochentagVon,
} from "./datum";

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

  /*
   * DIE UMSTELLUNGSNACHT MAERZ 2026 (letzter Sonntag, 29.03., 01:00 UTC: CET →
   * CEST): kurz davor ist Berlin noch UTC+1, kurz danach UTC+2. Beide Seiten
   * muessen trotzdem denselben Kalendertag liefern, solange die Berliner
   * Uhrzeit auf derselben Seite von Mitternacht liegt.
   */
  it("bleibt ueber die Umstellungsnacht im Maerz korrekt", () => {
    // 2026-03-29 00:30 MEZ (UTC+1, vor der Umstellung) = 2026-03-28 23:30 UTC
    expect(isoTag(new Date("2026-03-28T23:30:00Z"))).toBe("2026-03-29");
    // 2026-03-29 03:30 MESZ (UTC+2, nach der Umstellung) = 2026-03-29 01:30 UTC
    expect(isoTag(new Date("2026-03-29T01:30:00Z"))).toBe("2026-03-29");
  });

  /** Die Umstellungsnacht Oktober 2026 (letzter Sonntag, 25.10., 01:00 UTC: CEST → CET). */
  it("bleibt ueber die Umstellungsnacht im Oktober korrekt", () => {
    // 2026-10-25 00:30 MESZ (UTC+2, vor der Umstellung) = 2026-10-24 22:30 UTC
    expect(isoTag(new Date("2026-10-24T22:30:00Z"))).toBe("2026-10-25");
    // 2026-10-25 02:30 MEZ (UTC+1, nach der Umstellung) = 2026-10-25 01:30 UTC
    expect(isoTag(new Date("2026-10-25T01:30:00Z"))).toBe("2026-10-25");
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

  /** 2025-12-29 ist ein Montag; die Woche endet erst im neuen Jahr. */
  it("laeuft ueber den Jahreswechsel", () => {
    expect(montagDerWoche("2025-12-29")).toBe("2025-12-29");
    expect(montagDerWoche("2026-01-02")).toBe("2025-12-29");
  });

  /** 2028 ist ein Schaltjahr, 2028-02-28 ist ein Montag: die Woche enthaelt den 29.02. */
  it("laeuft ueber den 29. Februar in einem Schaltjahr", () => {
    expect(montagDerWoche("2028-02-29")).toBe("2028-02-28");
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

  it("laeuft ueber den Jahreswechsel", () => {
    expect(wochenTage("2025-12-29")).toEqual([
      "2025-12-29", "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02",
    ]);
  });

  /** Schaltjahr 2028: der 29.02. steckt als Dienstag mitten in der Woche. */
  it("enthaelt den 29. Februar in einem Schaltjahr", () => {
    expect(wochenTage("2028-02-28")).toEqual([
      "2028-02-28", "2028-02-29", "2028-03-01", "2028-03-02", "2028-03-03",
    ]);
  });
});

describe("tagePlus", () => {
  it("verschiebt um n Kalendertage, vorwaerts und rueckwaerts", () => {
    expect(tagePlus("2026-08-13", 3)).toBe("2026-08-16");
    expect(tagePlus("2026-08-13", -3)).toBe("2026-08-10");
    expect(tagePlus("2026-08-13", 0)).toBe("2026-08-13");
  });

  it("laeuft ueber einen Monatswechsel", () => {
    expect(tagePlus("2026-08-30", 3)).toBe("2026-09-02");
  });

  /*
   * DER FALL, DER EINE ROHE `Date.now() + n * TAG_MS`-RECHNUNG KIPPT: liegt der
   * Aufruf innerhalb einer Stunde um Mitternacht in einer Umstellungsnacht, rutscht
   * das Ergebnis dort um einen Kalendertag. `tagePlus` rechnet stattdessen ueber
   * den Anker 12:00 UTC und ist deshalb unempfindlich dagegen.
   */
  it("bleibt ueber eine Umstellungsnacht korrekt", () => {
    expect(tagePlus("2026-10-24", 1)).toBe("2026-10-25");
    expect(tagePlus("2026-03-28", 1)).toBe("2026-03-29");
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

  /*
   * `schema.ts` dokumentiert die Spalte ausdruecklich als "HH:MM" — ZWEI
   * Stellen fuer die Stunde. Eine einzelne fuehrende Ziffer wird deshalb
   * ABGELEHNT statt grosszuegig angenommen: die Pruefung darf nicht mehr
   * zulassen, als die Spalte verspricht.
   */
  it("wirft bei einer einzelnen Ziffer fuer die Stunde (das dokumentierte Format ist HH:MM, nicht H:MM)", () => {
    expect(() => minutenVon("9:05")).toThrow(/gueltige Uhrzeit/);
  });

  /*
   * DER VERTAGTE BEFUND AUS AUFGABE 3: bis `tagesOrdnung` (Aufgabe 7) hatte
   * diese Funktion keinen Aufrufer mit unvalidierten Werten, und ein leerer
   * String oder eine fehlende ":" ergaben STILL `NaN` — eine Sortierung nach
   * `NaN` schlaegt nie rot an, sie liefert nur eine falsche Reihenfolge.
   * `minutenVon` wirft jetzt, statt `NaN` weiterzugeben.
   */
  it("wirft bei einem leeren String, statt NaN zu liefern", () => {
    expect(() => minutenVon("")).toThrow(/gueltige Uhrzeit/);
  });

  it("wirft ohne Doppelpunkt", () => {
    expect(() => minutenVon("0800")).toThrow(/gueltige Uhrzeit/);
  });

  it("wirft bei einer Stunde oder Minute ausserhalb des gueltigen Bereichs", () => {
    expect(() => minutenVon("24:00")).toThrow(/gueltige Uhrzeit/);
    expect(() => minutenVon("08:60")).toThrow(/gueltige Uhrzeit/);
  });

  it("wirft bei nicht-numerischen Anteilen", () => {
    expect(() => minutenVon("ab:cd")).toThrow(/gueltige Uhrzeit/);
  });
});

describe("fmtUhrzeit", () => {
  it("ist die Umkehrung von minutenVon", () => {
    expect(fmtUhrzeit(0)).toBe("00:00");
    expect(fmtUhrzeit(480)).toBe("08:00");
    expect(fmtUhrzeit(690)).toBe("11:30");
    expect(fmtUhrzeit(1439)).toBe("23:59");
  });

  it("polstert Stunde und Minute auf zwei Stellen", () => {
    expect(fmtUhrzeit(545)).toBe("09:05");
  });

  /** Keine Tagesgrenze angenommen — ein Modulo-Wrap waere die still falsche Uhrzeit. */
  it("wraps nicht ueber Mitternacht, sondern zeigt Stunden ueber 23", () => {
    expect(fmtUhrzeit(1500)).toBe("25:00");
  });
});

describe("fmtZeitpunkt", () => {
  it("formatiert Tag, Monat, Jahr und Uhrzeit in Europe/Berlin", () => {
    // 2026-08-13 11:14 Berliner Sommerzeit = 09:14 UTC
    expect(fmtZeitpunkt(new Date("2026-08-13T09:14:00Z"))).toBe("13.08.2026, 11:14");
  });

  it("polstert Stunde und Minute auf zwei Stellen", () => {
    // 2026-01-05 08:05 MEZ = 07:05 UTC
    expect(fmtZeitpunkt(new Date("2026-01-05T07:05:00Z"))).toBe("05.01.2026, 08:05");
  });

  it("traegt 24-Stunden-Anzeige — keine 12-Stunden-Form mit AM/PM", () => {
    // 2026-08-13 22:30 Berliner Sommerzeit = 20:30 UTC
    expect(fmtZeitpunkt(new Date("2026-08-13T20:30:00Z"))).toBe("13.08.2026, 22:30");
  });

  it("rechnet in der Winterzeit richtig, nicht in UTC", () => {
    // 2026-01-05 00:30 MEZ = 2026-01-04 23:30 UTC — Kalendertag UND Uhrzeit muessen den
    // Berliner Wert zeigen, nicht den UTC-Vortag.
    expect(fmtZeitpunkt(new Date("2026-01-04T23:30:00Z"))).toBe("05.01.2026, 00:30");
  });
});

describe("montagAusParam", () => {
  it("ohne Parameter: der Montag der Woche von heute", () => {
    expect(montagAusParam(undefined, "2026-08-13")).toBe(montagDerWoche("2026-08-13"));
  });

  it("mit einem gueltigen Tag: der Montag von DESSEN Woche, nicht der von heute", () => {
    expect(montagAusParam("2026-08-20", "2026-08-13")).toBe(montagDerWoche("2026-08-20"));
  });

  /*
   * EIN URL-PARAMETER IST KEIN FORMULARFELD — eine unbrauchbare Zeichenkette faellt auf die
   * aktuelle Woche zurueck, statt eine Fehlerseite auszuloesen (`montagDerWoche("abc")` wirft
   * ueber `toISOString` bei einer echten Invalid Date).
   */
  it("mit einer unbrauchbaren Zeichenkette: die aktuelle Woche, kein Wurf", () => {
    expect(montagAusParam("abc", "2026-08-13")).toBe(montagDerWoche("2026-08-13"));
  });

  it("mit leerem String: die aktuelle Woche", () => {
    expect(montagAusParam("", "2026-08-13")).toBe(montagDerWoche("2026-08-13"));
  });
});

describe("ausgewaehlterTag", () => {
  const TAGE = wochenTage("2026-08-10"); // Mo 10.08. .. Fr 14.08.

  it("ein Parameter, der einer der fuenf Tage ist: genau der", () => {
    expect(ausgewaehlterTag(TAGE, "2026-08-10", "2026-08-12")).toBe("2026-08-12");
  });

  it("ohne Parameter, aber heute liegt in der Woche: heute", () => {
    expect(ausgewaehlterTag(TAGE, "2026-08-12", undefined)).toBe("2026-08-12");
  });

  it("ein Parameter ausserhalb der fuenf Tage: faellt auf heute zurueck, nicht auf den Parameter", () => {
    expect(ausgewaehlterTag(TAGE, "2026-08-12", "2026-09-01")).toBe("2026-08-12");
  });

  it("weder Parameter noch heute in der Woche: der erste Tag (Montag)", () => {
    expect(ausgewaehlterTag(TAGE, "2026-09-01", undefined)).toBe("2026-08-10");
  });

  it("ein Parameter, der ein Wochenende der angezeigten Woche waere, zaehlt nicht — Mo-Fr sind die einzigen fuenf", () => {
    expect(ausgewaehlterTag(TAGE, "2026-08-01", "2026-08-15")).toBe("2026-08-10");
  });
});
