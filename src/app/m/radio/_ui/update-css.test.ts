// src/app/m/radio/_ui/update-css.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ohneKommentare } from "../_lib/quelltextScan";

/**
 * DER WAECHTER DES UPDATE-STYLESHEETS (DRK-495) — dieselben drei Zusicherungen wie
 * `_ui/verwaltung-css.test.ts`, fuer das Blatt des Update-Modus: jede genutzte Klasse ist
 * deklariert, kein `--ant-*` (Falle 2), kein Farbwert (Falle 3) und keine Hoehe (Falle 4 —
 * 56/72 kommt aus `UPDATE_DICHTE` in der Insel, nicht aus CSS).
 *
 * ⚠️ WAS ER NICHT SIEHT: ob die Regeln gegen antds cssinjs durchkommen (Falle 5). Das Blatt
 * setzt deshalb keine Regel auf ein antd-Bauteil ausser Breite und Abstand.
 */

const STYLESHEET = "src/app/m/radio/_ui/update.module.css";
const LESER = ["src/app/m/radio/admin/(arbeit)/software/UpdateSuche.tsx"];

function blatt(): string {
  return ohneKommentare(readFileSync(STYLESHEET, "utf8"));
}

describe("radio-update.module.css", () => {
  it("die Insel liest das Blatt, und jede genutzte Klasse ist deklariert", () => {
    const deklariert = new Set(
      [...blatt().matchAll(/\.([a-zA-Z][a-zA-Z0-9_]*)\s*(?=[,{:[])/g)].map((m) => m[1]!),
    );
    for (const pfad of LESER) {
      const quelle = ohneKommentare(readFileSync(pfad, "utf8"));
      expect(quelle, `${pfad} liest das Blatt nicht`).toMatch(
        /\bimport\s+u\s+from\s+["'][^"']*update\.module\.css["']/,
      );
      const genutzt = [...new Set([...quelle.matchAll(/\bu\.([A-Za-z][A-Za-z0-9_]*)/g)].map((m) => m[1]!))];
      expect(genutzt.length, "kein Klassenzugriff gefunden — der Scan waere leer-gruen").toBeGreaterThan(0);
      expect(genutzt.filter((name) => !deklariert.has(name))).toEqual([]);
    }
  });

  it("liest nur Suite-Variablen, verdrahtet keine Farbe und keine Hoehe", () => {
    const css = blatt();
    expect(css, "eine --ant-Variable ausserhalb von antds Scope (Falle 2)").not.toMatch(/var\(\s*--ant-/);
    const fremde = [...css.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)]
      .map((m) => m[1]!)
      .filter((name) => !/^--(?:iuk|font)-/.test(name));
    expect([...new Set(fremde)]).toEqual([]);
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g), "ein Farbwert im Stylesheet (Falle 3)").toBeNull();
    const farben = [...css.matchAll(/(?:^|[\s;{])(?:background-color|background|color)\s*:\s*([^;}]+)/g)]
      .map((m) => m[1]!.trim())
      .filter((wert) => wert !== "inherit" && !/^var\(\s*--iuk-/.test(wert));
    expect(farben).toEqual([]);
    expect(css, "eine feste Hoehe — 56 kommt aus UPDATE_DICHTE (Falle 4)").not.toMatch(
      /(?:^|[\s;{])(?:min-|max-)?height\s*:/,
    );
  });
});
