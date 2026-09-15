import Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";
import { normalisiereSchrankName } from "./schrankName";

/**
 * DRK-367 — die Faltung allein. Dass sie greift, zeigen
 * `_actions/lagerorte.test.ts` (die Meldung) und `_db/dubletten.test.ts` (der
 * Index); hier steht, WAS als derselbe Name gilt — und dass SQLite es genauso
 * sieht.
 */
describe("normalisiereSchrankName", () => {
  it("faltet Leerraum an den Raendern und Gross-/Kleinschreibung", () => {
    expect(normalisiereSchrankName("  Schrank 1 ")).toBe("schrank 1");
    expect(normalisiereSchrankName("SCHRANK 1")).toBe("schrank 1");
  });

  /** Leerraum INNEN bleibt: „Schrank 1" und „Schrank  1" sind auf dem Schirm
   *  zu unterscheiden, und eine Faltung darueber naehme jemandem einen Namen
   *  weg, den er absichtlich so gesetzt hat. */
  it("fasst Leerraum im Inneren nicht zusammen", () => {
    expect(normalisiereSchrankName("Schrank  1")).not
      .toBe(normalisiereSchrankName("Schrank 1"));
  });

  /**
   * ⚠️ DER GROSSBUCHSTABE EINES UMLAUTS BLEIBT STEHEN, und das ist die
   * Entscheidung, nicht ein Versehen: die Faltung muss zeichengenau dieselbe
   * sein wie die im Index, und SQLites `lower()` kann nur ASCII. Wer hier auf
   * `toLocaleLowerCase` umstellt, macht die Action strenger als die Datenbank
   * — und hinterlaesst Altdaten, deren Mehrdeutigkeit niemand mehr aufloesen
   * kann (Kopfkommentar der Funktion).
   */
  it("laesst Umlaut-Grossbuchstaben stehen, weil SQLites lower() es auch tut", () => {
    expect(normalisiereSchrankName("SCHRÄNKCHEN")).toBe("schrÄnkchen");
    expect(normalisiereSchrankName("SCHRÄNKCHEN")).not
      .toBe(normalisiereSchrankName("Schränkchen"));
  });
});

/**
 * DIE EIGENTLICHE ZUSICHERUNG. Die Gleichheit der beiden Fassungen ist eine
 * Behauptung ueber eine FREMDE Bibliothek — und genau solche Behauptungen
 * laufen still auseinander. Deshalb wird hier nicht nachgebaut, sondern
 * gemessen: derselbe Ausdruck, den `idx_lagerorte_name_je_parent` und die
 * Entdoppelung in 0009 tragen, gegen echtes SQLite.
 */
describe("normalisiereSchrankName === lower(trim(name)) in SQLite", () => {
  const sqlite = new Database(":memory:");
  const falte = sqlite.prepare("select lower(trim(?)) as f");
  afterAll(() => sqlite.close());

  const PROBEN = [
    "Schrank 1",
    "  Schrank 1  ",
    "SCHRANK 1",
    "schrank 1",
    "Schrank  1",
    "GF-Schrank",
    "Schränkchen",
    "SCHRÄNKCHEN",
    "Äußerer Schrank",
    "ÄUSSERER SCHRANK",
    "Straße 1",
    "STRASSE 1",
    "Schrank (Dublette 2)",
    "Regal Ö3",
    "Über-Schrank",
    "",
    "   ",
    "ÿÜÖÄ ABC xyz 123 ·-_",
  ];

  it.each(PROBEN)("%j", (probe) => {
    expect(normalisiereSchrankName(probe))
      .toBe((falte.get(probe) as { f: string }).f);
  });
});
