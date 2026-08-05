import { describe, it, expect } from "vitest";
import { artikelTrifft, artikelFiltern, LEERER_FILTER,
         type ArtikelFilterZeile } from "./artikelFilter";

const z = (p: Partial<ArtikelFilterZeile> = {}): ArtikelFilterZeile => ({
  name: "Verbandpäckchen", fach: "A1", aktiv: true, unterMindest: false,
  naechsteCharge: { chargenNr: "CH-4711", verfall: "2027-01" }, chargeKritisch: false, ...p,
});

describe("artikelTrifft — der Freitext sucht ueber DREI Felder", () => {
  it("findet ueber den NAMEN", () => {
    expect(artikelTrifft(z(), { ...LEERER_FILTER, suche: "verband" })).toBe(true);
  });
  it("findet ueber das FACH", () => {
    // Der Nebenbefund aus §12.1, Punkt 2: die Alt-Spec probiert nur den Namen.
    expect(artikelTrifft(z(), { ...LEERER_FILTER, suche: "a1" })).toBe(true);
  });
  it("findet ueber die CHARGENNUMMER der naechsten Charge", () => {
    expect(artikelTrifft(z(), { ...LEERER_FILTER, suche: "4711" })).toBe(true);
  });
  it("findet nicht, was in keinem der drei Felder steht", () => {
    expect(artikelTrifft(z(), { ...LEERER_FILTER, suche: "pflaster" })).toBe(false);
  });
  it("ist gross-/kleinschreibungsunabhaengig und trimmt", () => {
    expect(artikelTrifft(z(), { ...LEERER_FILTER, suche: "  VERBAND  " })).toBe(true);
  });
  it("laesst bei LEERER Suche alles durch", () => {
    expect(artikelTrifft(z(), LEERER_FILTER)).toBe(true);
    expect(artikelTrifft(z(), { ...LEERER_FILTER, suche: "   " })).toBe(true);
  });
  it("stolpert nicht ueber naechsteCharge === null", () => {
    expect(artikelTrifft(z({ naechsteCharge: null }), { ...LEERER_FILTER, suche: "verband" }))
      .toBe(true);
    expect(artikelTrifft(z({ naechsteCharge: null }), { ...LEERER_FILTER, suche: "4711" }))
      .toBe(false);
  });
});

describe("artikelTrifft — die drei Chips", () => {
  it('„unter Mindestbestand"', () => {
    expect(artikelTrifft(z(), { ...LEERER_FILTER, nurUnterMindest: true })).toBe(false);
    expect(artikelTrifft(z({ unterMindest: true }), { ...LEERER_FILTER, nurUnterMindest: true }))
      .toBe(true);
  });
  it('„Charge kritisch"', () => {
    expect(artikelTrifft(z(), { ...LEERER_FILTER, nurChargeKritisch: true })).toBe(false);
    expect(artikelTrifft(z({ chargeKritisch: true }), { ...LEERER_FILTER, nurChargeKritisch: true }))
      .toBe(true);
  });
  it('„inaktive ausblenden"', () => {
    expect(artikelTrifft(z({ aktiv: false }), { ...LEERER_FILTER, ohneInaktive: true })).toBe(false);
    expect(artikelTrifft(z({ aktiv: false }), LEERER_FILTER)).toBe(true);
  });
  it("verknuepft alle vier Bedingungen UND", () => {
    const zeile = z({ unterMindest: true, chargeKritisch: true, aktiv: true });
    expect(artikelTrifft(zeile, {
      suche: "verband", nurUnterMindest: true, nurChargeKritisch: true, ohneInaktive: true,
    })).toBe(true);
    expect(artikelTrifft(zeile, {
      suche: "pflaster", nurUnterMindest: true, nurChargeKritisch: true, ohneInaktive: true,
    })).toBe(false);
  });
});

/**
 * ⚠️ Reine ASCII-Begriffe ("verband", "pflaster") beweisen nichts ueber die
 * Faltung — sie verhalten sich unter jeder Kleinschreibung identisch. Diese
 * Faelle nageln fest, dass `artikelTrifft` ueber `falte()` aus `_lib/suche.ts`
 * faltet (Teil 3, wörtlich: "wird nicht nachgebaut und nicht durch
 * `toLowerCase()` ersetzt") — ein eigens gebautes `toLowerCase()` HIER traefe
 * bei diesen konkreten Zeichen zwar zufaellig dieselbe Entscheidung (JS faltet
 * Ä/ä korrekt), aber die Bauform waere die falsche und liefe der SQL-Haelfte
 * (`lb_falte`, T46) auseinander, sobald `falte()` sich je aendert.
 */
describe("artikelTrifft — Faltung ueber Umlaute und die ss/ß-Luecke (wie `falte()`)", () => {
  it("findet Umlaute unabhaengig von Gross-/Kleinschreibung UND Diakritika in derselben Zusicherung", () => {
    const zeile = z({ name: "Verbandpäckchen" });
    expect(artikelTrifft(zeile, { ...LEERER_FILTER, suche: "PÄCKCHEN" })).toBe(true);
    expect(artikelTrifft(zeile, { ...LEERER_FILTER, suche: "päckchen" })).toBe(true);
  });
  it("faltet NICHT ss/ß — dieselbe Luecke wie `falte()`, keine eigene Kleinschreibung (§5.20)", () => {
    const zeile = z({ name: "Straßenset" });
    expect(artikelTrifft(zeile, { ...LEERER_FILTER, suche: "STRASSE" })).toBe(false);
    expect(artikelTrifft(zeile, { ...LEERER_FILTER, suche: "straße" })).toBe(true);
  });
});

describe("artikelFiltern — DIESELBE abgeleitete Liste fuer Tabelle und Export", () => {
  it("behaelt die Reihenfolge und reicht Zusatzfelder durch", () => {
    /**
     * ⚠️ DIE KOPPLUNG, DIE DEN EXPORT STILL BRICHT (§5.13.3, Punkt 3, §9.4):
     * `ArtikelTable.tsx:133` ruft `bestandExportZeilen(gefiltert)` — die Datei
     * enthaelt „genau das, was gerade in der Tabelle steht". Wandert Filtern in
     * antds Table-eigenen Zustand, MUSS der Export dieselbe abgeleitete Liste
     * lesen, sonst exportiert der Knopf still wieder alles.
     */
    const zeilen = [
      { ...z({ name: "Alpha" }), id: "1" },
      { ...z({ name: "Beta", aktiv: false }), id: "2" },
      { ...z({ name: "Alpha zwei" }), id: "3" },
    ];
    expect(artikelFiltern(zeilen, { ...LEERER_FILTER, suche: "alpha" }).map((r) => r.id))
      .toEqual(["1", "3"]);
    expect(artikelFiltern(zeilen, { ...LEERER_FILTER, ohneInaktive: true }).map((r) => r.id))
      .toEqual(["1", "3"]);
  });

  it("veraendert die Eingabeliste NICHT", () => {
    const zeilen = [z({ name: "A" }), z({ name: "B" })];
    artikelFiltern(zeilen, { ...LEERER_FILTER, suche: "A" });
    expect(zeilen).toHaveLength(2);
  });
});
