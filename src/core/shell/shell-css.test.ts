import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * DIE UMSCHALTUNG MOBIL/DESKTOP IST CSS, NICHT JAVASCRIPT.
 *
 * Warum das hier und nicht im DOM geprueft wird: **jsdom wertet Media Queries
 * nicht aus.** Ein Test, der "auf 390px steht kein Modulknopf im Kopf"
 * behauptet und dafuer in jsdom nach Knoepfen sucht, geht IMMER durch — er
 * misst nichts. Diese Datei besitzt die Regel (die Klasse traegt die richtige
 * Media Query), das sichtbare ERGEBNIS besitzt der Playwright-Lauf
 * (`e2e/shell-mobil.spec.ts`, 390x844 und 1280x720).
 *
 * DIESE TRENNUNG HAT EINE HARTE GRENZE, und sie ist auf diesem Zweig teuer
 * bezahlt worden: **Regeltext-Pruefung kann eine Kaskadenkollision strukturell
 * nicht finden.** Die Regel `.nurMobil { display: none }` in der Media Query
 * war vorhanden, sie matchte auch — und verlor trotzdem gegen antds
 * `.ant-btn { display: inline-flex }`, weil beide Selektoren die Spezifitaet
 * (0,1,0) haben und antds Stylesheet spaeter kommt. Jeder Test hier war gruen,
 * der Knopf stand bei 1280px sichtbar im Kopf. Was diese Datei leisten kann,
 * ist die GEGENMASZNAHME festzuhalten (der Selektor traegt `.rechts` voran, ist
 * damit (0,2,0)); ob sie wirkt, weisz nur ein echter Browser.
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

  it("haelt `.nurMobil` an BEIDEN Stellen ueber `.ant-btn` — Basis und Media Query", () => {
    /*
     * Der einzige Test hier, der nicht bloss eine Deklaration nachliest,
     * sondern den SELEKTOR prueft — weil genau dort der Defekt sasz.
     *
     * `.nurMobil` allein ist (0,1,0), gleichauf mit antds
     * `.ant-btn { display: inline-flex }`; bei Gleichstand gewinnt, was spaeter
     * im Dokument steht, und das ist antd. `.rechts .nurMobil` ist (0,2,0) und
     * gewinnt unabhaengig von der Reihenfolge — ohne `!important`.
     *
     * BEIDE Vorkommen, nicht nur das in der Media Query: ein Paar, dessen eine
     * Haelfte gilt und dessen andere still ueberstimmt wird, ist genau der
     * Zustand, aus dem der Fehler kam.
     *
     * Dieser Test faengt das Entfernen des Praefix. Er faengt NICHT, dass antd
     * morgen eine spezifischere Regel mitbringt — das kann nur der Browser.
     */
    const vorkommen = [...OHNE_KOMMENTARE.matchAll(/([^{}]*)\.nurMobil\s*\{/g)];
    // Untergrenze statt fester Zahl: geprueft wird, DASS jedes Vorkommen den
    // Praefix traegt (Schleife unten) — nicht, wie viele es gibt. Eine dritte,
    // legitime Regel waere sonst mit der Meldung "Klasse .nurMobil fehlt"
    // fehlgeschlagen, und die schickt den Suchenden in die falsche Richtung.
    expect(vorkommen.length, "Klasse .nurMobil fehlt in shell.module.css").toBeGreaterThanOrEqual(2);
    for (const treffer of vorkommen) {
      expect(treffer[1], `Selektor ohne .rechts-Praefix: "${treffer[0]}"`).toMatch(
        /\.rechts\s+$/,
      );
    }
  });

  it("haengt die Hervorhebung an `[aria-current]` ohne Wert", () => {
    /*
     * Der Wert ist `"page"` auf der aufgerufenen Seite und `"true"` auf einer
     * Seite, die nur zum Abschnitt gehoert (SuiteNav.tsx, `aktiverEintrag`).
     * Wer den Selektor auf `="page"` zurueckengt, laesst die
     * Abschnitts-Markierung still verschwinden: der Link ist dann markiert und
     * sieht unmarkiert aus.
     */
    const regel = /\.navLink\[aria-current\]\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(regel, "Regel `.navLink[aria-current]` fehlt (auf `=page` verengt?)").not.toBeNull();
    expect(regel![1]).toMatch(/border-block-end-color:\s*currentColor/);
    expect(OHNE_KOMMENTARE).not.toMatch(/\.navLink\[aria-current=/);
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

  it("polstert die Kopfzeile NICHT hier, sondern ueber `Layout.headerPadding`", () => {
    /*
     * `.kopf { padding-inline: 16px }` stand einmal hier und galt nie: `.kopf`
     * und antds `.ant-layout-header` sind beide (0,1,0), antds Stylesheet kommt
     * spaeter. GEMESSEN wurden 90px je Seite — antd rechnet
     * `controlHeightLG * 1.25` (antd/es/layout/style/index.js:85), und
     * `controlHeightLG` ist in dieser Suite das Handschuh-Masz 72 statt antds
     * 40. Auf 768px blieben 588px Inhalt: zu wenig fuer Titel UND `.rechts`,
     * der Titel fiel auf 0px.
     *
     * Dieser Test faengt das Wiedereinsetzen einer Deklaration, die still nicht
     * gilt. Er faengt NICHT, dass jemand den Token in `theme.ts` loescht — das
     * tut `core/theme/theme.test.ts`.
     */
    const regel = /\.kopf\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(regel, "Klasse .kopf fehlt").not.toBeNull();
    expect(regel![1], "padding in .kopf verliert gegen .ant-layout-header").not.toMatch(/padding/);
  });

  it("haelt die Modulnavigation unterhalb von 768px aus dem Weg", () => {
    /*
     * Seit sie eine EIGENE ZEILE unter der Kopfzeile ist, deckt der
     * 390px-Hoehentest sie nicht mehr ab — er misst `suite-header`, und die
     * Zeile steht daneben. Zeigte sie sich mobil, kaeme sie zu den 64px hinzu.
     * Das sichtbare Ergebnis besitzt `e2e/shell-mobil.spec.ts`, die Regel hier.
     */
    const basis = /\.modulnav\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(basis, "Klasse .modulnav fehlt").not.toBeNull();
    expect(basis![1]).toMatch(/display:\s*none/);
    const abBreakpoint = OHNE_KOMMENTARE.slice(OHNE_KOMMENTARE.indexOf("(min-width: 768px)"));
    expect(/\.modulnav\s*\{([^}]*)\}/.exec(abBreakpoint)?.[1] ?? "").toMatch(/display:\s*flex/);
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
