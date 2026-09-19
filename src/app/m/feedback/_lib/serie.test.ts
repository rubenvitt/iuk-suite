import { describe, expect, it } from "vitest";
import { serienTermine, SERIE_MAX_TERMINE, type Rhythmus } from "./serie";

const tag = (s: string) => new Date(`${s}T00:00:00Z`);
const tage = (d: Date[]) => d.map((x) => x.toISOString().slice(0, 10));
const serie = (start: string, bis: string | null, r: Rhythmus) =>
  tage(serienTermine(tag(start), bis === null ? null : tag(bis), r));

describe("serienTermine", () => {
  it("gibt bei `einmalig` genau den Starttermin — und liest `bis` gar nicht", () => {
    expect(serie("2026-09-08", "2026-12-31", "einmalig")).toEqual(["2026-09-08"]);
    expect(serie("2026-09-08", null, "einmalig")).toEqual(["2026-09-08"]);
  });

  it("zählt den Starttermin mit, statt erst beim zweiten zu beginnen", () => {
    expect(serie("2026-09-08", "2026-09-08", "woche")).toEqual(["2026-09-08"]);
  });

  it("hält den Wochen-, Zweiwochen- und Vierwochentakt", () => {
    expect(serie("2026-09-01", "2026-09-29", "woche")).toEqual([
      "2026-09-01",
      "2026-09-08",
      "2026-09-15",
      "2026-09-22",
      "2026-09-29",
    ]);
    expect(serie("2026-09-01", "2026-09-29", "zweiwochen")).toEqual([
      "2026-09-01",
      "2026-09-15",
      "2026-09-29",
    ]);
    expect(serie("2026-09-01", "2026-10-31", "vierwochen")).toEqual([
      "2026-09-01",
      "2026-09-29",
      "2026-10-27",
    ]);
  });

  it("nimmt `bis` einschließlich, nicht ausschließlich", () => {
    // Der 29.09. IST ein Termin des Zweiwochentakts und `bis` zugleich.
    expect(serie("2026-09-01", "2026-09-29", "zweiwochen")).toContain("2026-09-29");
    // Einen Tag davor fällt er heraus, und zwar er allein.
    expect(serie("2026-09-01", "2026-09-28", "zweiwochen")).toEqual([
      "2026-09-01",
      "2026-09-15",
    ]);
  });

  /**
   * Die Rechnung läuft in UTC, und das ist der Grund: in Europe/Berlin liegt
   * zwischen dem 24. und dem 31. März 2026 die Umstellung auf Sommerzeit
   * (letzter Sonntag im März). Eine lokale Addition von „7 Tagen" wäre dort 167
   * oder 169 Stunden — nach genügend Sprüngen kippte ein Termin über
   * Mitternacht auf den Vortag, und aus dem Dienstag würde ein Montag.
   */
  it("lässt die Sommerzeitumstellung den Wochentag nicht verschieben", () => {
    const termine = serienTermine(tag("2026-03-03"), tag("2026-04-14"), "woche");
    expect(tage(termine)).toEqual([
      "2026-03-03",
      "2026-03-10",
      "2026-03-17",
      "2026-03-24",
      "2026-03-31",
      "2026-04-07",
      "2026-04-14",
    ]);
    // Jeder Termin ist ein Dienstag geblieben, und jeder liegt auf Mitternacht.
    for (const t of termine) {
      expect(t.getUTCDay()).toBe(2);
      expect(t.getUTCHours()).toBe(0);
      expect(t.getUTCMinutes()).toBe(0);
    }
  });

  it("trägt den Wochentakt über den Jahreswechsel", () => {
    expect(serie("2026-12-22", "2027-01-12", "woche")).toEqual([
      "2026-12-22",
      "2026-12-29",
      "2027-01-05",
      "2027-01-12",
    ]);
  });

  describe("Monatsregel", () => {
    it("hält Wochentag UND Stelle im Monat, nicht den Tag im Monat", () => {
      // Zweiter Dienstag: 08.09. → 13.10. → 10.11. → 08.12. Ein „jeder 8." wäre
      // der 08.10. gewesen, und das ist ein Donnerstag.
      expect(serie("2026-09-08", "2026-12-31", "monatsWochentag")).toEqual([
        "2026-09-08",
        "2026-10-13",
        "2026-11-10",
        "2026-12-08",
      ]);
    });

    it("LÄSST EINEN MONAT AUS, in dem es die Stelle nicht gibt", () => {
      // Fünfter Dienstag: September 2026 hat einen (29.), Oktober und November
      // nicht, Dezember wieder (29.). Ein Rückfall auf den vierten hätte den
      // Abend um eine Woche vorverlegt — in zwei Monaten, die niemand angesetzt
      // hat.
      expect(serie("2026-09-29", "2026-12-31", "monatsWochentag")).toEqual([
        "2026-09-29",
        "2026-12-29",
      ]);
    });

    it("endet auch dann, wenn hinter dem Starttermin nur ausgefallene Monate liegen", () => {
      // Ohne die Monatsschranke liefe die Schleife hier nicht in ihren `break`:
      // sie findet bis `bis` keinen einzigen weiteren Termin.
      expect(serie("2026-09-29", "2026-11-30", "monatsWochentag")).toEqual(["2026-09-29"]);
    });

    it("trägt die Regel über den Jahreswechsel", () => {
      expect(serie("2026-12-08", "2027-02-28", "monatsWochentag")).toEqual([
        "2026-12-08",
        "2027-01-12",
        "2027-02-09",
      ]);
    });
  });

  describe("Ränder", () => {
    it("gibt bei einem `bis` VOR dem Start den Starttermin allein", () => {
      // Nicht die leere Liste: ein Formular, das nach dem Absenden nichts
      // angelegt hat, ist von einem kaputten nicht zu unterscheiden.
      expect(serie("2026-09-08", "2026-09-01", "woche")).toEqual(["2026-09-08"]);
      expect(serie("2026-09-08", "2026-09-01", "monatsWochentag")).toEqual(["2026-09-08"]);
    });

    it("deckelt jede Serie bei SERIE_MAX_TERMINE", () => {
      // „bis 2099" ist eine Fehleingabe, keine Planung.
      const woechentlich = serienTermine(tag("2026-01-06"), tag("2099-12-31"), "woche");
      expect(woechentlich).toHaveLength(SERIE_MAX_TERMINE);
      const monatlich = serienTermine(tag("2026-01-06"), tag("2099-12-31"), "monatsWochentag");
      expect(monatlich).toHaveLength(SERIE_MAX_TERMINE);
    });

    it("gibt die Termine aufsteigend und ohne Dublette", () => {
      const termine = serienTermine(tag("2026-01-06"), tag("2026-12-31"), "zweiwochen");
      const ms = termine.map((t) => t.getTime());
      expect([...ms].sort((a, b) => a - b)).toEqual(ms);
      expect(new Set(ms).size).toBe(ms.length);
    });
  });
});
