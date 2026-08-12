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

type CssRegel = {
  selektor: string;
  deklarationen: string;
};

function cssRegeln(css: string): CssRegel[] {
  // Die Klammern sind nur Anker, nie Teil des Treffers. Nach `}` beginnt die
  // naechste Geschwisterregel; nach `{` beginnt das erste Kind einer At-Rule.
  // Beide muessen ohne Zeichenverbrauch pruefbar sein, sonst ueberspringt der
  // globale Scanner genau diese Regeln.
  return [...css.matchAll(/(?:(?<=})|(?<=\{)|^)\s*([^{}]+?)\s*\{([^{}]*)\}/g)].map((treffer) => ({
    selektor: treffer[1].trim(),
    deklarationen: treffer[2],
  }));
}

function zieltAufKlasse(selektor: string, klasse: string): boolean {
  // Die Wortgrenzen allein reichen nicht: in `.nicht-modulnav` waere das
  // Bindestrich-Zeichen eine Wortgrenze. Der Selektor muss die Klasse selbst
  // tragen, nicht bloss einen Namensvetter.
  return new RegExp(`(^|[^A-Za-z0-9_-])\\.${klasse}(?![A-Za-z0-9_-])`).test(selektor);
}

function modulnavRegeln(css: string): CssRegel[] {
  const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return cssRegeln(ohneKommentare).filter((regel) => zieltAufKlasse(regel.selektor, "modulnav"));
}

function deklarationsWerte(regeln: CssRegel[], eigenschaft: string): string[] {
  const muster = new RegExp(`(?:^|;)\\s*${eigenschaft}\\s*:\\s*([^;}]+)`, "g");
  return regeln.flatMap((regel) =>
    [...regel.deklarationen.matchAll(muster)].map((deklaration) => deklaration[1].trim()),
  );
}

function modulnavStruktur(css: string) {
  const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const mediaStart = ohneKommentare.indexOf("@media (min-width: 768px)");
  expect(mediaStart, "einziger Desktop-Breakpoint fehlt").toBeGreaterThanOrEqual(0);

  const basisRegeln = modulnavRegeln(ohneKommentare.slice(0, mediaStart));
  expect(basisRegeln, "vor der Media Query muss genau eine Basisregel .modulnav stehen").toHaveLength(1);

  return {
    basis: basisRegeln[0],
    alle: modulnavRegeln(ohneKommentare),
    abBreakpoint: ohneKommentare.slice(mediaStart),
  };
}

function erwartetRobusteModulnavUeberlaufbehandlung(css: string) {
  const struktur = modulnavStruktur(css);

  // Genau eine Quelle je Eigenschaft: eine zweite Regel mit demselben Wert ist
  // ebenso ein Kaskadenrisiko wie eine mit `hidden` oder `initial`.
  expect(deklarationsWerte(struktur.alle, "overflow-x")).toEqual(["auto"]);
  expect(deklarationsWerte(struktur.alle, "scrollbar-width")).toEqual(["thin"]);
  for (const regel of struktur.alle) {
    expect(regel.deklarationen, `scroll-behavior in "${regel.selektor}"`).not.toMatch(
      /(?:^|;)\s*scroll-behavior\s*:/,
    );
  }

  return struktur;
}

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

  it("laeszt `.modulnav` waagerecht scrollen statt `documentElement`", () => {
    /*
     * DIE UEBERLAUFBEHANDLUNG (Spec 6.3.2 des lagerbuch-Entwurfs,
     * Entscheidung 31).
     *
     * `.modulnav` ist ein Flex-Container mit `nowrap` ab 768px; `.navLink`
     * traegt `min-height: 56px` und `padding-inline: 12px`. Ein Modul mit
     * VIELEN Abschnitten sprengt die Zeile: lagerbuch hat 15 Eintraege mit
     * zusammen 127 Zeichen, ueberschlaegig 1.300-1.400px. Bei 1280px kann kein
     * Link unter seine `min-content`-Breite schrumpfen — also lief die Zeile
     * ueber, und `documentElement` scrollte waagerecht. Das ist nicht „die
     * Leiste sieht eng aus", das ist die ganze Seite, die seitwaerts wandert.
     *
     * `scrollbar-width: thin` haelt die Leiste bei ihrer Hoehe. Der
     * Unterstrich der Aktivmarkierung (`.navLink[aria-current]`, 2px) darf
     * nicht unter einer Scrollleiste verschwinden — deshalb scrollt der
     * CONTAINER und nicht `documentElement`.
     *
     * DIESE DATEI BESITZT „die Regel steht da". Ob sie WIRKT, besitzt der
     * Playwright-Lauf bei 1280x720 (`e2e/lagerbuch-verwaltung.spec.ts`) — bei
     * 390px sind die richtige und die kaputte Fassung nicht zu unterscheiden,
     * weil `.modulnav` dort auf `display: none` steht.
     */
    const { basis } = erwartetRobusteModulnavUeberlaufbehandlung(OHNE_KOMMENTARE);
    expect(basis.deklarationen).toMatch(/overflow-x:\s*auto/);
    expect(basis.deklarationen).toMatch(/scrollbar-width:\s*thin/);
  });

  it("animiert das Scrollen der Modulnavigation nicht", () => {
    // `prefers-reduced-motion` bleibt unberuehrt: es wird nichts animiert und
    // `scroll-behavior` bleibt ungesetzt. Ein `scroll-behavior: smooth` hier
    // waere eine Animation ohne Gegenstueck im reduced-motion-Zweig.
    const { alle } = modulnavStruktur(OHNE_KOMMENTARE);
    for (const regel of alle) {
      expect(regel.deklarationen, `scroll-behavior in "${regel.selektor}"`).not.toMatch(
        /(?:^|;)\s*scroll-behavior\s*:/,
      );
    }
  });

  it("verwirft eine spaetere `.modulnav`-Ueberschreibung trotz gruenem Ersttreffer", () => {
    const mutation = `${OHNE_KOMMENTARE}
      .modulnav {
        overflow-x: hidden;
        scroll-behavior: smooth;
      }
    `;

    // Genau der bisherige Ersttreffer: er bleibt gruen und sieht die spaetere
    // Kaskaden-Ueberschreibung nicht.
    const ersterTreffer = /\.modulnav\s*\{([^}]*)\}/.exec(mutation);
    expect(ersterTreffer, "Basisregel .modulnav fehlt").not.toBeNull();
    expect(ersterTreffer![1]).toMatch(/overflow-x:\s*auto/);
    expect(ersterTreffer![1]).toMatch(/scrollbar-width:\s*thin/);
    expect(ersterTreffer![1]).not.toMatch(/scroll-behavior/);

    // Die robuste Zusage sieht ALLE Regeln und lehnt sowohl die spaetere
    // `hidden`-Ueberschreibung als auch deren `scroll-behavior` ab.
    expect(() => erwartetRobusteModulnavUeberlaufbehandlung(mutation)).toThrow();
  });

  it("verwirft `.modulnav` als erstes Kind einer spaeteren Media Query", () => {
    const mutation = `${OHNE_KOMMENTARE}
      @media (min-width: 1000px) {
        .modulnav {
          overflow-x: hidden;
          scroll-behavior: smooth;
        }
      }
    `;

    // Die Media-Regel ist nach der bestehenden 768px-Regel spaeter und kann
    // sie im Browser ueberstimmen. Auch als ERSTES Kind muss sie der Scanner
    // finden; vor dem Fix ueberspringt er genau diese Position.
    expect(() => erwartetRobusteModulnavUeberlaufbehandlung(mutation)).toThrow();
  });

  it("ignoriert Kommentare und aehnlich benannte Klassen bei .modulnav", () => {
    const nurNamen = `${CSS}
      /* .modulnav { overflow-x: hidden; scroll-behavior: smooth; } */
      .modulnavigation { overflow-x: hidden; scroll-behavior: smooth; }
      .nicht-modulnav { scrollbar-width: none; }
    `;

    expect(() => erwartetRobusteModulnavUeberlaufbehandlung(nurNamen)).not.toThrow();
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
    const { basis, abBreakpoint } = modulnavStruktur(OHNE_KOMMENTARE);
    expect(basis.deklarationen).toMatch(/display:\s*none/);
    const desktopRegeln = modulnavRegeln(abBreakpoint);
    expect(desktopRegeln, "Desktopregel .modulnav fehlt").toHaveLength(1);
    expect(desktopRegeln[0].deklarationen).toMatch(/display:\s*flex/);
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

describe("Markenstreifen und Kopfzeilentypografie", () => {
  it("legt den Streifen als eigene Klasse an, nicht als Kante an .kopf", () => {
    // EIN EIGENES ELEMENT STATT EINER KANTE AN DER ANTD-FLAECHE, und das ist
    // kein Stil: `.kopf` und `.ant-layout-header` sind beide (0,1,0), antds
    // Stylesheet kommt spaeter. Eine `border-block-start` an `.kopf` waere
    // derselbe Streit, den `padding-inline` an dieser Stelle schon einmal
    // verloren hat (gemessen, siehe Kopf dieser Datei). Ein eigenes Element ist
    // keiner.
    expect(CSS).toMatch(/\.streifen\s*\{[^}]*background:\s*var\(--iuk-marke\)/);
    expect(CSS).toMatch(/\.streifen\s*\{[^}]*height:\s*5px/);
    expect(CSS).not.toMatch(/\.kopf\s*\{[^}]*border-block-start/);
  });

  it("faerbt den Drawer-Gruppentitel ueber die Suite-Variable statt ueber opacity", () => {
    // `opacity: 0.6` dimmt auch den Kontrast des Hintergrunds mit und ist als
    // Farbaussage nicht pruefbar. Eine Variable ist es.
    const regel = CSS.match(/\.drawerTitel\s*\{([^}]*)\}/);
    expect(regel, ".drawerTitel fehlt").not.toBeNull();
    expect(regel![1]!).toMatch(/color:\s*var\(--iuk-gedaempft\)/);
    expect(regel![1]!, "opacity als Farbersatz ist raus").not.toMatch(/opacity/);
  });
});
