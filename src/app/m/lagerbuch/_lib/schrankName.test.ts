import { describe, expect, it } from "vitest";
import { normalisiereSchrankName } from "./schrankName";

/**
 * DRK-367 — die Faltung allein, ohne Datenbank. Dass sie greift, zeigen
 * `_actions/lagerorte.test.ts` (die Meldung) und `_db/dubletten.test.ts` (der
 * Index); hier steht, WAS als derselbe Name gilt.
 */
describe("normalisiereSchrankName", () => {
  it("faltet Leerraum an den Raendern und Gross-/Kleinschreibung", () => {
    expect(normalisiereSchrankName("  Schrank 1 ")).toBe("schrank 1");
    expect(normalisiereSchrankName("SCHRANK 1")).toBe("schrank 1");
  });

  /** ⚠️ HIER LIEGT DER UNTERSCHIED ZUM INDEX. SQLites `lower()` ist ASCII-only
   *  und liesse „SCHRÄNKCHEN" neben „Schränkchen" stehen; diese Probe nicht.
   *  Die Richtung stimmt: die Action ist die strengere der beiden Ebenen. */
  it("faltet auch Umlaute, anders als SQLites lower()", () => {
    expect(normalisiereSchrankName("SCHRÄNKCHEN")).toBe("schränkchen");
  });

  /** Leerraum INNEN bleibt: „Schrank 1" und „Schrank  1" sind auf dem Schirm
   *  zu unterscheiden, und eine Faltung darueber naehme jemandem einen Namen
   *  weg, den er absichtlich so gesetzt hat. */
  it("fasst Leerraum im Inneren nicht zusammen", () => {
    expect(normalisiereSchrankName("Schrank  1")).not
      .toBe(normalisiereSchrankName("Schrank 1"));
  });
});
