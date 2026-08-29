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

  it("haengt das mobile Panel an den Kopfblock, nicht an den Ausloeser", () => {
    /*
     * DER GEMELDETE DEFEKT, als Regel festgehalten.
     *
     * `.umschalter` trug `position: relative` und war damit der enthaltende
     * Block des Panels. `inset-inline: 0` daran spannt nicht den Bildschirm
     * auf, sondern DEN AUSLOESER — am Telefon gemessen ~124px statt 390px. Die
     * Zusage im Test darueber („spannt das Panel mobil ueber die volle
     * Breite") war deshalb wahr ueber den Regeltext und falsch ueber das
     * Ergebnis: die Deklaration stand da und meinte den falschen Kasten.
     *
     * Ohne `position` faellt der enthaltende Block auf `.kopfBlock` zurueck
     * (`sticky` zaehlt als positioniert) — Bildschirmbreite, und
     * `calc(100% + 8px)` misst dort Streifen plus Kopfzeile.
     *
     * WAS DIESER TEST BESITZT: die Deklaration ist weg bzw. steht ab 768px
     * wieder da. WAS ER NICHT BESITZT: dass zwischen `.kopfBlock` und
     * `.umschalter` kein DRITTER Knoten positioniert ist — `.ant-layout-header`
     * traegt heute kein `position`, aber das steht in antds Stylesheet und in
     * keiner Datei dieses Repos. Diese Haelfte besitzt `e2e/shell-mobil.spec.ts`
     * („das offene Panel fuellt die Bildschirmbreite").
     */
    const vorkommen = [...OHNE_KOMMENTARE.matchAll(/(?:^|[^A-Za-z0-9_-])\.umschalter\s*\{([^}]*)\}/g)];
    expect(vorkommen.length, "Klasse .umschalter fehlt").toBeGreaterThanOrEqual(2);
    expect(
      vorkommen[0][1],
      "`position` in der Basisregel macht den Ausloeser zum enthaltenden Block",
    ).not.toMatch(/(?:^|;)\s*position\s*:/);

    // Ab 768px genau umgekehrt: das Popover haengt am Ausloeser. Der letzte
    // 768px-Block ist der des Umschalters (der erste traegt `.nurMobil` & Co.).
    const mediaStart = OHNE_KOMMENTARE.lastIndexOf("@media (min-width: 768px)");
    const desktop = vorkommen.filter(
      (treffer) => treffer.index! > mediaStart && /position:\s*relative/.test(treffer[1]),
    );
    expect(desktop, "ab 768px fehlt `.umschalter { position: relative }`").toHaveLength(1);
  });

  it("laeszt das Umschalter-Panel nicht seitwaerts scrollen", () => {
    /*
     * `overflow-y: auto` allein genuegt NICHT, und der Grund ist eine stille
     * Umrechnung: steht `overflow-x` auf `visible` und `overflow-y` nicht, zieht
     * der Browser `overflow-x` auf `auto` hoch (CSS Overflow 3, §3). Das Panel
     * war deshalb waagerecht schiebbar, sobald irgendein Inhalt ueberstand —
     * genau die gemeldete Beobachtung („ich kann den App-Umschalter nach links
     * und rechts bewegen").
     *
     * Ein Quelltext-Scan ist hier die richtige Ebene: jsdom rechnet keine
     * Scrollbereiche, und die Umrechnung passiert im Browser ohne dass eine
     * Regel dafuer irgendwo stuende.
     */
    const vorkommen = [...OHNE_KOMMENTARE.matchAll(/\.umschalterPanel\s*\{([^}]*)\}/g)];
    expect(vorkommen.length, "Klasse .umschalterPanel fehlt").toBeGreaterThanOrEqual(2);
    expect(vorkommen[0][1], "`overflow-x: visible` wird neben `overflow-y` zu `auto`").toMatch(
      /overflow-x:\s*hidden/,
    );
  });

  it("laeszt den Text eines App-Eintrags nachgeben statt das Panel aufzuschieben", () => {
    /*
     * Die zweite Haelfte des seitwaerts scrollenden Panels: ein Flex-Kind steht
     * auf `min-inline-size: auto` und schrumpft NICHT unter seinen Inhalt
     * (CSS Flexbox 1, §4.5). Ein langer Dienstname schob das Panel damit breiter
     * als den Bildschirm — `overflow-x: hidden` (Test darueber) verbaende das
     * nur, statt es zu beheben: der Text waere abgeschnitten und unerreichbar.
     *
     * Die Klasse muss im Markup ankommen; das prueft `AppUmschalter.test.tsx`.
     */
    const regel = /\.appEintragTexte\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(regel, "Klasse .appEintragTexte fehlt").not.toBeNull();
    expect(regel![1]).toMatch(/min-inline-size:\s*0/);
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

  it("markiert den aktiven Eintrag mit linkem Akzent statt Unterstrich", () => {
    /*
     * `border-block-end` war das richtige Zeichen für eine WAAGERECHTE Leiste.
     * In der Seitenleiste zog derselbe Selektor einen roten Strich UNTER dem
     * aktiven Eintrag über die volle Leistenbreite — er las sich als
     * Trennlinie zwischen zwei Gruppen, nicht als Auswahl. Im gemeldeten
     * Screenshot stand er unter „Übersicht" und direkt über der Überschrift
     * „Bestand", was die Fehldeutung noch verstärkte.
     *
     * `--iuk-marke` und nicht `--ant-color-primary`: eigenes Markup sieht antds
     * Variablen nicht (Falle 2), die Markierung verlöre ihren Farbkanal.
     *
     * `font-weight: 600` BLEIBT und ist nicht redundant: es ist der Träger,
     * der übrig bleibt, wenn der Farbkanal ausfällt — technisch (unaufgelöste
     * Variable) wie beim Leser (Rot-Grün-Blindheit, Graustufen). Bedeutung nie
     * allein über Farbe.
     *
     * DREI KANÄLE, NICHT VIER — die Textfarbe fehlt hier ABSICHTLICH, und das
     * ist die Umkehr eines früheren Nachtrags (Fließtext am Ende dieser Datei).
     * `color: var(--iuk-marke)` war belegt, solange der aktive Eintrag nackt
     * auf `lightSiderBg` (`#141414`) saß. Dieselbe Aufgabe 4, die den linken
     * Akzent brachte, legte darunter aber `--iuk-flaeche-aktiv` — und die
     * getönte Fläche verschiebt den Nenner: komponiert `#2c2c2c`, gegen
     * `#e45a66` nur noch 3.96:1 (im Drawer 3.48:1), beides unter 4.5:1. Die
     * Textfarbe ist deshalb im Schlussreview gestrichen worden. Eine
     * Zusicherung auf sie wäre jetzt nicht bloß überflüssig, sondern hielte
     * eine Kontrastregression fest.
     */
    const regel = /\.navLink\[aria-current\]\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(regel, "Regel `.navLink[aria-current]` fehlt").not.toBeNull();
    expect(regel![1], "waagerechtes Aktiv-Idiom in einer senkrechten Liste").not.toMatch(
      /border-block-end/,
    );
    expect(regel![1]).toMatch(/border-inline-start-color:\s*var\(--iuk-marke\)/);
    expect(regel![1]).toMatch(/background:\s*var\(--iuk-flaeche-aktiv\)/);
    expect(regel![1]).toMatch(/font-weight:\s*600/);
    // `(?:^|;)\s*color:` und NICHT das bloße `/color:/` — sonst matcht das
    // Muster schon in `border-inline-start-color:` (das Wort endet auch auf
    // "color:") und die Zusicherung wäre schon durch die Akzentfarbe erfüllt,
    // also nie rot. Dieselbe Verankerung wie in `deklarationsWerte` oben in
    // dieser Datei — hier trägt sie die UMGEKEHRTE Richtung: keine eigene
    // `color`-Deklaration mehr, damit die Markenfarbe nicht auf die getönte
    // Fläche zurückkehrt (Begründung im Block über diesem Test).
    expect(regel![1], "Markenfarbe zurück auf der getönten Fläche — 3.96:1").not.toMatch(
      /(?:^|;)\s*color:/,
    );
  });

  it("haelt den Ruhezustand auf demselben linken Rand wie den aktiven", () => {
    // Ohne den transparenten Rahmen springt die Beschriftung beim Wechsel der
    // aktiven Zeile um 3px zur Seite.
    const regel = /\.navLink\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(regel, "Klasse .navLink fehlt").not.toBeNull();
    expect(regel![1]).toMatch(/border-inline-start:\s*3px solid transparent/);
  });

  it("gibt der Leiste eine dichtere Zeile als dem Drawer", () => {
    /*
     * `.navLink` bleibt in seiner Basis auf 56px — das ist der Drawer, und dort
     * ist es ein Finger (`TAP` in core/theme/tokens.ts, Einsatzanforderung).
     * Die Leiste existiert unterhalb von 768px gar nicht und wird mit Maus
     * bedient; 40px ist antds eigenes Maß.
     *
     * `.modulleiste .navLink` ist (0,2,0). Die Verschachtelung ist NICHT
     * Ballast: `.navLink` allein wäre (0,1,0) und stünde gleichauf mit der
     * Basisregel — bei Gleichstand entschiede die Reihenfolge. Sie ist auch
     * kein Spezifitätsstreit mit antd: `<a>` aus `next/link` trägt keine
     * antd-Klasse. Wer sie entfernt, macht aus einer Regel eine Wette.
     */
    const regel = /\.modulleiste\s+\.navLink\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(regel, "Regel `.modulleiste .navLink` fehlt").not.toBeNull();
    expect(regel![1]).toMatch(/min-height:\s*40px/);

    const basis = /\.navLink\s*\{([^}]*)\}/.exec(OHNE_KOMMENTARE);
    expect(basis![1], "der Drawer braucht das Tap-Masz").toMatch(/min-height:\s*56px/);
  });

  it("laesst `.rechts` NICHT unter seine Inhaltsbreite schrumpfen", () => {
    /*
     * DIE UMKEHRUNG EINER ZUSICHERUNG: hier darf `min-width` NICHT stehen.
     *
     * `.rechts` trug `min-width: 0` und schrumpfte damit unter die Breite
     * seines Inhalts. Der Anmelden-Knopf tat das nicht mit: er stand bei einem
     * 320px-Fenster mit seiner rechten Kante bei 330px, die Seite scrollte
     * seitwaerts — und Zoom ist suiteweit gesperrt, also unheilbar (gemessen
     * 2026-08-29, Begruendung an der Regel selbst).
     *
     * Nachgeben soll der Titel, der eine Ellipse dafuer hat. Genau deshalb
     * traegt `.titel` sein `min-width: 0` weiterhin — beide Haelften stehen
     * hier zusammen, sonst wandert die Deklaration bei der naechsten
     * Aufraeumrunde an die falsche Stelle zurueck.
     *
     * Wirken kann das nur im Browser: `e2e/shell-mobil.spec.ts` misst 320px.
     */
    const rechts = cssRegeln(OHNE_KOMMENTARE).filter(
      (regel) => regel.selektor.trim() === ".rechts",
    );
    expect(rechts.length, "Basisregel .rechts fehlt").toBe(1);
    expect(
      deklarationsWerte(rechts, "min-width"),
      ".rechts darf nicht unter seine Inhaltsbreite schrumpfen — sonst laeuft der Anmelden-Knopf bei 320px aus dem Fenster",
    ).toEqual([]);
    expect(deklarationsWerte(rechts, "flex")).toEqual(["0 1 auto"]);

    const titel = cssRegeln(OHNE_KOMMENTARE).filter((regel) => regel.selektor.trim() === ".titel");
    expect(titel.length, "Basisregel .titel fehlt").toBe(1);
    expect(
      deklarationsWerte(titel, "min-width"),
      "nachgeben soll der Titel — er braucht sein min-width: 0",
    ).toEqual(["0"]);
  });

  it("setzt die Leiste mit einer Kante vom Inhalt ab", () => {
    // Ohne sie steht die Leiste ohne erkennbaren Grund neben dem Inhalt —
    // die zweite Hälfte von „passt nicht hinein". `--iuk-linie` gibt es
    // global mit Dunkelzweig; `--ant-*` sähe eigenes Markup nicht (Falle 2).
    const { desktop } = erwartetRobusteSiderUmschaltung(OHNE_KOMMENTARE);
    expect(desktop.deklarationen).toMatch(/border-inline-end:\s*1px solid var\(--iuk-linie\)/);
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

  /*
   * DIESER TEST STAND HIER FRÜHER ALS „markiert den aktiven Navigationseintrag
   * in Markenrot UND mit Gewicht" und prüfte `border-block-end-color` — genau
   * das waagerechte Idiom, das Aufgabe 4 durch den linken Akzent ersetzt
   * (`.navLink[aria-current]` weiter oben in dieser Datei). Die Aufgabe 4
   * zugeschriebene Notiz „hier ist nichts mehr zu entfernen" galt nur den
   * `.modulnav`-Tests aus Aufgabe 2 — dieser Test zielte auf `.navLink`, nicht
   * auf `.modulnav`, und blieb deshalb stehen, obwohl er dieselbe Regel wie
   * der neue Test „markiert den aktiven Eintrag mit linkem Akzent statt
   * Unterstrich" prüft, nur mit dem alten, jetzt falschen Erwartungswert. Ein
   * Beibehalten hätte den Testlauf nach Schritt 3 dauerhaft rot gehalten:
   * keine CSS-Regel kann gleichzeitig `border-block-end-color` UND
   * `border-inline-start-color` als Aktivmarkierung tragen.
   *
   * ENTFERNT STATT ANGEPASST — UND DAS WAR ZUNÄCHST UNVOLLSTÄNDIG (Review-Fund
   * Aufgabe 4). Der neue Test prüfte anfangs nur drei Kanäle (Akzentfarbe,
   * Fläche, Gewicht) und ließ genau die Zusicherung fallen, die dieser alte
   * Test zusätzlich trug: `color: var(--iuk-marke)` auf
   * `.navLink[aria-current]`. Die Textfarbe galt als Träger der WCAG-Rechnung
   * in `globals.css`, und der Nachtrag zog sie auf VIER Kanäle hoch.
   *
   * DIESER NACHTRAG IST IM SCHLUSSREVIEW WIEDER ZURÜCKGENOMMEN WORDEN, und
   * zwar aus demselben Grund, aus dem er kam: der Kontrastrechnung. Er hatte
   * eine Voraussetzung übersehen, die dieselbe Aufgabe 4 mitgebracht hatte —
   * `background: var(--iuk-flaeche-aktiv)` unter demselben Text. Die
   * `globals.css`-Zahl 5.22:1 gilt für `#e45a66` auf dem NACKTEN `#141414`;
   * mit der Tönung komponiert die Fläche zu `#2c2c2c` und die Zahl fällt auf
   * 3.96:1 (im Drawer, `colorBgElevated` `#1f1f1f`, auf 3.48:1). Die
   * Zusicherung hat also nicht die Kontrastzahl bewacht, sondern eine
   * Regression eingefroren — deshalb steht dort jetzt die Umkehrung: `color`
   * darf NICHT wieder auftauchen. Was bewacht wird, sind die verbleibenden
   * Träger. Das Gewicht bleibt, nicht weil es redundant zur Farbe wäre,
   * sondern weil es der Träger ist, der übrig bleibt, wenn der Farbkanal
   * ausfällt — technisch (unaufgelöste Variable) wie beim Leser
   * (Rot-Grün-Blindheit, Graustufen). Nach dem Streichen der Textfarbe ist es
   * der Träger, der überhaupt bleibt.
   */
});
