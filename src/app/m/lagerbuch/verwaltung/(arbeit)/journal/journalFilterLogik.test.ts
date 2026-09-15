import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  VORGANG_ARTEN,
  deckelText,
  journalParameterAus,
  mitGetipptem,
  normalisiereJournalTag,
} from "./journalFilterLogik";
import { JOURNAL_SUCHE_MAX } from "../../../_lib/grenzen";

describe("journalFilterLogik — server-sicherer Vertrag", () => {
  /**
   * ⚠️ DER ERSTE AUFSCHLAG UND JEDER NACHSCHLAG MUESSEN DIESELBE GRENZE SEHEN
   * (DRK-331, neunte Reviewrunde).
   *
   * Die Seite rendert die erste Journalseite SERVERSEITIG ueber diese Funktion;
   * nachgeladen wird ueber die Server Action, und die prueft ihre Eingabe auf
   * `JOURNAL_SUCHE_MAX` — sie ist von aussen aufrufbar, das ist nicht
   * verhandelbar. Kappte nur EINE der beiden Seiten, ergaebe ein laengerer
   * Begriff eine Seite, die aussieht wie jede andere, und ein Nachladen, das
   * bei JEDEM Versuch scheitert: die Tabelle bliebe auf den ersten hundert
   * Treffern stehen und meldete dauerhaft einen Fehler.
   *
   * Der Fall ist ueber eine getippte URL zu erreichen, also nicht theoretisch.
   */
  it("kappt den Suchbegriff auf dieselbe Grenze, die der Nachschlag prueft", () => {
    const zuLang = "x".repeat(JOURNAL_SUCHE_MAX + 50);
    const ergebnis = journalParameterAus({ q: zuLang });

    expect(ergebnis.filter.q).toHaveLength(JOURNAL_SUCHE_MAX);
    // Was gilt, steht auch im Feld — die Oberflaeche zeigt nicht mehr, als
    // gesucht wird.
    expect(ergebnis.werte.q).toBe(ergebnis.filter.q);
    /**
     * ⚠️ DIE GEGENSEITE WIRD GELESEN, NICHT AUFGERUFEN. `_actions/journal.ts`
     * traegt `"use server"`, und ein solches Modul darf ausser asynchronen
     * Funktionen NICHTS exportieren — sein `AnfrageSchema` ist hier also nicht
     * greifbar. Geprueft wird deshalb, dass es DIESELBE Konstante liest statt
     * einer abgeschriebenen Zahl; eine zweite Zahl waere genau der Zustand, den
     * dieser Test verhindern soll.
     */
    const action = readFileSync("src/app/m/lagerbuch/_actions/journal.ts", "utf8");
    expect(action).toContain("z.string().max(JOURNAL_SUCHE_MAX)");
    expect(action).not.toMatch(/z\.string\(\)\.max\(\d/);
  });

  it("laesst genau die sechs Vorgangsarten bis zum SQL-Filter durch", () => {
    // ⚠️ SECHS SEIT DRK-344: die vier Buchungstypen plus die beiden Arten, die
    // ihre Bedeutung im Referenz-Praefix tragen. Die Reihenfolge ist zugleich
    // die Reihenfolge im Auswahlfeld.
    expect([...VORGANG_ARTEN]).toEqual([
      "zugang",
      "entnahme",
      "korrektur",
      "umlagerung",
      "aussondern",
      "inventur",
    ]);

    expect(journalParameterAus({ typ: "entnahme" })).toMatchObject({
      werte: { typ: "entnahme" },
      filter: { vorgang: "entnahme" },
    });
    expect(journalParameterAus({ typ: "aussondern" })).toMatchObject({
      werte: { typ: "aussondern" },
      filter: { vorgang: "aussondern" },
    });
    expect(journalParameterAus({ typ: "was-neues" })).toMatchObject({
      werte: { typ: "" },
      filter: { vorgang: undefined },
    });
  });

  /**
   * ⚠️ DER URL-SCHLUESSEL HEISST WEITER `typ`, DER FILTER HEISST `vorgang`
   * (DRK-344) — und diese Naht ist genau eine Zeile breit. Waere der Schluessel
   * mitumbenannt worden, liefe jeder GESPEICHERTE Journal-Link still
   * ungefiltert auf: die Adresszeile zeigte einen Vorgang, die Tabelle die
   * ganze Historie. Dasselbe Fehlverhalten, gegen das `zeitraumAus` gebaut ist.
   */
  it("liest die Vorgangsart aus dem URL-Schluessel `typ` und gibt sie als `vorgang` weiter", () => {
    const ergebnis = journalParameterAus({ typ: "korrektur" });
    expect(ergebnis.filter.vorgang).toBe("korrektur");
    // Der Weg zurueck in die Insel traegt weiter den URL-Namen.
    expect(ergebnis.werte.typ).toBe("korrektur");
  });

  it("normalisiert Suchtext und gueltige Tage getrennt fuer Insel und SQL", () => {
    const ergebnis = journalParameterAus({
      q: "  Päckchen  ",
      typ: "korrektur",
      von: " 2026-08-01 ",
      bis: "2026-08-31",
    });

    expect(ergebnis.werte).toEqual({
      q: "Päckchen",
      typ: "korrektur",
      von: "2026-08-01",
      bis: "2026-08-31",
    });
    expect(ergebnis.filter).toEqual({
      q: "Päckchen",
      vorgang: "korrektur",
      von: new Date("2026-07-31T22:00:00.000Z"),
      bis: new Date("2026-08-31T21:59:59.999Z"),
    });
    expect(ergebnis.hinweise).toEqual([]);
    expect(ergebnis.hatFilter).toBe(true);
  });

  it("reicht ungueltige Rohdaten weder an SQL noch an die DatePicker weiter", () => {
    const ergebnis = journalParameterAus({
      q: "   ",
      // ⚠️ „inventur" STAND HIER BIS DRK-344 als Beispiel fuer einen
      // ungueltigen Wert — seither ist es eine gueltige Vorgangsart. Der
      // Platzhalter muss also einer sein, der es nie wird.
      typ: "gibt-es-nicht",
      von: "2026-02-31",
      bis: "gestern",
    });

    expect(ergebnis.werte).toEqual({ q: "", typ: "", von: "", bis: "" });
    expect(ergebnis.filter).toEqual({
      q: undefined,
      vorgang: undefined,
      von: undefined,
      bis: undefined,
    });
    expect(ergebnis.hinweise).toEqual([
      "Das Datum in der Adresse ist ungültig und wurde ignoriert.",
      "Das Datum in der Adresse ist ungültig und wurde ignoriert.",
    ]);
    expect(ergebnis.hatFilter).toBe(false);
    expect(normalisiereJournalTag("2026-02-31")).toBe("");
    expect(normalisiereJournalTag(" 2026-08-01 ")).toBe("2026-08-01");
  });

  it("behaelt zwei gueltige, aber umgekehrte Grenzen als sichtbar leeren Zeitraum", () => {
    const ergebnis = journalParameterAus({
      von: "2026-08-08",
      bis: "2026-08-07",
    });

    expect(ergebnis.werte).toEqual({
      q: "",
      typ: "",
      von: "2026-08-08",
      bis: "2026-08-07",
    });
    expect(ergebnis.filter.von?.toISOString()).toBe("2026-08-07T22:00:00.000Z");
    expect(ergebnis.filter.bis?.toISOString()).toBe("2026-08-07T21:59:59.999Z");
    expect(ergebnis.hinweise).toEqual([
      "Der Zeitraum ist leer: „von“ liegt nach „bis“.",
    ]);
    expect(ergebnis.hatFilter).toBe(true);
  });

  it("nimmt bei einem Typ- oder Datumsklick den bereits getippten Begriff mit", () => {
    expect(mitGetipptem(
      { q: "alt", typ: "", von: "", bis: "" },
      "  Mull  ",
      { von: "2026-08-01" },
    )).toEqual({
      q: "Mull",
      typ: "",
      von: "2026-08-01",
      bis: "",
    });

    expect(mitGetipptem(
      { q: "alt", typ: "zugang", von: "", bis: "" },
      "Mull",
      { q: "" },
    )).toEqual({ q: "", typ: "zugang", von: "", bis: "" });
  });

  /**
   * ⚠️ SEIT DRK-331 IST DER DECKEL EINE PORTIONSGROESSE, KEINE GRENZE. Der alte
   * Text „Neueste 100 von mehr Treffern — Zeitraum eingrenzen" war eine
   * AUFFORDERUNG, weil der Rest unerreichbar war. Er ist jetzt erreichbar, man
   * scrollt weiter — die Aufforderung waere schlicht falsch geworden.
   *
   * Und die 100 kommt im Text gar nicht mehr vor: sie war nie eine Aussage ueber
   * die Daten, sondern ueber die Abfrage. Dieser Test haelt beides fest.
   */
  it("sagt beim Nachladen, dass es weitergeht — ohne die Deckelzahl zu nennen", () => {
    expect(deckelText(100, true)).toBe("100 Treffer geladen — weitere beim Scrollen");
    expect(deckelText(100, true)).not.toContain("eingrenzen");
    expect(deckelText(100, false)).toBe("100 Treffer");
    expect(deckelText(3, false)).toBe("3 Treffer");
    expect(deckelText(1, false)).toBe("1 Treffer");
    expect(deckelText(1, true)).toBe("1 Treffer geladen — weitere beim Scrollen");
  });

  it("bleibt ohne Server- oder Client-Directive von RSC und Insel importierbar", () => {
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/journal/journalFilterLogik.ts",
      "utf8",
    );
    expect(quelle).not.toMatch(/^\s*["']use (?:client|server)["']/m);
  });
});
