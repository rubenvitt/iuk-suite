import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * DIE UMSCHALTUNG MOBIL/DESKTOP IST CSS, NICHT JAVASCRIPT.
 *
 * Warum das hier und nicht im DOM geprueft wird: **jsdom wertet Media Queries
 * nicht aus.** Ein Test, der "auf 390px steht kein Modulknopf im Kopf"
 * behauptet und dafuer in jsdom nach Knoepfen sucht, geht IMMER durch — er
 * misst nichts. Diese Datei besitzt die Regel (die Klasse traegt die richtige
 * Media Query), das sichtbare Ergebnis besitzt der Playwright-Lauf bei
 * 390x844.
 *
 * Warum ueberhaupt CSS und nicht `Grid.useBreakpoint`: das ist in Server
 * Components verboten (docs/design/README.md, Falle 1), und ein JS-Breakpoint
 * zeigt beim ersten Render immer die falsche Variante.
 */
const CSS = readFileSync("src/core/shell/shell.module.css", "utf8");
const OHNE_KOMMENTARE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

describe("shell.module.css", () => {
  it("kennt genau einen Breakpoint, und der ist 768px", () => {
    const breakpoints = [...OHNE_KOMMENTARE.matchAll(/\(min-width:\s*(\d+)px\)/g)].map((m) => m[1]);
    expect(breakpoints.length).toBeGreaterThan(0);
    expect(new Set(breakpoints)).toEqual(new Set(["768"]));
  });

  it("blendet Desktop-Inhalte unterhalb von 768px aus", () => {
    // `.nurDesktop` steht ohne Media Query auf `display: none` und wird erst
    // ab 768px eingeblendet — mobile-first, kein Aufblitzen beim Laden.
    const basis = /\.nurDesktop\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(basis, "Klasse .nurDesktop fehlt").not.toBeNull();
    expect(basis![1]).toMatch(/display:\s*none/);
  });

  it("blendet den Menue-Knopf ab 768px aus", () => {
    const abBreakpoint = OHNE_KOMMENTARE.slice(OHNE_KOMMENTARE.indexOf("(min-width: 768px)"));
    const regel = /\.nurMobil\s*\{([^}]*)\}/.exec(abBreakpoint);
    expect(regel, ".nurMobil wird ab 768px nicht ausgeblendet").not.toBeNull();
    expect(regel![1]).toMatch(/display:\s*none/);
  });

  it("nutzt keine `--ant-*`-Variablen (die sieht eigenes Markup nicht)", () => {
    expect(OHNE_KOMMENTARE).not.toMatch(/var\(--ant-/);
  });

  it("gibt dem Titel-Link die Schriftfarbe des Kopfes und keine Unterstreichung", () => {
    // Uebernommen aus der geloeschten FullShell.test.tsx: dort waren es
    // Inline-Styles, hier ist es CSS — die Zusage bleibt dieselbe. Ohne sie
    // faellt der Titel auf die Browser-Linkfarbe zurueck, mitten in der
    // Kopfzeile.
    const regel = /\.titel\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(regel, "Klasse .titel fehlt").not.toBeNull();
    expect(regel![1]).toMatch(/color:\s*inherit/);
    expect(regel![1]).toMatch(/text-decoration:\s*none/);
  });

  it("laesst die Modulknopfreihe nicht ueber den Titel brechen", () => {
    // Ebenfalls aus FullShell.test.tsx. Der alte `overflow: hidden` kaschierte
    // das Problem, indem er ueberzaehlige Module abschnitt; geblieben ist
    // `flex-wrap: nowrap` — auf Desktop soll die Reihe einzeilig bleiben, und
    // auf Mobil steht sie ohnehin nicht im Kopf.
    const regel = /\.modulzeile\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(regel, "Klasse .modulzeile fehlt").not.toBeNull();
    expect(regel![1]).toMatch(/flex-wrap:\s*nowrap/);
  });
});
