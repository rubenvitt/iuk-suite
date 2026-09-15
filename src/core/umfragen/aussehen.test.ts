// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { theme as antdTheme } from "antd";

import { buildTheme, type ThemeMode } from "@/core/theme/theme";
import {
  FARBPAARE,
  FARBROLLEN,
  OHNE_MODUSFARBE,
  umfragenFarbCss,
  type Farbquelle,
} from "@/core/umfragen/aussehen";

/**
 * WAS DIESE DATEI KANN UND WAS NICHT — der Unterschied ist bei Farben besonders
 * groß, und er steht als Akzeptanzkriterium im Ticket (DRK-357).
 *
 * jsdom rechnet keine Farben und wertet keine Kaskade aus. Ob die Regel im
 * Browser GREIFT, kann hier also niemand messen; das tut
 * `e2e/umfragen.spec.ts` gegen ein echtes Chromium, samt der Gegenprobe gegen
 * den Block, den Formbricks zur Laufzeit selbst einhängt.
 *
 * Was hier geprüft werden KANN, ist trotzdem das meiste — und es ist genau das,
 * was sonst still bricht:
 *   - die Form des Selektors (0,1,1 statt 0,1,0 — sonst verliert die Regel
 *     gegen Formbricks' eigenen Block, in BEIDEN Modi, und zwar lautlos);
 *   - die Vollständigkeit der Bestandsaufnahme (eine nicht gesetzte Farbvariable
 *     bleibt im falschen Modus stehen, und niemand sieht es am Diff);
 *   - die Abwesenheit von Hexwerten (Kriterium: die Farben kommen aus denselben
 *     Quellen wie der Rest der Suite);
 *   - die KONTRASTE, mit den Zahlen. „Nicht nur invertiert, sondern lesbar" ist
 *     eine Rechnung, und eine Rechnung gehört in einen Test, nicht in ein Auge.
 */

const MODES: ThemeMode[] = ["light", "dark"];

const TOKEN: Record<ThemeMode, Farbquelle> = {
  light: antdTheme.getDesignToken(buildTheme("light")),
  dark: antdTheme.getDesignToken(buildTheme("dark")),
};

const CSS = umfragenFarbCss(TOKEN.light, TOKEN.dark);

/** Der Block eines Modus, ohne den des anderen. */
function blockVon(mode: ThemeMode): string {
  const anfang = CSS.indexOf(`html[data-theme="${mode}"]`);
  expect(anfang, `Block für ${mode}`).toBeGreaterThanOrEqual(0);
  const rest = CSS.slice(anfang);
  return rest.slice(0, rest.indexOf("}") + 1);
}

describe("Der Selektor", () => {
  /**
   * ⚠️ DIE TRAGENDE ZUSICHERUNG DIESER DATEI. Formbricks hängt das in
   * „Look & Feel" eingestellte Thema zur Laufzeit als `#fbjs { … }` in den
   * `<head>` — gleiche Spezifität, spätere Position, also gewinnt es jeden
   * Gleichstand. Eine Regel auf `#fbjs` allein wäre damit wirkungslos, und der
   * Ausfall wäre still: die Deklaration steht da und greift nicht.
   */
  it.each(MODES)("hängt den Modus %s an `html[data-theme]`, nicht an `#fbjs` allein", (mode) => {
    expect(CSS).toContain(`html[data-theme="${mode}"] #fbjs {`);
  });

  it("enthält keinen Block, der nur auf `#fbjs` hängt", () => {
    // Jede öffnende Klammer im Stylesheet muss einen Selektor mit `data-theme`
    // davor haben. Ein später eingefügter `#fbjs { … }`-Block wäre sonst genau
    // der Gleichstand, den die Zusicherung oben ausschließt.
    const selektoren = CSS.split("}")
      .map((teil) => teil.split("{")[0].trim())
      .filter((teil) => teil !== "");
    expect(selektoren).not.toHaveLength(0);
    for (const selektor of selektoren) {
      expect(selektor, selektor).toMatch(/^html\[data-theme="(light|dark)"\] #fbjs$/);
    }
  });

  /**
   * Kein `!important`, und das ist eine Entscheidung: die Formbricks-Doku setzt
   * es in ihren Beispielen, weil sie von einer Regel auf `#fbjs` ausgeht. Über
   * die Spezifität zu gewinnen lässt dem Betreiber die Möglichkeit, mit einem
   * eigenen `!important` doch noch einzugreifen — `!important` hier nähme sie
   * ihm, ohne etwas dazuzugewinnen.
   */
  it("braucht kein `!important`", () => {
    expect(CSS).not.toContain("!important");
  });

  /**
   * Das Stylesheet ist ein Textkind von `<style>`. React maskiert `<` und `&`
   * in einem Textknoten — beide kämen dann als Zeichenfolge im Stylesheet an und
   * machten die Regel danach ungültig. Heute kommt keines vor; diese Zeile hält
   * es so.
   */
  it("kommt ohne Zeichen aus, die React im Textknoten maskiert", () => {
    expect(CSS).not.toMatch(/[<&]/);
  });
});

describe("Die Bestandsaufnahme", () => {
  /**
   * ⚠️ ABGESCHRIEBEN AUS DEM AUSGELIEFERTEN WIDGET, NICHT AUS DER DOKU — die
   * gilt für mehrere Generationen gleichzeitig und nennt Namen, die dieses
   * Widget nicht liest (`--fb-input-bg-color`), während sie andere weglässt, die
   * es deklariert (`--fb-close-btn-color-hover`).
   *
   * Quellen, beide gegen `@formbricks/surveys` gelesen:
   *   - `src/styles/global.css` — der Vorgabeblock auf `#fbjs`;
   *   - `src/lib/styles.ts` — was das Look-&-Feel zur Laufzeit dazuschreibt;
   *   - `tailwind.config.cjs` — welche Klasse welche Variable liest.
   *
   * Der Wert dieser Liste liegt nicht im Vergleich mit sich selbst, sondern im
   * Beweis, dass jede gefundene Farbvariable EINE der beiden Antworten bekommen
   * hat: eine Modusfarbe, oder einen ausgeschriebenen Grund, warum nicht. Eine
   * dritte Möglichkeit — vergessen — schließt die Zusicherung aus.
   */
  const BESTAND = [
    "accent-background-color",
    "accent-background-color-selected",
    "back-btn-border",
    "back-button-color",
    "border-color",
    "border-color-highlight",
    "brand-color",
    "brand-text-color",
    "branding-text-color",
    "button-bg-color",
    "button-text-color",
    "calendar-tile-color",
    "close-btn-color",
    "close-btn-color-hover",
    "close-btn-hover-color",
    "element-description-color",
    "element-headline-color",
    "element-upper-label-color",
    "focus-color",
    "heading-color",
    "info-text-color",
    "input-background-color",
    "input-background-color-selected",
    "input-bg-color",
    "input-border-color",
    "input-color",
    "input-placeholder-color",
    "input-text-color",
    "label-color",
    "option-bg-color",
    "option-border-color",
    "option-label-color",
    "placeholder-color",
    "progress-indicator-bg-color",
    "progress-track-bg-color",
    "rating-fill",
    "rating-hover",
    "rating-selected",
    "signature-text-color",
    "submit-btn-border",
    "subheading-color",
    "survey-background-color",
    "survey-border-color",
    "survey-brand-color",
  ];

  it("beantwortet jede Farbvariable des Widgets — gesetzt oder begründet ausgelassen", () => {
    const beantwortet = [
      ...Object.keys(FARBROLLEN),
      ...Object.keys(OHNE_MODUSFARBE),
    ].sort();
    expect(beantwortet).toEqual([...BESTAND].sort());
  });

  it("lässt keine Variable in beiden Listen stehen", () => {
    const doppelt = Object.keys(FARBROLLEN).filter((name) => name in OHNE_MODUSFARBE);
    expect(doppelt).toEqual([]);
  });

  it.each(MODES)("setzt im Modus %s jede zugeordnete Variable", (mode) => {
    const block = blockVon(mode);
    for (const [name, rolle] of FARBPAARE) {
      expect(block, name).toContain(`--fb-${name}: ${TOKEN[mode][rolle]};`);
    }
  });

  it.each(MODES)("setzt im Modus %s keine ausgelassene Variable", (mode) => {
    const block = blockVon(mode);
    for (const name of Object.keys(OHNE_MODUSFARBE)) {
      expect(block, name).not.toContain(`--fb-${name}:`);
    }
  });
});

describe("Ein Variablensatz genügt NICHT — das dunkle Thema trägt eigene Werte", () => {
  /**
   * Die erste offene Frage des Tickets, als Zusicherung: reicht ein Satz für
   * beide Modi? Nein, und nicht nur bei einer Randfarbe — die tragenden Rollen
   * (Kartenfläche, Fliesstext, Kontur, Markenfläche) sind alle vier
   * verschieden. Ohne diese Zeilen wäre ein versehentlich zweimal mit demselben
   * Token gebauter Block grün.
   */
  it.each(["survey-background-color", "heading-color", "border-color", "brand-color"] as const)(
    "unterscheidet hell und dunkel bei `--fb-%s`",
    (name) => {
      const rolle = FARBROLLEN[name];
      expect(TOKEN.light[rolle]).not.toBe(TOKEN.dark[rolle]);
    },
  );

  /**
   * ⚠️ UND DIE UMKEHRUNG, DIE GENAUSO WICHTIG IST: `--fb-brand-text-color` ist
   * in BEIDEN Modi weiß, weil antd die Markenfläche im Dunkeln nicht aufhellt,
   * sondern abdunkelt (Begründung an `FARBEN.rotAufDunkel`). Wer „Dunkelmodus"
   * mit „alles umdrehen" verwechselt, dreht diese eine Rolle mit und macht den
   * Absendeknopf unlesbar.
   */
  it("dreht die Schrift auf der Markenfläche NICHT mit", () => {
    const rolle = FARBROLLEN["brand-text-color"];
    expect(TOKEN.light[rolle]).toBe(TOKEN.dark[rolle]);
  });
});

describe("Die Farben kommen aus dem Suite-Theme", () => {
  /**
   * Das Akzeptanzkriterium wörtlich: keine zweitgeschriebenen Hexwerte. Die
   * Zusicherung liest den Quelltext, weil ein Hexwert im Ergebnis nicht von
   * einem Hexwert aus antds Rechnung zu unterscheiden ist — nur die Datei kann
   * die Frage beantworten.
   *
   * ⚠️ OHNE KOMMENTARE, sonst prüft die Zeile die Dokumentation: die Kommentare
   * in `aussehen.ts` nennen `#1f1f1f`, `#141414` und Kontrastzahlen, und genau
   * das sollen sie. Dieselbe Bauform wie `ohneKommentare` in
   * `einbindung.test.ts`.
   */
  it("enthält keinen Hexwert im Quelltext", () => {
    const quelle = readFileSync("src/core/umfragen/aussehen.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    expect(quelle).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("nennt nur Tokens, die antd wirklich liefert", () => {
    for (const [name, rolle] of FARBPAARE) {
      for (const mode of MODES) {
        expect(TOKEN[mode][rolle], `${name} → ${rolle} (${mode})`).toBeTruthy();
      }
    }
  });
});

describe("Lesbar, nicht nur invertiert", () => {
  /**
   * Dieselbe WCAG-Rechnung wie in `core/theme/theme.test.ts` — hier zusätzlich
   * mit einer Deckungsstufe, weil antds Schriftrollen `rgba(…)` sind: eine
   * halbdurchsichtige Schrift hat erst über ihrer Fläche eine Leuchtdichte.
   * Ohne das Überlagern käme für jede Textrolle eine Zahl heraus, die niemand
   * sieht — und zwar eine zu GUTE, weil `rgba(255,255,255,0.65)` ungerechnet
   * wie reines Weiß aussieht.
   */
  type Kanal = [number, number, number, number];

  const kanal = (wert: string): Kanal => {
    const rgba = wert.match(/rgba?\(([^)]+)\)/);
    if (rgba) {
      const teile = rgba[1].split(/[,/\s]+/).filter((t) => t !== "");
      const [r, g, b] = teile.slice(0, 3).map(Number);
      return [r, g, b, teile[3] === undefined ? 1 : Number(teile[3])];
    }
    const hex = wert.replace("#", "");
    const breit = hex.length <= 4 ? [...hex].map((z) => z + z).join("") : hex;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(breit.slice(i, i + 2), 16));
    return [r, g, b, breit.length === 8 ? parseInt(breit.slice(6, 8), 16) / 255 : 1];
  };

  /** Vordergrund über eine als deckend behandelte Fläche gelegt. */
  const ueber = (vorn: string, hinten: string): Kanal => {
    const [vr, vg, vb, a] = kanal(vorn);
    const [hr, hg, hb] = kanal(hinten);
    return [vr * a + hr * (1 - a), vg * a + hg * (1 - a), vb * a + hb * (1 - a), 1];
  };

  const leuchtdichte = ([r, g, b]: Kanal) => {
    const [lr, lg, lb] = [r, g, b]
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  };

  /** `vorn` auf `hinten`, wobei `hinten` selbst über `grund` liegen darf. */
  const kontrast = (vorn: string, hinten: string, grund?: string) => {
    const flaeche = grund === undefined ? kanal(hinten) : ueber(hinten, grund);
    const schrift = ueber(vorn, `rgba(${flaeche.slice(0, 3).join(",")},1)`);
    const [hoch, tief] = [leuchtdichte(schrift), leuchtdichte(flaeche)].sort((a, b) => b - a);
    return (hoch + 0.05) / (tief + 0.05);
  };

  /** Fläche, auf der der Inhalt der Umfrage sitzt. */
  const karte = (mode: ThemeMode) => TOKEN[mode][FARBROLLEN["survey-background-color"]];

  const SCHRIFT_AUF_KARTE = [
    "heading-color",
    "subheading-color",
    "info-text-color",
    "signature-text-color",
    "branding-text-color",
    "label-color",
  ] as const;

  it.each(MODES)("hält Schrift auf der Umfragenkarte auf AA (4,5:1), Modus %s", (mode) => {
    for (const name of SCHRIFT_AUF_KARTE) {
      const farbe = TOKEN[mode][FARBROLLEN[name]];
      expect(kontrast(farbe, karte(mode)), `--fb-${name} ${farbe} auf ${karte(mode)}`)
        .toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(MODES)("hält Schrift auf der Markenfläche auf AA (4,5:1), Modus %s", (mode) => {
    const flaeche = TOKEN[mode][FARBROLLEN["brand-color"]];
    const schrift = TOKEN[mode][FARBROLLEN["brand-text-color"]];
    expect(kontrast(schrift, flaeche), `${schrift} auf ${flaeche}`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(MODES)("hält Schrift auf der gewählten Antwortzeile auf AA, Modus %s", (mode) => {
    /*
     * Die überfahrene Zeile trägt `--fb-heading-color` auf
     * `--fb-accent-background-color`, die gewählte auf der kräftigeren Stufe.
     * Beide Tönungen müssen die Schrift tragen — und beide werden hier über
     * die Karte gelegt, weil antd `colorPrimaryBg` künftig durchsichtig
     * ausgeben könnte, ohne dass sich der Name ändert.
     */
    const schrift = TOKEN[mode][FARBROLLEN["heading-color"]];
    for (const name of ["accent-background-color", "accent-background-color-selected"] as const) {
      const toenung = TOKEN[mode][FARBROLLEN[name]];
      expect(kontrast(schrift, toenung, karte(mode)), `${schrift} auf --fb-${name} ${toenung}`)
        .toBeGreaterThanOrEqual(4.5);
    }
  });

  /**
   * ⚠️ DER FALL, DER DIE ZUORDNUNG ÜBERHAUPT BEGRÜNDET: Konturen und Fokusringe
   * sind Bedienelemente, WCAG 1.4.11 verlangt 3:1. antds `colorPrimary` trägt
   * im Dunkelmodus auf der Kartenfläche nur 2,2:1 — deshalb hängen
   * `--fb-focus-color` und `--fb-border-color-highlight` an `colorLink`, dem
   * angehobenen Rot. Ohne diese Zeilen wäre eine Rückkehr zu `colorPrimary` ein
   * grüner Diff mit einem unsichtbaren Fokusring.
   */
  it.each(MODES)("hält Fokusring und Hervorhebung auf 3:1 gegen die Karte, Modus %s", (mode) => {
    /*
     * ⚠️ `--fb-border-color` STEHT HIER ABSICHTLICH NICHT, und die erste
     * Fassung dieser Zusicherung hatte es drin — sie wurde rot mit 1,41:1
     * (hell) und 1,64:1 (dunkel). Das ist kein Mangel, sondern die falsche
     * Schwelle: 1.4.11 verlangt 3:1 für das, was ein Bedienelement
     * ERKENNBAR macht — den Fokusring und die Hervorhebung —, nicht für jede
     * ruhende Kontur. Die ruhende Kontur ist `colorBorder`, also exakt der
     * Wert, den jedes Eingabefeld der Suite trägt. Sie hier anzuheben machte
     * die Umfrage zur einzigen Fläche mit einer dunkleren Kontur als ihre
     * Umgebung.
     */
    for (const name of ["focus-color", "border-color-highlight"] as const) {
      const farbe = TOKEN[mode][FARBROLLEN[name]];
      expect(kontrast(farbe, karte(mode)), `--fb-${name} ${farbe} auf ${karte(mode)}`)
        .toBeGreaterThanOrEqual(3);
    }
  });

  it.each(MODES)("hält die Marke als SCHRIFT auf der Karte auf AA, Modus %s", (mode) => {
    // Der „Zurück"-Knopf ohne Fläche — der Fall, für den `FARBEN.rotAufDunkel`
    // existiert. Mit `colorPrimary` wären es im Dunkeln 2,2:1.
    const farbe = TOKEN[mode][FARBROLLEN["back-button-color"]];
    expect(kontrast(farbe, karte(mode)), `${farbe} auf ${karte(mode)}`).toBeGreaterThanOrEqual(4.5);
  });
});
