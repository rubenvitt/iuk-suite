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

function deklarationsWerte(regeln: CssRegel[], eigenschaft: string): string[] {
  const muster = new RegExp(`(?:^|;)\\s*${eigenschaft}\\s*:\\s*([^;}]+)`, "g");
  return regeln.flatMap((regel) =>
    [...regel.deklarationen.matchAll(muster)].map((deklaration) => deklaration[1].trim()),
  );
}

function siderRegeln(css: string): CssRegel[] {
  const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return cssRegeln(ohneKommentare).filter((regel) => zieltAufKlasse(regel.selektor, "sider"));
}

/**
 * DIE DREI KASKADEN-PRUEFMUSTER, UEBERNOMMEN VON `.modulnav`.
 *
 * Sie pruefen eine KLASSE VON FEHLERN: ein gruener Ersttreffer, hinter dem eine
 * spaetere Regel dieselbe Eigenschaft still ueberschreibt. Mit dem Wegfall der
 * zweiten Kopfzeile (2026-08-13) waeren sie sonst ersatzlos verloren gewesen.
 *
 * Die Invarianten: genau EIN `display`-Wert vor dem Breakpoint (`none`), genau
 * EINER darin (`block`), genau EIN `inset-block-start`. Eine zweite Regel mit
 * demselben Wert ist ebenso ein Kaskadenrisiko wie eine mit `initial`.
 *
 * Die Media Query wird erst AB der Position der `.sider`-Basisregel gesucht:
 * die Basisregel steht selbst HINTER dem ersten `(min-width: 768px)`-Block
 * (`.rechts .nurMobil` & Co.). Eine Suche ab der ersten Fundstelle schnitte
 * sie nicht ab, und der folgende `.sider`-Treffer waere der FALSCHE. Genau
 * diese Falle steht schon am Test „klebt die Seitenleiste ab 768px fest".
 */
function erwartetRobusteSiderUmschaltung(css: string) {
  const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const basisIndex = ohneKommentare.indexOf(".sider {");
  expect(basisIndex, "Basisregel .sider fehlt").toBeGreaterThanOrEqual(0);

  const mediaStart = ohneKommentare.indexOf("@media (min-width: 768px)", basisIndex);
  expect(mediaStart, "Desktop-Breakpoint nach der .sider-Basisregel fehlt").toBeGreaterThanOrEqual(0);

  const basis = siderRegeln(ohneKommentare.slice(basisIndex, mediaStart));
  expect(basis, "vor der Media Query muss genau eine Basisregel .sider stehen").toHaveLength(1);
  expect(deklarationsWerte(basis, "display")).toEqual(["none"]);

  const desktop = siderRegeln(ohneKommentare.slice(mediaStart));
  expect(desktop, "ab 768px muss genau eine Regel .sider stehen").toHaveLength(1);
  expect(deklarationsWerte(desktop, "display")).toEqual(["block"]);
  expect(deklarationsWerte(siderRegeln(ohneKommentare), "inset-block-start")).toEqual([
    "var(--iuk-kopf)",
  ]);

  return { basis: basis[0], desktop: desktop[0] };
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

  it("kennt die Klasse .modulzeile nicht mehr", () => {
    // Die Modulknopfreihe ist mit dem Navigations-Umbau ersatzlos entfallen —
    // die Apps hängen jetzt am Umschalter der Kopfzeile. Ein Wiederauftauchen
    // der Klasse wäre ein Rückbau, den kein anderer Test hier fängt.
    expect(OHNE_KOMMENTARE).not.toMatch(/\.modulzeile\b/);
  });

  it("kennt die Klasse .modulnav nicht mehr", () => {
    /*
     * Die zweite Kopfzeile ist am 2026-08-13 ersatzlos entfallen: jedes Modul
     * mit Navigation traegt die Seitenleiste. Ein Wiederauftauchen der Klasse
     * waere die Rueckkehr zu zwei Navigationsparadigmen — dasselbe Muster wie
     * beim Test `"kennt die Klasse .modulzeile nicht mehr"` darueber.
     */
    expect(OHNE_KOMMENTARE).not.toMatch(/\.modulnav\b/);
  });

  it("nimmt dem Umschalter die von antd geerbte Zeilenhoehe", () => {
    /*
     * DIE URSACHE DES UNBENUTZBAREN PANELS, und sie steht in keiner Datei
     * dieses Repos: `antd/es/layout/style/index.js:50` setzt auf
     * `.ant-layout-header` ein `lineHeight: unit(headerHeight)` — in dieser
     * Suite 64px. Der Umschalter haengt als DOM-Kind im `<Header>`;
     * `position: absolute` am Panel aendert den enthaltenden Block, NICHT die
     * Vererbungskette. Gemessen waren daraus 82px je Panel-Eintrag
     * (8px Polster + 64px Zeilenbox + 8px Polster) und ein 76px hoher
     * Ausloeser in einer 64px hohen Kopfzeile.
     *
     * Die Deklaration steht am gemeinsamen VORFAHREN von Ausloeser und Panel,
     * nicht an beiden einzeln: es ist eine Ursache, und zwei Deklarationen
     * dafuer laufen beim naechsten Anfassen auseinander.
     *
     * `normal` und keine Zahl: eine Zahl waere eine erfundene Skala, die ein
     * spaeterer Leser fuer geprueft haelt (dieselbe Regel wie in
     * `core/theme/schrift.ts`).
     *
     * DIESE DATEI BESITZT „die Regel steht da". Dass sie WIRKT, besitzt
     * `e2e/shell-mobil.spec.ts` — antd spritzt seine Regel zur Laufzeit ueber
     * cssinjs ein, kein Quelltext-Scan und kein jsdom kann sie sehen.
     */
    const regel = /\.umschalter\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(regel, "Klasse .umschalter fehlt").not.toBeNull();
    expect(regel![1], "antds .ant-layout-header vererbt sonst line-height: 64px").toMatch(
      /line-height:\s*normal/,
    );
  });

  it("faerbt Nebentext ueber `--iuk-gedaempft` statt ueber Deckkraft", () => {
    // Deckkraft dimmt den Kontrast unpruefbar mit und traegt in beiden Modi
    // verschieden; eine Variable hat einen Dunkelzweig. Dieselbe Begruendung
    // steht seit jeher an `.drawerTitel` — sie galt nur fuer den Umschalter
    // nicht (`.umschalterAbschnitt`, `.appEintragText`, `.umschalterLeer`,
    // `.umschalterFusszeile`, `.umschalterPfeil` standen auf `opacity`).
    for (const regel of cssRegeln(OHNE_KOMMENTARE)) {
      expect(regel.deklarationen, `opacity in "${regel.selektor}"`).not.toMatch(
        /(?:^|;)\s*opacity\s*:/,
      );
    }
  });

  it("gibt der aktiven Flaeche eine Variable mit Wert in BEIDEN Farbmodi", () => {
    /*
     * Dieselbe Bauart wie der Panel-Flaechen-Test darunter, und aus demselben
     * Grund: auf diesem Zweig war das Panel schon einmal weiss auf weiss, weil
     * ein Plan eine Variable erfunden hatte, die es nicht gab. `--iuk-flaeche-
     * aktiv` wird von `.appEintrag`, `.umschalterAusloeser` UND (ab Aufgabe 4)
     * `.navLink` gelesen — ein Fehlgriff faerbt drei Stellen still leer.
     *
     * Sie steht in `app/globals.css` und nicht hier: ein CSS-Modul kann `:root`
     * nicht scopen, und zwei Nutznieszer (Umschalter-Panel, Seitenleiste)
     * erfuellen den Maszstab aus `docs/design/README.md`.
     */
    const GLOBALS = readFileSync("src/app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const alle = cssRegeln(GLOBALS);
    const deklariert = (regel: CssRegel) =>
      /(?:^|;)\s*--iuk-flaeche-aktiv\s*:/.test(regel.deklarationen);

    expect(
      alle.some((r) => deklariert(r) && !r.selektor.includes('[data-theme="dark"]')),
      "--iuk-flaeche-aktiv hat keinen Hellwert",
    ).toBe(true);
    expect(
      alle.some((r) => deklariert(r) && r.selektor.includes('[data-theme="dark"]')),
      "--iuk-flaeche-aktiv hat keinen Wert unter [data-theme=dark]",
    ).toBe(true);
  });

  it("spannt das Umschalter-Panel mobil über die volle Breite", () => {
    /*
     * Mobil eine vollbreite Fläche unter der Kopfzeile (`AppUmschalter.tsx`).
     * `inset-inline: 0` VOR jeder Media Query, nicht erst darin — sonst wäre
     * die Basis-Regel ein Popover ohne feste Breite, irgendwo zwischen den
     * Rändern.
     *
     * ZWEI `@media (min-width: 768px)`-BLÖCKE IN DIESER DATEI, nicht einer:
     * der erste trägt `.nurMobil`/`.nurDesktop`/`.modulnav`, der zweite (ganz
     * am Dateiende) `.umschalterPanel`. Ein Split am ERSTEN Vorkommen von
     * `@media (min-width: 768px)` (wie bei `.modulnav` oben) schnitte die
     * Basisregel von `.umschalterPanel` fälschlich ab, weil sie zwischen
     * beiden Blöcken steht. Deshalb hier: alle Vorkommen der Klasse in
     * Dokumentreihenfolge, das ERSTE ist die Basisregel.
     */
    const vorkommen = [...OHNE_KOMMENTARE.matchAll(/\.umschalterPanel\s*\{([^}]*)\}/g)];
    expect(vorkommen.length, "Klasse .umschalterPanel fehlt").toBeGreaterThanOrEqual(2);
    expect(vorkommen[0][1]).toMatch(/inset-inline:\s*0\s*(?:;|$)/);
  });

  it("macht aus dem Umschalter-Panel ab 768px ein schmales Popover", () => {
    // Ab 768px keine vollbreite Fläche mehr, sondern ein Popover fester
    // Breite unter dem Auslöser — sonst zöge das Panel bei 1280px quer durch
    // die ganze Kopfzeile. Das ZWEITE Vorkommen (Begründung im Test oben).
    const vorkommen = [...OHNE_KOMMENTARE.matchAll(/\.umschalterPanel\s*\{([^}]*)\}/g)];
    expect(vorkommen.length, "Klasse .umschalterPanel fehlt").toBeGreaterThanOrEqual(2);
    expect(vorkommen[1][1]).toMatch(/inline-size:\s*\d+px/);
  });

  it("gibt der Panel-Fläche eine Variable, die in BEIDEN Farbmodi einen Wert hat", () => {
    /*
     * GENAU DIESER FEHLER IST AUF DIESEM ZWEIG SCHON EINMAL PASSIERT: das Panel
     * war weiß auf weiß, weil der Plan eine Variable erfunden hatte, die es
     * nicht gab. `shell-css.test.ts` prüfte bis hierher nur die BREITE des
     * Panels (siehe die zwei Tests oben) — nie, dass die Fläche überhaupt einen
     * Dunkelwert besitzt. Diese Zusicherung schließt genau die Lücke.
     *
     * Der Variablenname wird aus der `background`-Deklaration von
     * `.umschalterPanel` GELESEN, nicht als String verabredet: eine Umbenennung
     * der Variable soll den Test nicht stillschweigend am eigentlichen
     * Konsumenten vorbeiprüfen lassen.
     */
    const alle = cssRegeln(OHNE_KOMMENTARE);
    const panelMitFlaeche = alle.find(
      (r) => zieltAufKlasse(r.selektor, "umschalterPanel") && /background:/.test(r.deklarationen),
    );
    expect(panelMitFlaeche, "Regel .umschalterPanel mit `background` fehlt").toBeDefined();

    const variable = /background:\s*var\((--[a-z0-9-]+)\)/.exec(panelMitFlaeche!.deklarationen);
    expect(variable, "`background` von .umschalterPanel ist keine CSS-Variable").not.toBeNull();
    const name = variable![1];

    const deklariertDiese = (regel: CssRegel) =>
      new RegExp(`(?:^|;)\\s*${name}\\s*:`).test(regel.deklarationen);

    const hellwert = alle.some((r) => deklariertDiese(r) && !r.selektor.includes('[data-theme="dark"]'));
    expect(hellwert, `${name} hat keinen Hellwert außerhalb von [data-theme="dark"]`).toBe(true);

    const dunkelwert = alle.some((r) => deklariertDiese(r) && r.selektor.includes('[data-theme="dark"]'));
    expect(dunkelwert, `${name} hat keinen Wert unter [data-theme="dark"]`).toBe(true);
  });

  it("hebt den aktiven App-Eintrag im Umschalter-Panel hervor", () => {
    // Eigene Klasse statt `.navLink[aria-current]` (Begründung in
    // AppUmschalter.tsx): die Unterstreichung von `.navLink[aria-current]`
    // gehört der Modulnavigation, nicht dem Umschalter.
    const regel = /\.appEintrag\[aria-current\]\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(regel, "Regel `.appEintrag[aria-current]` fehlt").not.toBeNull();
    expect(regel![1]).toMatch(/font-weight:\s*600/);
  });

  it("versteckt die Seitenleiste unterhalb von 768px", () => {
    // Die Leiste darf mobil nicht bloß schmal werden, sie darf gar nicht da
    // sein — die Navigation liegt dort im Drawer (`SuiteNav.tsx`).
    const basis = /\.sider\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(basis, "Klasse .sider fehlt").not.toBeNull();
    expect(basis![1]).toMatch(/display:\s*none/);
  });

  it("klebt die Seitenleiste ab 768px unter der Kopfzeile fest", () => {
    /*
     * `inset-block-start` muss dieselbe Variable wie `--iuk-kopf` tragen —
     * weicht sie ab, klebt die Leiste unter oder über der Kopfzeile, und
     * `build` sieht das nicht (nur ein echter Browser wertet die Media Query
     * aus). Die Zahl selbst (69px, aus `headerHeight` + Streifenhoehe) prueft
     * der Test „rechnet --iuk-kopf aus headerHeight UND Streifenhoehe" unten.
     *
     * NICHT die erste `(min-width: 768px)`-Fundstelle im Dokument nehmen (wie
     * beim `.nurMobil`-Test oben): DIE Basisregel `.sider { display: none }`
     * steht selbst HINTER der ersten Media Query (`.rechts .nurMobil` &
     * Co.) — eine Suche ab der ersten Fundstelle schnitte die Basisregel
     * nicht ab und der folgende `.sider`-Treffer wäre der FALSCHE (`display:
     * none` statt `display: block`). Deshalb: die Media Query wird erst AB
     * der Position der `.sider`-Basisregel gesucht.
     */
    const basisIndex = OHNE_KOMMENTARE.indexOf(".sider {");
    expect(basisIndex, "Basisregel .sider fehlt").toBeGreaterThanOrEqual(0);
    const mediaIndex = OHNE_KOMMENTARE.indexOf("(min-width: 768px)", basisIndex);
    expect(mediaIndex, "Media Query für .sider fehlt").toBeGreaterThanOrEqual(0);
    const abBreakpoint = OHNE_KOMMENTARE.slice(mediaIndex);
    const regel = /\.sider\s*\{([^}]*)\}/.exec(abBreakpoint);
    expect(regel, ".sider wird ab 768px nicht sichtbar gemacht").not.toBeNull();
    expect(regel![1]).toMatch(/display:\s*block/);
    expect(regel![1]).toMatch(/position:\s*sticky/);
    expect(regel![1]).toMatch(/inset-block-start:\s*var\(--iuk-kopf\)/);
  });

  it("rechnet `--iuk-kopf` aus headerHeight UND Streifenhoehe", async () => {
    /*
     * DIE LEISTE KLEBTE AN DER FALSCHEN KANTE, und beides war falsch.
     *
     * Sie stand auf `inset-block-start: 64px` — dem Wert von
     * `Layout.headerHeight`. Ueber der Kopfzeile steht aber zusaetzlich der
     * 5px hohe Markenstreifen, und die Kopfzeile war ueberhaupt nicht
     * klebend: beim Scrollen wanderte sie weg und ueber der Leiste stand ein
     * 64px hohes Loch.
     *
     * Seit 2026-08-13 klebt der ganze Kopfblock (Streifen + Kopfzeile) und die
     * Leiste darunter bei 69px. Die Zahl faellt aus zwei Groeszen, die es
     * schon gibt — und genau die Situation „eine dritte Zahl laeuft still
     * daneben" ist der Befund, den dieser Test verriegelt.
     *
     * CSS kann die TypeScript-Konstante nicht lesen, dieser Test schon: er
     * liest `headerHeight` aus `buildTheme` und die Streifenhoehe aus dem CSS
     * und haelt die Summe gegen `--iuk-kopf`.
     */
    const { buildTheme } = await import("@/core/theme/theme");
    const headerHeight = buildTheme("light").components?.Layout?.headerHeight;
    expect(typeof headerHeight, "Layout.headerHeight fehlt in buildTheme").toBe("number");

    const streifen = /\.streifen\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(streifen, "Klasse .streifen fehlt").not.toBeNull();
    const streifenHoehe = /height:\s*(\d+)px/.exec(streifen![1]);
    expect(streifenHoehe, ".streifen hat keine Hoehe in px").not.toBeNull();

    const kopf = /--iuk-kopf:\s*(\d+)px/.exec(OHNE_KOMMENTARE);
    expect(kopf, "Variable --iuk-kopf fehlt").not.toBeNull();
    expect(Number(kopf![1])).toBe(Number(headerHeight) + Number(streifenHoehe![1]));
  });

  it("laeszt den Kopfblock kleben, nicht nur die Leiste", () => {
    /*
     * Ohne das ist `--iuk-kopf` eine richtige Zahl fuer eine falsche Annahme:
     * die Leiste klebt bei 69px unter einer Kopfzeile, die weggescrollt ist.
     *
     * Der Streifen klebt NICHT selbst, er sitzt im selben klebenden Block —
     * zwei unabhaengig klebende Elemente waeren zwei Zahlen statt einer.
     *
     * `z-index` ist noetig, weil ein klebender Knoten ohne ihn von spaeterem
     * Inhalt ueberzeichnet wird. Er erzeugt zugleich einen Stapelkontext, in
     * dem `.umschalterFang` (900) und `.umschalterPanel` (901) liegen — beide
     * bleiben damit ueber dem Seiteninhalt (auto = 0), und antds Drawer (1000,
     * ins `body` portalisiert) bleibt darueber. Wer diese Zahl senkt, prueft
     * alle drei.
     */
    const regel = /\.kopfBlock\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(regel, "Klasse .kopfBlock fehlt").not.toBeNull();
    expect(regel![1]).toMatch(/position:\s*sticky/);
    expect(regel![1]).toMatch(/inset-block-start:\s*0/);
    expect(regel![1]).toMatch(/z-index:\s*\d+/);
  });

  it("verwirft eine spaetere `.sider`-Ueberschreibung trotz gruenem Ersttreffer", () => {
    const mutation = `${OHNE_KOMMENTARE}
      .sider {
        display: none;
        inset-block-start: 0;
      }
    `;

    // Genau der naive Ersttreffer: er bleibt gruen und sieht die spaetere
    // Kaskaden-Ueberschreibung nicht.
    const ersterTreffer = /\.sider\s*\{([^}]*)\}/.exec(mutation);
    expect(ersterTreffer, "Basisregel .sider fehlt").not.toBeNull();
    expect(ersterTreffer![1]).toMatch(/display:\s*none/);

    expect(() => erwartetRobusteSiderUmschaltung(mutation)).toThrow();
  });

  it("verwirft `.sider` als erstes Kind einer spaeteren Media Query", () => {
    const mutation = `${OHNE_KOMMENTARE}
      @media (min-width: 768px) {
        .sider {
          display: none;
        }
      }
    `;
    expect(() => erwartetRobusteSiderUmschaltung(mutation)).toThrow();
  });

  it("ignoriert Kommentare und aehnlich benannte Klassen bei .sider", () => {
    const nurNamen = `${CSS}
      /* .sider { display: none; } */
      .siderleiste { display: none; }
      .nicht-sider { display: none; }
    `;
    expect(() => erwartetRobusteSiderUmschaltung(nurNamen)).not.toThrow();
  });

  it("kennt die Klasse .navAbschnitt", () => {
    const regel = /\.navAbschnitt\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(regel, "Klasse .navAbschnitt fehlt").not.toBeNull();
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
    //
    // WAS DIESER SCAN BESITZT UND WAS NICHT.
    //
    // Er besitzt: die Regel steht im Stylesheet, sie traegt `--iuk-marke` statt
    // eines Literals, und `.kopf` hat keine Kante bekommen. Das ist der
    // Spezifitaetsstreit, und den entscheidet der Quelltext.
    //
    // Er besitzt NICHT, dass der Streifen ueberhaupt gerendert wird.
    // Verschwaende jemand das `<div className={s.streifen}>` aus
    // `SuiteHeader.tsx` und liesze die Klasse hier stehen, bliebe dieser Scan
    // gruen — er liest nur das Stylesheet und sieht das Markup nicht. Diese
    // Haelfte besitzt `e2e/shell-mobil.spec.ts` (Task 10), das die gerenderte
    // Hoehe und Farbe im Browser misst.
    expect(OHNE_KOMMENTARE).toMatch(/\.streifen\s*\{[^}]*background:\s*var\(--iuk-marke\)/);
    expect(OHNE_KOMMENTARE).toMatch(/\.streifen\s*\{[^}]*height:\s*5px/);
    expect(OHNE_KOMMENTARE).not.toMatch(/\.kopf\s*\{[^}]*border-block-start/);
  });

  it("faerbt den Drawer-Gruppentitel ueber die Suite-Variable statt ueber opacity", () => {
    // `opacity: 0.6` dimmt auch den Kontrast des Hintergrunds mit und ist als
    // Farbaussage nicht pruefbar. Eine Variable ist es.
    const regel = OHNE_KOMMENTARE.match(/\.drawerTitel\s*\{([^}]*)\}/);
    expect(regel, ".drawerTitel fehlt").not.toBeNull();
    expect(regel![1]!).toMatch(/color:\s*var\(--iuk-gedaempft\)/);
    expect(regel![1]!, "opacity als Farbersatz ist raus").not.toMatch(/opacity/);
  });

  it("färbt die Abschnittsüberschrift der Modulnavigation ebenso über die Suite-Variable", () => {
    // Dieselbe Rolle wie `.drawerTitel` (gedämpfte Gruppenüberschrift), also
    // dieselbe Lösung statt eines eigenen `opacity`-Werts — Begründung siehe
    // Test oben.
    const regel = OHNE_KOMMENTARE.match(/\.navAbschnitt\s*\{([^}]*)\}/);
    expect(regel, ".navAbschnitt fehlt").not.toBeNull();
    expect(regel![1]!).toMatch(/color:\s*var\(--iuk-gedaempft\)/);
    expect(regel![1]!, "opacity als Farbersatz ist raus").not.toMatch(/opacity/);
  });

  it("markiert den aktiven Navigationseintrag in Markenrot UND mit Gewicht", () => {
    // BEDEUTUNG NIE ALLEIN UEBER FARBE. `font-weight: 600` stand hier schon und
    // BLEIBT — wer die Farbe fuer ausreichend haelt und das Gewicht entfernt,
    // nimmt rot-gruen-blinden Nutzern und Graustufendruck die Markierung ganz.
    //
    // WAS DIESER SCAN BESITZT UND WAS NICHT.
    //
    // Er besitzt: die Regel steht im Stylesheet, sie traegt `--iuk-marke` fuer
    // beides (Unterkante und Schrift) statt eines Literals, und `font-weight: 600`
    // bleibt. Das ist der Quelltext-Scan.
    //
    // Er besitzt NICHT, dass die Regel im Browser gegen antds Stylesheet gewinnt.
    // Wenn antd morgen eine spezifischere Regel fuer `.modulnav` mitbringt, bliebe
    // dieser Scan gruen — er liest nur das Stylesheet und sieht die Kaskade nicht.
    // Diese Haelfte besitzt `e2e/shell-mobil.spec.ts` (Task 10), das Farbe und
    // Gewicht am gerenderten Element in zwei Viewports und zwei Modi misst.
    const regel = OHNE_KOMMENTARE.match(/\.navLink\[aria-current\]\s*\{([^}]*)\}/);
    expect(regel, ".navLink[aria-current] fehlt").not.toBeNull();
    expect(regel![1]!).toMatch(/border-block-end-color:\s*var\(--iuk-marke\)/);
    expect(regel![1]!).toMatch(/color:\s*var\(--iuk-marke\)/);
    expect(regel![1]!, "das Gewicht ist die farbfreie Haelfte der Markierung")
      .toMatch(/font-weight:\s*600/);
  });
});
