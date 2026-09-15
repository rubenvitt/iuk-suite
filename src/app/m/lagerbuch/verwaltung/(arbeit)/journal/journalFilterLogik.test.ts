import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  TYPEN,
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

  it("laesst genau die vier Journaltypen bis zum SQL-Filter durch", () => {
    expect([...TYPEN]).toEqual([
      "zugang",
      "entnahme",
      "korrektur",
      "umlagerung",
    ]);

    expect(journalParameterAus({ typ: "entnahme" })).toMatchObject({
      werte: { typ: "entnahme" },
      filter: { typ: "entnahme" },
    });
    expect(journalParameterAus({ typ: "inventur" })).toMatchObject({
      werte: { typ: "" },
      filter: { typ: undefined },
    });
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
      typ: "korrektur",
      von: new Date("2026-07-31T22:00:00.000Z"),
      bis: new Date("2026-08-31T21:59:59.999Z"),
    });
    expect(ergebnis.hinweise).toEqual([]);
    expect(ergebnis.hatFilter).toBe(true);
  });

  it("reicht ungueltige Rohdaten weder an SQL noch an die DatePicker weiter", () => {
    const ergebnis = journalParameterAus({
      q: "   ",
      typ: "inventur",
      von: "2026-02-31",
      bis: "gestern",
    });

    expect(ergebnis.werte).toEqual({ q: "", typ: "", von: "", bis: "" });
    expect(ergebnis.filter).toEqual({
      q: undefined,
      typ: undefined,
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
