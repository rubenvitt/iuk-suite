import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildTheme } from "./theme";

/**
 * EINGABEFELDER FALLEN NIRGENDS UNTER 16px.
 *
 * Die Begruendung hat sich UMGEDREHT und das ist der Grund, warum sie hier so
 * ausfuehrlich steht: frueher war 16px die Abwehr gegen iOS' Auto-Zoom beim
 * Fokus. Seit der Zoom suiteweit gesperrt ist (`app/layout.tsx`), zoomt iOS gar
 * nicht mehr — der alte Grund ist weg. Die Regel bleibt aus dem UMGEKEHRTEN:
 * ohne Zoom kann niemand mehr heranholen, was zu klein ist. Ein 14px-Feld war
 * vorher unbequem, jetzt ist es endgueltig.
 *
 * Wer den alten Kommentar irgendwo findet und die Regel deshalb fuer redundant
 * haelt: sie ist es nicht. Zoom-Sperre und 16px sind eine Einheit.
 */

const CSS_GLOBAL = readFileSync("src/app/globals.css", "utf8");

/** Alle CSS-Dateien unter src/, rekursiv. */
function alleCss(verzeichnis: string): string[] {
  return readdirSync(verzeichnis).flatMap((eintrag) => {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) return alleCss(pfad);
    return pfad.endsWith(".css") ? [pfad] : [];
  });
}

describe("Feldschrift — 16px als Suite-Untergrenze", () => {
  it("hebt die vier Eingabe-Selektoren in globals.css auf 16px", () => {
    // Kommentare raus, sonst zaehlt eine Erwaehnung im Fliesstext als Regel.
    const css = CSS_GLOBAL.replace(/\/\*[\s\S]*?\*\//g, "");
    const block = /:root input[\s\S]*?\{([\s\S]*?)\}/.exec(css);
    expect(block, "Regel `:root input, …` fehlt in globals.css").not.toBeNull();
    expect(block![1]).toMatch(/font-size:\s*16px/);
    for (const selektor of ["input", "textarea", "select", ".ant-select-selector"]) {
      expect(css).toContain(`:root ${selektor}`);
    }
  });

  it("gibt den Select-Optionen 16px (die CSS-Regel erreicht sie nicht — kein input)", () => {
    for (const modus of ["light", "dark"] as const) {
      const optionFontSize = buildTheme(modus).components?.Select?.optionFontSize;
      expect(optionFontSize).toBe(16);
    }
  });

  it("laesst die globale Schriftleiter unangetastet", () => {
    // Basis 16 verschoebe jede Ueberschrift und Tabellenzelle — verboten laut
    // docs/design/README.md:110 ("antds eigene Leiter, keine dritte Skala").
    for (const modus of ["light", "dark"] as const) {
      expect(buildTheme(modus).token?.fontSize).toBeUndefined();
    }
  });

  it("hat in keiner CSS-Datei eine Eingabe-Regel unter 16px", () => {
    const verstoesse: string[] = [];
    for (const pfad of alleCss("src")) {
      const css = readFileSync(pfad, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        // At-Regel-Klammern aufloesen, SONST SIEHT DER SCAN NICHTS.
        // Bei `@media (…) { .fb-form input { font-size: 14px } }` faengt der
        // naive Klammer-Regex unten `@media (…)` als Selektor und schluckt die
        // innere Regel in den Koerper — die Eingabe-Regel wird nie geprueft.
        // Und in Media Queries steht genau das, worum es hier geht: kleine
        // Schriftgroeszen fuer schmale Geraete. Waere derselbe Fehler wie ein
        // jsdom-Test auf Media Queries: gruen, ohne zu messen.
        .replace(/@[a-z-]+[^{;]*\{/gi, "");
      // Regelbloecke, deren Selektor ein Eingabefeld benennt.
      for (const treffer of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const selektor = treffer[1];
        const koerper = treffer[2];
        if (!/\b(input|textarea|select)\b|\.ant-select-selector/.test(selektor)) continue;
        const groesse = /font-size:\s*(\d+)px/.exec(koerper);
        if (groesse && Number(groesse[1]) < 16) {
          verstoesse.push(`${pfad}: ${selektor.trim()} -> ${groesse[1]}px`);
        }
      }
    }
    expect(verstoesse).toEqual([]);
  });
});
