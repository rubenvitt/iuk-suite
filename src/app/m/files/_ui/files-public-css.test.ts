import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * DER QUELLTEXT-SCAN UEBER DAS CSS DER OEFFENTLICHEN ANSICHTEN.
 *
 * Was dieser Test besitzt und was er NICHT besitzt: jsdom wertet Media Queries
 * nicht aus. Ein Vitest, der „bei 390px ist der Knopf voll breit" behauptet und
 * dafuer im DOM sucht, geht IMMER durch — er misst nichts
 * (`docs/design/README.md:199-206`). Dieser Scan besitzt deshalb genau eine
 * Aussage: „die Regel traegt die richtige Medienabfrage". Ob sie WIRKT, weiss
 * nur ein Browser — das besitzt `e2e/files-mobil.spec.ts` (T48) bei 390, 1280
 * und dazwischen.
 *
 * ZUSTAENDIGKEIT (Plan §1 Festlegung C, disjunkte Globs): dieser Scan besitzt
 * `_ui/files-public.css` PLUS jede `*.module.css` des Moduls. Genau
 * `_ui/files.css` besitzt der Scan aus T18 (`files-css.test.ts`). Zusammen ist
 * damit jede CSS-Datei des Moduls erfasst; ohne die Aufteilung waere es
 * entweder eine Doppelpruefung oder eine Luecke.
 *
 * WARUM EIN TEIL DER REGELN BEDINGT IST: der `*.module.css`-Glob trifft heute
 * nichts (die ersten dieser Dateien entstehen in Welle 6). Eine unbedingte
 * Forderung „jede Datei behandelt `prefers-reduced-motion`" wuerde einem
 * spaeteren Task eine rote Zusage in eine Datei legen, die gar keine Bewegung
 * enthaelt. Bedingte Regeln („WENN die Datei Bewegung erklaert, DANN …") sind
 * dagegen dort scharf, wo sie etwas bedeuten. Der Preis der Bedingung ist, dass
 * sie feuern MUSS: `files-public.css` loest jede der drei bedingten Regeln aus,
 * damit keine davon eine gruene Behauptung ueber nichts ist.
 */

const MODUL = join("src", "app", "m", "files");
const OEFFENTLICH = join(MODUL, "_ui", "files-public.css");

/**
 * Beide Globs kommen aus DERSELBEN Konstante `MODUL` — waere der Pfad hier
 * getippt und dort abgeleitet, koennte einer der beiden ins Leere greifen, ohne
 * dass es auffaellt.
 */
function modulCssDateien(): string[] {
  return readdirSync(MODUL, { recursive: true, encoding: "utf8" })
    .filter((pfad) => pfad.endsWith(".module.css"))
    .map((pfad) => join(MODUL, pfad))
    .sort();
}

const geprueftePfade = (): string[] => [OEFFENTLICH, ...modulCssDateien()];

const ohneKommentare = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

type Regel = { selektor: string; body: string };

/**
 * Zerlegt ein Stylesheet in seine EINZELNEN Regeln. `[^{}]` schliesst geklammerte
 * Bereiche aus, deshalb faellt der Vorspann einer `@media`-Abfrage automatisch
 * heraus und die Regeln DARIN kommen einzeln heraus — genau das, was die
 * Deklarationspruefungen unten brauchen (eine Suche ueber die ganze Datei fande
 * bei `.fp-knopf` sonst die Basisregel statt der Regel im Medienblock).
 */
const regeln = (css: string): Regel[] =>
  [...ohneKommentare(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selektor: m[1].trim(),
    body: m[2],
  }));

/** Der Inhalt jedes `@media (max-width: 767.98px)`-Blocks — erkennbar an der Einrueckung. */
const mobilBloecke = (css: string): string[] =>
  [...ohneKommentare(css).matchAll(/@media \(max-width: 767\.98px\) \{([\s\S]*?)\n\}/g)].map(
    (m) => m[1],
  );

// Feldschrift: `rem` mitlesen, sonst laesst `font-size: 0.9rem` (14,4px) die Regel passieren.
const inPixel = (wert: string, einheit: string): number =>
  einheit === "rem" ? Number(wert) * 16 : Number(wert);

const FELD_SELEKTOR = /\binput\b|\btextarea\b|\bselect\b|\.fp-feld\b/;

/**
 * BEIDE Schreibweisen der Schriftgroesse, und die zweite ist keine Kuer: liest
 * man nur `font-size`, geht `font: 14px/1.5 sans-serif` unbehauptet durch
 * (nachgemessen mit einer Probedatei — 13/13 gruen). Heute maskiert der
 * Feuer-Guard `geprueft > 0` die Luecke; ab der zweiten Feldregel (Welle 6)
 * steht sie offen, und Zoom ist suiteweit gesperrt — ein 14px-Feld kann dann
 * niemand mehr heranholen.
 *
 * GRENZE, bewusst und nicht vergessen: nur `px` und `rem`. `em`, `%` und `pt`
 * haengen an einem Elternwert, den ein Quelltext-Scan nicht kennt — sie fallen
 * hier durch, statt eine Zahl zu behaupten, die niemand nachgerechnet hat.
 */
const SCHRIFTGROESSE_MUSTER = [
  /font-size:\s*([\d.]+)(px|rem)/g,
  /(?:^|[\s;])font:\s*(?:[^;]*?\s)?([\d.]+)(px|rem)/g,
];

/**
 * Erkennt, ob ein Variablenwert eine FARBE ist. Steht hier, weil die
 * Hell/Dunkel-Paarpruefung ihn braucht und eine Namensliste dort schon einmal
 * daneben lag (siehe dort).
 */
const IST_FARBE = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\(/i;

/**
 * WCAG-2.1-Relativluminanz (1.4.3) und Kontrastverhaeltnis, zehn Zeilen selbst
 * gerechnet statt geschaetzt: `docs/design/README.md:145` verlangt „Kontrast AA
 * belegt statt geschaetzt", und eine Zahl in einem Kommentar ist keine Zusage —
 * der naechste „schoenere" Farbtausch schreibt sie nicht mit.
 */
const luminanz = (hex: string): number => {
  // Nur die sechsstellige Form, und der Riegel ist kein Zierrat: `#abc` ergaebe
  // ueber `match(/../g)` zwei Kanaele und einen Rest, das Verhaeltnis waere `NaN`
  // und die Regel scheiterte mit einer Meldung, die auf die falsche Ursache
  // zeigt. Alle Werte dieser Datei sind sechsstellig; wer das aendert, soll hier
  // anstossen und nicht dort.
  expect(hex.trim(), "Kontrast rechnet nur mit sechsstelligem Hex").toMatch(/^#[0-9a-f]{6}$/i);
  const kanaele = hex
    .trim()
    .replace("#", "")
    .match(/../g)!
    .map((h) => parseInt(h, 16) / 255);
  const [r, g, b] = kanaele.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const kontrast = (a: string, b: string): number => {
  const [hoch, tief] = [luminanz(a), luminanz(b)].sort((x, y) => y - x);
  // Auf zwei Stellen gerundet, damit ein Paar bei exakt 4,50 nicht an einem
  // Gleitkomma-Rest scheitert.
  return Number(((hoch + 0.05) / (tief + 0.05)).toFixed(2));
};

/** Name → Wert aus einem `:root`-Block. */
const variablen = (rs: Regel[]): Map<string, string> =>
  new Map(
    rs.flatMap((r) =>
      [...r.body.matchAll(/(--fp-[a-z0-9-]+):\s*([^;]+);/g)].map(
        (m) => [m[1], m[2].trim()] as [string, string],
      ),
    ),
  );

describe("Scan-Voraussetzung — greift der Scan ueberhaupt zu?", () => {
  /**
   * Ein Scan ueber null Dateien ist gruen, ohne etwas zu belegen, und ein
   * Tippfehler im Pfad faellt dann nie auf. Deshalb steht diese Zusicherung VOR
   * allen Regeln.
   */
  it("liest eine nicht leere Dateimenge, die `_ui/files-public.css` enthaelt", () => {
    const pfade = geprueftePfade();
    console.info(
      `[files-public-css] ${pfade.length} CSS-Datei(en) geprueft: ${pfade.join(", ")} — ` +
        `davon ${modulCssDateien().length} per **/*.module.css`,
    );
    expect(pfade.length).toBeGreaterThan(0);
    expect(pfade).toContain(OEFFENTLICH);
    expect(existsSync(OEFFENTLICH)).toBe(true);
  });

  /**
   * DIE GLOB-PROBE. Der `*.module.css`-Glob trifft im Moment der Entstehung
   * dieses Tests NULL Dateien — ein Tippfehler darin waere fuer drei Wellen
   * unsichtbar, und die 767.98px-Zusage waere dann nicht belegt, sondern nur
   * nicht widerlegt. Die Probe belegt den Glob unabhaengig davon, wie viele
   * Modul-CSS-Dateien es gerade gibt.
   *
   * Sie liegt zwangsläufig UNTER `src/app/m/files/` (sonst traefe der Glob sie
   * nicht) und verschwindet deshalb im `finally` UND im `afterEach`. Zwei
   * Haertungen dazu, weil andere Agenten im selben Arbeitsbaum gleichzeitig
   * `pnpm vitest run` laufen lassen: der Name traegt die Prozess-ID (zwei
   * Laeufe koennen sich nicht ins Gehege kommen), und der Inhalt erfuellt alle
   * echten Regeln — ein liegen gebliebenes Exemplar waere dann kein
   * Fehlschlag ohne Anlass.
   */
  it("erfasst mit `**/*.module.css` eine Datei, die es unter dem Modul gibt", () => {
    const probe = join(MODUL, `__glob-probe.${process.pid}.module.css`);
    try {
      writeFileSync(probe, "/* Wegwerf-Probe des Globs, siehe files-public-css.test.ts */\n");
      expect(modulCssDateien()).toContain(probe);
    } finally {
      rmSync(probe, { force: true });
    }
  });

  afterEach(() => {
    const probe = join(MODUL, `__glob-probe.${process.pid}.module.css`);
    if (existsSync(probe)) rmSync(probe, { force: true });
  });
});

describe("Querschnittsregeln — fuer jede CSS-Datei der oeffentlichen Ansichten", () => {
  it("kennt in `max-width` genau 767.98px", () => {
    let abfragen = 0;
    for (const pfad of geprueftePfade()) {
      // BIS ZUR SCHLIESSENDEN KLAMMER erfasst und als TEXT verglichen, damit
      // Einheit, Zwischenraum und die nackte 768 in EINER Regel fallen. Ein
      // Muster, das nur `([\d.]+)px` liest, laesst zwei gaengige Schreibweisen
      // unbehauptet durch — nachgemessen mit einer Probedatei, beide gruen:
      // `@media (max-width : 600px)` (Zwischenraum vor dem Doppelpunkt) und
      // `@media (max-width: 37.5em)` (= 600px). Genau dafuer steht die
      // Glob-Probe oben; ohne diese Haertung waere die Zusage fuer kuenftige
      // `*.module.css` nur nicht widerlegt. `[^{]` kann keinen Regelrumpf
      // betreten, deshalb trifft das Muster weder `.fp-blatt { max-width }`
      // noch den Desktop-Block `@media (min-width: 768px)`.
      const werte = [
        ...ohneKommentare(readFileSync(pfad, "utf8")).matchAll(
          /@media[^{]*?max-width\s*:\s*([^)]+)\)/g,
        ),
      ].map((m) => m[1].trim());
      abfragen += werte.length;
      for (const wert of werte) {
        // 767.98px und nicht 768px: bei exakt 768px gelten sonst beide Seiten und
        // die Reihenfolge im Stylesheet entscheidet (`docs/design/README.md:193-197`).
        expect(wert, `${pfad}: max-width ${wert} ist nicht der Suite-Breakpoint`).toBe("767.98px");
      }
    }
    console.info(`[files-public-css] ${abfragen} max-width-Abfrage(n) geprueft`);
    expect(abfragen).toBeGreaterThan(0);
  });

  it("kommt ohne `!important` aus", () => {
    for (const pfad of geprueftePfade()) {
      expect(ohneKommentare(readFileSync(pfad, "utf8")), pfad).not.toMatch(/!\s*important/);
    }
  });

  it("selektiert den Dunkelmodus nie ueber `prefers-color-scheme`", () => {
    for (const pfad of geprueftePfade()) {
      // Bewusst auf `prefers-color-scheme` und nicht auf `prefers-`: die
      // erlaubte `prefers-reduced-motion`-Abfrage traegt dasselbe Praefix.
      expect(ohneKommentare(readFileSync(pfad, "utf8")), pfad).not.toMatch(
        /prefers-color-scheme/,
      );
    }
  });

  it("laesst Eingabefelder nie unter 16px fallen", () => {
    let geprueft = 0;
    for (const pfad of geprueftePfade()) {
      for (const regel of regeln(readFileSync(pfad, "utf8"))) {
        if (!FELD_SELEKTOR.test(regel.selektor)) continue;
        // `matchAll` und nicht `exec`: eine Regel kann die Schriftgroesse
        // mehrfach setzen, und die LETZTE gewinnt im Browser — ein `exec` sah
        // nur die erste.
        for (const muster of SCHRIFTGROESSE_MUSTER) {
          for (const treffer of regel.body.matchAll(muster)) {
            geprueft += 1;
            expect(
              inPixel(treffer[1], treffer[2]),
              `${pfad}: ${regel.selektor} setzt die Feldschrift auf ` +
                `${treffer[1]}${treffer[2]} — unter 16px`,
            ).toBeGreaterThanOrEqual(16);
          }
        }
      }
    }
    // Die Bedingung muss feuern, sonst ist die Regel eine gruene Behauptung
    // ueber nichts (Zoom ist suiteweit gesperrt — `app/layout.tsx`,
    // `core/theme/feldschrift.test.ts`).
    expect(geprueft, "kein einziges Eingabefeld mit Schriftgroesse gefunden").toBeGreaterThan(0);
  });

  it("haelt den Fokus sichtbar: `outline` immer mit `outline-offset`, nie `none`", () => {
    let geprueft = 0;
    for (const pfad of geprueftePfade()) {
      const css = ohneKommentare(readFileSync(pfad, "utf8"));
      expect(css, `${pfad}: Fokus abgeschaltet`).not.toMatch(/outline:\s*(none|0)\b/);
      for (const regel of regeln(readFileSync(pfad, "utf8"))) {
        if (!/(^|[\s;])outline:/.test(regel.body)) continue;
        geprueft += 1;
        expect(
          regel.body,
          `${pfad}: ${regel.selektor} setzt outline ohne outline-offset`,
        ).toMatch(/outline-offset:/);
      }
    }
    expect(geprueft, "keine einzige outline-Regel gefunden").toBeGreaterThan(0);
  });

  it("behandelt `prefers-reduced-motion`, wo Bewegung erklaert wird", () => {
    let geprueft = 0;
    for (const pfad of geprueftePfade()) {
      const css = ohneKommentare(readFileSync(pfad, "utf8"));
      if (!/(transition|animation)[-\s]*:/.test(css)) continue;
      geprueft += 1;
      expect(css, `${pfad}: Bewegung ohne Ruecknahme`).toMatch(
        /@media\s*\(prefers-reduced-motion:\s*reduce\)/,
      );
    }
    expect(geprueft, "keine einzige Datei mit Bewegung gefunden").toBeGreaterThan(0);
  });
});

describe("`files-public.css` — die Zusagen der oeffentlichen Gestaltungsklasse", () => {
  const css = () => readFileSync(OEFFENTLICH, "utf8");

  /**
   * Ohne einen Dunkelzweig waere „kein `prefers-color-scheme`" eine leere
   * Zusage: eine Datei ohne jede Dunkelbehandlung erfuellt sie und ist im
   * Dunkelmodus trotzdem kaputt. Die Umschaltung haengt am Attribut, weil die
   * Suite einen Cookie-Umschalter hat (`docs/design/README.md:105-118`).
   */
  it("erklaert die `--fp-*`-Variablen auf `:root` UND unter `[data-theme=\"dark\"]`", () => {
    const hell = regeln(css()).filter((r) => /^:root(\s*,\s*:root\[data-theme="light"\])?$/.test(r.selektor));
    const dunkel = regeln(css()).filter((r) => r.selektor.includes('[data-theme="dark"]'));
    expect(hell.length, "kein :root-Block mit den Hellwerten").toBeGreaterThan(0);
    expect(dunkel.length, "kein [data-theme=dark]-Block").toBeGreaterThan(0);
    const hellVars = variablen(hell);
    const dunkelVars = variablen(dunkel);
    expect(hellVars.size).toBeGreaterThan(4);
    /*
     * Der WERT entscheidet, nicht eine Namensliste — und der Grund ist ein
     * gemessener Defekt: die vorige Fassung filterte auf
     * `-(grund|blatt|tinte|gedaempft|linie|tint|knopf)` und schloss damit
     * `--fp-ok` und `--fp-hinweis` still aus. Aus dem Dunkelblock geloescht
     * blieb die Suite 13/13 gruen, obwohl der Hellwert #1e7a3c auf dunklem
     * Blatt nur 3,11:1 erreicht. Eine Erlaubnisliste war die Ursache, also
     * behebt hier nur ihr Wegfall die Klasse des Fehlers, nicht den Fall.
     * Gegenrichtung mitgedacht: was hell KEINE Farbe ist (ein spaeterer Radius,
     * ein Abstand), braucht dunkel auch keine Entsprechung.
     */
    let gepaart = 0;
    for (const [name, wert] of hellVars) {
      if (!IST_FARBE.test(wert)) continue;
      gepaart += 1;
      expect(dunkelVars.has(name), `${name} fehlt im Dunkelmodus`).toBe(true);
    }
    expect(gepaart, "keine einzige Farbvariable im Hellblock erkannt").toBeGreaterThan(0);
  });

  /**
   * KONTRAST AA, GERECHNET STATT GESCHAETZT (`docs/design/README.md:145`).
   *
   * Welche Variablen TEXT tragen, ist eine Entscheidung und keine Ableitung —
   * deshalb steht sie hier als Liste. Bewusst NICHT dabei: `--fp-linie` und
   * `--fp-linie-stark` sind Haarlinien (Nicht-Text, 3:1 nach 1.4.11), `--fp-tint`
   * ist Flaeche, und die 3px-Fahne ist `aria-hidden` und traegt keine
   * Information. Sie in die Rechnung zu nehmen brachte sie nur zum Scheitern
   * und die Regel damit zum Verstummen.
   *
   * Dass diese Zusicherung ueberhaupt existiert, hat einen belegten Anlass:
   * `--fp-hinweis` stand zuerst auf `#b26a00` (dem `gelb` aus
   * `core/theme/tokens.ts`) und erreichte damit 4,06:1 auf `--fp-blatt` und
   * 3,76:1 auf `--fp-grund` — `.fp-zustand-wartet` erbt 13px in normalem
   * Gewicht, ist also kein „grosser Text" im Sinne von 1.4.3.
   */
  it("belegt AA (4,5:1) fuer jede Textfarbe auf jeder Flaeche — hell UND dunkel", () => {
    const TEXTFARBEN = [
      "--fp-tinte",
      "--fp-gedaempft",
      "--fp-ok",
      "--fp-hinweis",
      "--fp-wortzeichen",
    ];
    const FLAECHEN = ["--fp-grund", "--fp-blatt"];
    const bloeck = (treffer: (selektor: string) => boolean) =>
      variablen(regeln(css()).filter((r) => treffer(r.selektor)));
    const modi: [string, Map<string, string>][] = [
      ["hell", bloeck((s) => /^:root(\s*,\s*:root\[data-theme="light"\])?$/.test(s))],
      ["dunkel", bloeck((s) => s.includes('[data-theme="dark"]'))],
    ];

    let gerechnet = 0;
    for (const [modus, v] of modi) {
      for (const text of TEXTFARBEN) {
        const vordergrund = v.get(text);
        expect(vordergrund, `${modus}: ${text} ist nicht erklaert`).toBeDefined();
        for (const flaeche of FLAECHEN) {
          const hintergrund = v.get(flaeche);
          expect(hintergrund, `${modus}: ${flaeche} ist nicht erklaert`).toBeDefined();
          gerechnet += 1;
          expect(
            kontrast(vordergrund!, hintergrund!),
            `${modus}: ${text} (${vordergrund}) auf ${flaeche} (${hintergrund})`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
      // Der Knopf traegt Text auf EIGENER Flaeche, nicht auf Papier.
      const schrift = v.get("--fp-knopf-schrift");
      const grund = v.get("--fp-knopf-grund");
      expect(schrift, `${modus}: --fp-knopf-schrift ist nicht erklaert`).toBeDefined();
      expect(grund, `${modus}: --fp-knopf-grund ist nicht erklaert`).toBeDefined();
      gerechnet += 1;
      expect(
        kontrast(schrift!, grund!),
        `${modus}: Knopfschrift (${schrift}) auf Knopffarbe (${grund})`,
      ).toBeGreaterThanOrEqual(4.5);
    }
    console.info(`[files-public-css] ${gerechnet} Kontrastpaar(e) gerechnet`);
    // Feuer-Guard: waere eine Liste leer, waere die ganze Regel gruen ueber nichts.
    expect(gerechnet).toBe(2 * (TEXTFARBEN.length * FLAECHEN.length + 1));

    /*
     * VOLLSTAENDIGKEITS-RIEGEL. `TEXTFARBEN` ist eine Namensliste, und eine
     * Namensliste war der Defekt der Paarpruefung darueber. Hier ist sie
     * unvermeidbar — kein Variablenname sagt, ob er Text oder Flaeche traegt —,
     * also wird sie erzwungen statt gehofft: bringt Welle 6 ein
     * `--fp-fehler-text` und ruehrt niemand diese Liste an, deckt eine Regel mit
     * dem Titel „jede Textfarbe" sie stillschweigend nicht mehr ab. Wer eine
     * Farbe hinzufuegt, muss sie hier EINORDNEN.
     */
    const NICHT_TEXT = ["--fp-linie", "--fp-linie-stark", "--fp-tint", ...FLAECHEN];
    for (const [name, wert] of modi[0][1]) {
      if (!IST_FARBE.test(wert)) continue;
      // Die Knopffarben stehen oben in eigener Rechnung: Text auf EIGENER Flaeche.
      if (name.startsWith("--fp-knopf-")) continue;
      expect(
        [...TEXTFARBEN, ...NICHT_TEXT],
        `${name} ist weder als Text noch als Flaeche eingeordnet — die Regel ` +
          `behauptet dann nichts darueber`,
      ).toContain(name);
    }
  });

  /**
   * `min-height: 100%` waere hier wirkungslos — und still, wie Falle 5: die
   * Regel steht richtig da und greift nur nicht. Der Rahmen sitzt unter antds
   * `<App>` (`core/theme/AntdProvider.tsx`, die `<App>`-Huelle — keine
   * Zeilennummer hier, die ist schon einmal weggewandert), und das rendert ein
   * `<div class="ant-app">` (`antd/es/app/App.js`: `component = 'div'`) ohne
   * jede Hoehenangabe. Die Elternhoehe ist damit unbestimmt, und ein
   * Prozentwert faellt darauf zurueck, gar nichts zu tun; `html, body { height:
   * 100% }` aus `globals.css:13-15` reicht nur bis zu diesem Wrapper. Folge auf
   * einer kurzen oeffentlichen Seite: die Papierfarbe endet an der
   * Inhaltsunterkante, darunter steht die UA-Grundflaeche.
   *
   * `dvh` und nicht `svh`/`lvh`: `svh` laesst eine Luecke, sobald die
   * Browserleiste einfaehrt, `lvh` erzwingt beim Laden einen Scrollbalken. Ein
   * `calc(100dvh - 3px)` fuer die Fahne braucht es nicht — sie liegt INNERHALB
   * von `.fp-seite`.
   */
  it("gibt `.fp-seite` eine viewport-bezogene Mindesthoehe, keine Prozente", () => {
    const seite = regeln(css()).find((r) => r.selektor === ".fp-seite");
    expect(seite, ".fp-seite fehlt").toBeDefined();
    const treffer = /min-height:\s*([^;]+);/.exec(seite!.body);
    expect(treffer, ".fp-seite erklaert keine min-height").not.toBeNull();
    expect(
      treffer![1].trim(),
      "ein Prozentwert loest unter `.ant-app` ins Leere auf",
    ).toBe("100dvh");
  });

  /**
   * 44px und nicht `TAP` = 56: diese Ansicht wird auf einem FREMDEN Handy
   * benutzt, nicht an einem Kiosk mit Handschuhen. Dieselbe begruendete
   * Abweichung trifft der oeffentliche Abendzettel
   * (`docs/design/feedback-oeffentliche-ansicht.md` §3.5).
   */
  it("gibt Knopf und Feld mindestens 44px Trefferflaeche", () => {
    for (const klasse of [".fp-knopf", ".fp-feld"]) {
      const treffer = regeln(css()).filter(
        (r) => r.selektor.includes(klasse) && /min-height:\s*([\d.]+)px/.test(r.body),
      );
      expect(treffer.length, `${klasse} erklaert keine min-height`).toBeGreaterThan(0);
      for (const regel of regeln(css())) {
        if (!regel.selektor.includes(klasse)) continue;
        for (const m of regel.body.matchAll(/(?:min-)?height:\s*([\d.]+)px/g)) {
          expect(Number(m[1]), `${regel.selektor}: ${m[1]}px ist unter 44px`).toBeGreaterThanOrEqual(
            44,
          );
        }
      }
    }
  });

  /**
   * `docs/design/README.md:189-190`: „Handlungsknoepfe unter 768px sind volle
   * Breite und stehen untereinander, nie nebeneinander. Ein 630px breiter Knopf
   * liest sich als Flaeche, nicht als Ziel."
   */
  it("stapelt die Knopfzeile unterhalb des Suite-Breakpoints und gibt volle Breite", () => {
    const bloecke = mobilBloecke(css());
    expect(bloecke.length, "kein 767.98px-Block").toBeGreaterThan(0);
    const zeile = bloecke.find((b) => /\.fp-knopfzeile\s*\{/.test(b));
    expect(zeile, ".fp-knopfzeile fehlt in einem 767.98px-Block").toBeDefined();
    expect(zeile!).toMatch(/\.fp-knopfzeile\s*\{[^}]*flex-direction:\s*column/);
    const knopf = bloecke.find((b) => /\.fp-knopf\s*\{/.test(b));
    expect(knopf, ".fp-knopf fehlt in einem 767.98px-Block").toBeDefined();
    expect(knopf!).toMatch(/\.fp-knopf\s*\{[^}]*width:\s*100%/);
  });

  /**
   * Suite-Rot ist Marke, nie Statusfarbe und nie Datenflaeche
   * (`docs/design/README.md:126-131`). In der oeffentlichen Ansicht traegt es
   * genau die 3px-Fahne und das Wortzeichen — mehr waere eine Flaeche, die mit
   * einer Warnung verwechselt wird.
   */
  it("benutzt Suite-Rot nur an der Fahne und — ueber eine Variable — am Wortzeichen", () => {
    const traeger = regeln(css())
      .filter((r) => /#c8000f/i.test(r.body))
      .map((r) => r.selektor);
    // Die Fahne traegt das Rot DIREKT und soll im Dunkelmodus nicht aufhellen:
    // sie ist `aria-hidden`, 3px hoch und traegt keine Information — 1.4.11
    // greift auf sie nicht.
    expect(traeger.filter((s) => s === ".fp-fahne"), "die Fahne traegt kein #c8000f").toHaveLength(
      1,
    );
    /*
     * Sonst darf #c8000f nur in einem `:root`-Block stehen (als Hellwert von
     * `--fp-wortzeichen`), an keiner Klasse. Das Wortzeichen laeuft ueber eine
     * Variable, weil „I&K" TEXT ist: 13px in Gewicht 700 ist nach 1.4.3 KEIN
     * grosser Text (dafuer waeren 18,66px fett noetig), und #c8000f erreicht auf
     * dunklem `--fp-blatt` (#1b1e22) nur 2,76:1. Der Dunkelwert ist deshalb eine
     * aufgehellte Ableitung — siehe die Kontrastregel oben, die sie mitrechnet.
     */
    for (const s of traeger) {
      if (s === ".fp-fahne") continue;
      expect(s, `#c8000f steht an ${s} — erlaubt sind nur .fp-fahne und der :root-Block`).toMatch(
        /^:root/,
      );
    }
    // Und die Variable haengt an genau einer Klasse, nicht an einer Flaeche.
    const nutzer = regeln(css()).filter((r) => /var\(\s*--fp-wortzeichen/.test(r.body));
    expect(nutzer.map((r) => r.selektor)).toEqual([".fp-wortzeichen"]);
    /*
     * DER UMWEG UEBER EINE ZWEITE VARIABLE, sonst waere die Regel schwaecher als
     * die Fassung, die sie ersetzt hat: `--fp-akzent: #c8000f` im `:root` plus
     * `.fp-badge { background: var(--fp-akzent) }` erfuellt beide Zusagen oben
     * und setzt Suite-Rot doch als Flaeche. `feedback-oeffentliche-ansicht.md:189`
     * verlangt die Regel mechanisch („als Review-Checkliste oder Stylelint-Regel
     * festhalten"), also traegt #c8000f genau EINEN Variablennamen.
     */
    const rotVariablen = [...ohneKommentare(css()).matchAll(/(--fp-[a-z0-9-]+):\s*#c8000f\b/gi)].map(
      (m) => m[1],
    );
    expect([...new Set(rotVariablen)], "#c8000f traegt einen zweiten Variablennamen").toEqual([
      "--fp-wortzeichen",
    ]);
  });

  it("benutzt keine `--ant-*`-Variable in eigenem Markup", () => {
    // antd erklaert sie auf seiner Scope-Klasse, nicht auf `:root` — in eigenem
    // Markup loesen sie ins Leere auf, und der Fehler ist still (Falle 2).
    expect(ohneKommentare(css())).not.toMatch(/var\(\s*--ant-/);
  });
});
