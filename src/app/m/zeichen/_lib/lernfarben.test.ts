import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LERNFARBEN } from "./lernfarben";

const CSS = readFileSync("src/app/m/zeichen/_ui/zeichen.module.css", "utf8");

describe("LERNFARBEN", () => {
  /*
   * SUITE-ROT IST AUSGESCHLOSSEN. `colorError === colorPrimary === #c8000f` — ein rotes
   * "falsch" saehe aus wie eine Primaeraktion, und auf einer Lernflaeche traegt Rot
   * fachliche Bedeutung (Falle 3). Deshalb eine modul-eigene, fachsemantische Palette.
   */
  it("benutzt nirgends die Markenfarbe", () => {
    const alle = Object.values(LERNFARBEN).flatMap((f) => [f.hell, f.dunkel]);
    for (const wert of alle) expect(wert.toLowerCase()).not.toBe("#c8000f");
  });

  /*
   * CSS UND TS SIND ZWEI QUELLEN DESSELBEN WERTES, und sie laufen auseinander, sobald
   * jemand nur eine anfasst — still, weil beide fuer sich gueltig bleiben.
   */
  it.each(Object.entries(LERNFARBEN))("fuehrt %s in beiden Helligkeiten im CSS", (name, farbe) => {
    expect(CSS).toContain(`--tz-lern-${name}: ${farbe.hell};`);
    expect(CSS).toContain(`--tz-lern-${name}: ${farbe.dunkel};`);
  });

  it("kennt die vier Zustaende", () => {
    expect(Object.keys(LERNFARBEN).sort()).toEqual(["falsch", "gefestigt", "offen", "richtig"]);
  });
});
