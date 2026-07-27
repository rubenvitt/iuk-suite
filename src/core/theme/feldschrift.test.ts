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
 *
 * UNTERGRENZE, KEIN DIKTAT: die Regel fuer natives Markup (`input`, `textarea`,
 * `select`) steht bewusst OHNE `:root` in `globals.css` — Spezifitaet (0,0,1),
 * schwaecher als jede einzelne Modul-Klasse (0,1,0). Eine fruehere Fassung
 * stand auf `:root input` (0,1,1) und ueberstimmte damit `.textfeld` im
 * Abendzettel, der bewusst auf 18px steht (zettel.module.css:628) — ein
 * Fix-Runde-1-Fund. Die einzige Ausnahme ist `.ant-select-selector`: antds
 * eigene Regel dafuer muss geschlagen werden, dafuer braucht sie `:root`.
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
  it("hebt input, textarea, select in globals.css auf 16px — bewusst OHNE :root", () => {
    // Kommentare raus, sonst zaehlt eine Erwaehnung im Fliesstext als Regel.
    const css = CSS_GLOBAL.replace(/\/\*[\s\S]*?\*\//g, "");
    // Ohne :root (oder eine andere Klasse/ID davor) bleibt die Regel bei
    // Spezifitaet (0,0,1) — schwaecher als jede Modul-Klasse (0,1,0). Nur so
    // darf der Abendzettel `.textfeld` weiterhin auf 18px halten.
    const block = /(^|\n)\s*input\s*,\s*textarea\s*,\s*select\s*\{([\s\S]*?)\}/.exec(css);
    expect(block, "Regel `input, textarea, select { … }` (ohne :root) fehlt in globals.css").not.toBeNull();
    expect(block![2]).toMatch(/font-size:\s*16px/);
  });

  it("hebt .ant-select-selector ueber :root auf 16px — die einzige Stelle, die das braucht", () => {
    const css = CSS_GLOBAL.replace(/\/\*[\s\S]*?\*\//g, "");
    // Hier IST :root richtig: antds eigene `.ant-select-selector`-Regel
    // (0,1,0) muss geschlagen werden, und es gibt kein Modul-Gegenstueck, das
    // absichtlich darunter liegen wollte.
    const block = /:root\s+\.ant-select-selector\s*\{([\s\S]*?)\}/.exec(css);
    expect(block, "Regel `:root .ant-select-selector` fehlt in globals.css").not.toBeNull();
    expect(block![1]).toMatch(/font-size:\s*16px/);
  });

  it("gibt den Select-Optionen 16px (die CSS-Regel erreicht sie nicht — kein input)", () => {
    for (const modus of ["light", "dark"] as const) {
      const optionFontSize = buildTheme(modus).components?.Select?.optionFontSize;
      expect(optionFontSize).toBe(16);
    }
  });

  it("gibt Input, InputNumber und DatePicker 16px ueber inputFontSize, nicht fontSize", () => {
    // `inputFontSize`, nicht `fontSize` — der Name ist die Falle (siehe
    // theme.ts). Ueber Tokens, damit die CSS-Regel oben niedrig spezifisch
    // bleiben kann und Modul-CSS sie weiterhin nach oben ueberschreibt.
    for (const modus of ["light", "dark"] as const) {
      const components = buildTheme(modus).components;
      expect(components?.Input?.inputFontSize).toBe(16);
      expect(components?.InputNumber?.inputFontSize).toBe(16);
      expect(components?.DatePicker?.inputFontSize).toBe(16);
    }
  });

  it("gibt AUCH `inputFontSizeLG` 16px — `size=\"large\"` faellt sonst durch beide Wege", () => {
    /*
     * DIE LUECKE, DIE NIEMAND SIEHT, WEIL SIE HEUTE ZUFAELLIG GESCHLOSSEN IST.
     *
     * antd leitet die grosze Variante NICHT aus `inputFontSize` ab:
     * `antd/es/input/style/token.js:34` rechnet `inputFontSizeLG || fontSizeLG`
     * — ohne eigenen Wert landet das Feld auf `fontSizeLG`, und das ist per
     * Default 16. Der zweite Weg, die globale Regel `input { font-size: 16px }`
     * aus `globals.css`, greift ebenfalls nicht: `.ant-input-lg` ist (0,1,0)
     * und schlaegt sie (0,0,1).
     *
     * `size="large"` ist die haeufigste Eingabeform der Suite (preset-form 10x,
     * UrlInput, wifi, tel, contact, login-form). Wer irgendwann `fontSizeLG`
     * anfasst — ein voellig unverdaechtiger Aufraeumschritt — senkt sie alle
     * still unter die Untergrenze. Diese Assertion ist die Bremse dafuer.
     *
     * Kein Gegenstueck fuer `inputFontSizeSM`: das erbt laut `token.js:33` von
     * `inputFontSize`, dort ist keine Luecke.
     */
    for (const modus of ["light", "dark"] as const) {
      const components = buildTheme(modus).components;
      expect(components?.Input?.inputFontSizeLG).toBe(16);
      expect(components?.InputNumber?.inputFontSizeLG).toBe(16);
      expect(components?.DatePicker?.inputFontSizeLG).toBe(16);
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

  it("regressiert nicht: .textfeld im Abendzettel schlaegt die globale 16px-Regel und bleibt bei 18px", () => {
    // Fix-Runde-1-Fund: `:root textarea` (0,1,1) schlug `.textfeld` (0,1,0) im
    // Zettel und zwang das bewusst auf 18px gesetzte Feld
    // (zettel.module.css:628) auf 16px herunter. Der Kommentar im Ur-Brief
    // behauptete das Gegenteil — er war falsch, nicht die Umsetzung.
    const css = CSS_GLOBAL.replace(/\/\*[\s\S]*?\*\//g, "");
    // Kein :root (oder sonstiger Praefix) vor textarea — sonst schlaegt die
    // globale Regel jede Modul-Klasse wieder.
    expect(css).not.toMatch(/:root\s+textarea\b/);
    const block = /(^|\n)\s*input\s*,\s*textarea\s*,\s*select\s*\{([\s\S]*?)\}/.exec(css);
    expect(block, "Regel `input, textarea, select { … }` (ohne :root) fehlt in globals.css").not.toBeNull();
    expect(block![2]).toMatch(/font-size:\s*16px/);

    const zettelCss = readFileSync("src/app/m/feedback/f/[slugSecret]/zettel.module.css", "utf8");
    const textfeldRegel = /\.textfeld\s*\{([^}]*)\}/.exec(zettelCss)?.[1] ?? "";
    expect(textfeldRegel, "Regel `.textfeld { … }` fehlt in zettel.module.css").toMatch(/font-size:\s*18px/);
  });
});
