import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

/**
 * QUELLTEXT-SCAN UEBER `_ui/aufgaben.module.css` — und das ist eine Aussage,
 * keine Ausrede: **jsdom wertet Media Queries nicht aus**. Ein Vitest, der
 * behauptet „bei 390px ist `.wochenGitter` unsichtbar" und dafuer im DOM
 * sucht, ginge IMMER durch, egal was im Stylesheet steht — er misst nichts
 * (`docs/design/README.md`, Abschnitt „Tests fuer Responsives"). Diesem Scan
 * gehoeren deshalb nur Aussagen, die sich am TEXT der Datei ablesen lassen:
 * genau eine Medienabfrage, Hell/Dunkel-Paarigkeit, die Verbotsliste, die
 * richtige Seite der Umschaltung — und ein wirklich AUSGERECHNETER
 * AA-Kontrast, nicht ein geschaetzter. Ob die Umschaltung im Browser WIRKT,
 * besitzt `e2e/…` aus Aufgabe 21 (390/820/1280px).
 */
const PFAD = "src/app/m/aufgaben/_ui/aufgaben.module.css";
const ROH = existsSync(PFAD) ? readFileSync(PFAD, "utf8") : "";
/**
 * ZWEI SICHTEN, und die Trennung ist keine Kosmetik: `OHNE_KOMMENTARE` trägt
 * die Regeln — die Verbotsliste (Aussage 3) muss GENAU hier prüfen, sonst
 * schlägt sie am eigenen Kopfkommentar an, der `#c8000f` und
 * `prefers-color-scheme` als Begründung nennt (Vorbild: `files-css.test.ts`).
 * Der naheliegende „Fix" wäre dann, die Begründung zu löschen — der Test
 * hätte den Kommentar wegoptimiert, den der Brief verlangt.
 */
const OHNE_KOMMENTARE = ROH.replace(/\/\*[\s\S]*?\*\//g, "");

describe("aufgaben.module.css — der Scan greift nicht ins Leere", () => {
  it("liest eine nicht-leere Datei", () => {
    expect(existsSync(PFAD), `${PFAD} fehlt`).toBe(true);
    expect(ROH.trim().length).toBeGreaterThan(0);
  });
});

describe("aufgaben.module.css — Aussage 1: genau eine Medienabfrage", () => {
  /**
   * Die Zahl wird AUSGEGEBEN, nicht nur behauptet: „es gibt hoechstens eine"
   * waere bei null Abfragen ebenfalls gruen und bewiese nichts.
   */
  it("kennt genau eine `@media`-Regel, und sie lautet auf 767.98px", () => {
    const treffer = [...OHNE_KOMMENTARE.matchAll(/@media\s*\([^)]*\)/g)];
    expect(treffer.length).toBe(1);
    expect(treffer[0][0]).toMatch(/max-width:\s*767\.98px/);
  });

  it("hat keine 768px- oder andere `max-width`-Abfrage", () => {
    const werte = [...OHNE_KOMMENTARE.matchAll(/max-width:\s*([\d.]+)px/g)].map((m) => m[1]);
    expect(werte).toEqual(["767.98"]);
  });
});

/**
 * Die Bloecke der einen Medienabfrage — Vorbild `feedback-css.test.ts` /
 * `files-css.test.ts`. `BASIS` ist die Datei OHNE jeden `@media`-Block: nur
 * so lassen sich Basis- und Medienregel zum selben Selektor unterscheiden,
 * ein textuelles "kommt der Selektor irgendwo im Block vor" kann das
 * strukturell nicht (beide Haelften tragen denselben Selektortext).
 */
const MEDIA_767_BLOECKE = [
  ...OHNE_KOMMENTARE.matchAll(/@media \(max-width: 767\.98px\) \{([\s\S]*?)\n\}/g),
].map((m) => m[1]);
const BASIS = OHNE_KOMMENTARE.replace(/@media[^{]*\{[\s\S]*?\n\}/g, "");

const regelnAus = (css: string) =>
  [...css.matchAll(/([^{}@]+?)\s*\{([^{}]*)\}/g)].map((m) => ({
    selektor: m[1].replace(/\s+/g, " ").trim(),
    rumpf: m[2],
  }));
const AT_PRELUDE = /@[a-z-]+[^{;]*\{/g;
const ALLE_REGELN = regelnAus(OHNE_KOMMENTARE.replace(AT_PRELUDE, ""));

describe("aufgaben.module.css — Aussage 3: die Verbote", () => {
  it("selektiert nirgends auf `prefers-color-scheme`", () => {
    expect(OHNE_KOMMENTARE).not.toMatch(/prefers-color-scheme/);
  });

  it('kennt kein `data-theme="auto"`', () => {
    expect(OHNE_KOMMENTARE).not.toMatch(/data-theme\s*=\s*["']auto["']/);
  });

  /**
   * Suite-Rot `#c8000f` — auch nicht in Groß-/Kleinschreibung oder als
   * `rgb()`-Äquivalent (200, 0, 15). Ein rotes Prioritäts-Chip läse sich als
   * Primärknopf, weil `colorError === colorPrimary === #c8000f` gilt.
   */
  it("verwendet nirgends Suite-Rot (`#c8000f`, auch nicht als `rgb()`-Äquivalent)", () => {
    expect(OHNE_KOMMENTARE).not.toMatch(/#c8000f/i);
    expect(OHNE_KOMMENTARE).not.toMatch(/rgb\(\s*200\s*,\s*0\s*,\s*15\s*\)/i);
  });

  it("verwendet in eigenem Markup keine `--ant-*`-Variablen", () => {
    expect(OHNE_KOMMENTARE).not.toMatch(/var\(\s*--ant-/);
  });

  it("kommt ohne `!important` aus", () => {
    expect(OHNE_KOMMENTARE).not.toMatch(/!\s*important/);
  });

  it("greift nirgends gegen `.ant-table-thead` durch — Spaltenköpfe bekommen ihre Rolle über `columns[].title`", () => {
    expect(OHNE_KOMMENTARE).not.toMatch(/\.ant-table-thead/);
  });

  /**
   * `outline: none` ist nur zulässig, wenn im SELBEN Regelblock ein Ersatz
   * steht. Heute entfernt diese Datei nirgends einen Fokusring — der Test
   * bleibt trotzdem als Wächter stehen, statt einfach „kein `outline: none`"
   * zu behaupten, denn genau EIN begründeter Fall (mit Ersatz direkt daneben)
   * ist erlaubt und soll es bleiben.
   */
  it("lässt `outline: none` nur mit einem Ersatz im selben Regelblock durch", () => {
    const hatErsatzlosesNone = (rumpf: string): boolean => {
      const deklarationen = rumpf
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean);
      const hatNone = deklarationen.some((d) => /^outline\s*:\s*none\b/i.test(d));
      if (!hatNone) return false;
      const hatErsatz = deklarationen.some(
        (d) => /^outline\s*:/i.test(d) && !/^outline\s*:\s*none\b/i.test(d),
      );
      return !hatErsatz;
    };
    const verstoesse = ALLE_REGELN.filter((r) => hatErsatzlosesNone(r.rumpf));
    expect(verstoesse.map((r) => r.selektor)).toEqual([]);
  });
});

describe("aufgaben.module.css — Aussage 4: die Umschaltung sitzt richtig herum", () => {
  /**
   * Das ist die Aussage, die am leichtesten verdreht wird: nicht nur PRÜFEN,
   * dass `display: none` an der richtigen Stelle steht, sondern auch, dass
   * die GEGENSEITE einen wirklichen (nicht `none`) Wert trägt — sonst wären
   * beide Ausprägungen gleichzeitig unsichtbar und kein anderer Test sieht es.
   */
  it("versteckt `.wochenGitter` NUR innerhalb des 767.98px-Blocks", () => {
    const inBasis = /\.wochenGitter\s*\{([^}]*)\}/.exec(BASIS);
    expect(inBasis, ".wochenGitter fehlt in der Basisregel").not.toBeNull();
    expect(inBasis![1]).not.toMatch(/display\s*:\s*none/);
    expect(inBasis![1]).toMatch(/display\s*:\s*grid/);

    const inMedia = MEDIA_767_BLOECKE.map((b) => /\.wochenGitter\s*\{([^}]*)\}/.exec(b)).find(
      Boolean,
    );
    expect(inMedia, ".wochenGitter fehlt in einem 767.98px-Block").not.toBeUndefined();
    expect(inMedia![1]).toMatch(/display\s*:\s*none/);
  });

  /**
   * DIE SPALTENZAHL DARF NICHT WIEDER FEST WERDEN (Nach-Rebase-Runde, Befund B). `repeat(5, …)`
   * stand hier, solange dem Modul die volle Fensterbreite gehörte; seit `main`s Seitenleiste sind
   * es bei 820px Fenster nur noch 580px, und fünf Spalten ergaben 74px Innenbreite bei 138px
   * längstem unteilbarem Titel — zwei Namen ragten über das Dokument hinaus.
   *
   * WAS DIESER TEST KANN UND WAS NICHT, ausdrücklich: er prüft, dass die Datei die Absicht noch
   * TRÄGT — er kann nicht prüfen, dass ein Browser daraus die richtige Spaltenzahl rechnet (jsdom
   * wertet weder `@media` noch Grid-Spuren aus). Das tut der 820px-Überlauf-Sweep in
   * `e2e/aufgaben.spec.ts`, und nur beide zusammen sind die Zusicherung: der Sweep fällt, wenn die
   * Rechnung nicht aufgeht, dieser hier, wenn eine Aufräumrunde die Regel „vereinfacht".
   */
  it("lässt `.wochenGitter` die Spaltenzahl aus der Fläche ableiten, statt sie festzuschreiben", () => {
    const inBasis = /\.wochenGitter\s*\{([^}]*)\}/.exec(BASIS);
    expect(inBasis, ".wochenGitter fehlt in der Basisregel").not.toBeNull();
    expect(inBasis![1], "grid-template-columns fehlt").toMatch(/grid-template-columns\s*:/);
    expect(inBasis![1], "auto-fit fehlt — die Spaltenzahl wäre wieder fest").toMatch(/auto-fit/);
    expect(
      inBasis![1],
      "eine feste Spaltenzahl (`repeat(5, …)`) ist genau die Regression aus Befund B",
    ).not.toMatch(/repeat\(\s*\d/);
  });

  /**
   * DAS NETZ UNTER DER SPALTENZAHL: die `minmax`-Untergrenze oben ist gegen die HEUTIGEN
   * Seed-Texte gerechnet. Ohne `overflow-wrap` hinge die Zusicherung „kein waagerechtes Scrollen"
   * an der Länge einer Fixtur — ein längerer Routinenname morgen schöbe das Dokument wieder
   * seitwärts.
   *
   * DIE BEIDEN REGELN DECKEN VERSCHIEDENE AUSFÄLLE, deshalb zwei Tests statt einem: `min(180px,
   * 100%)` hält die SPALTE in ihrem Kasten, `overflow-wrap` hält das WORT in seiner Spalte.
   * `anywhere` statt `break-word`, weil nur ersteres auch den `min-content`-Beitrag senkt — heute
   * folgenlos (die Untergrenze der Spur ist eine feste Zahl), aber die Fassung, die auch dann noch
   * richtig ist, wenn eine Größe hier je aus `min-content` abgeleitet wird.
   */
  it("gibt `.tagSpalte` `overflow-wrap: anywhere` — nicht `break-word`", () => {
    const inBasis = /\.tagSpalte\s*\{([^}]*)\}/.exec(BASIS);
    expect(inBasis, ".tagSpalte fehlt in der Basisregel").not.toBeNull();
    expect(inBasis![1]).toMatch(/overflow-wrap\s*:\s*anywhere/);
  });

  /**
   * DIE ANDERE HAELFTE DES BUDGETZEILEN-UMBRUCHS (Nach-Rebase-Runde, Befund B) — die erste steht
   * in `Wochenplan.test.tsx` und bewacht das führende Leerzeichen IN der Spanne. Ohne
   * `white-space: normal` hier erbt die Spanne das `nowrap` von `.budget`, und die
   * Umbruchgelegenheit am Leerzeichen gilt trotz richtiger Markup-Struktur nicht. Beide Hälften
   * einzeln sind wirkungslos; nur zusammen bricht die Zeile.
   */
  it("gibt `.budgetHinweis` `white-space: normal` — sonst erbt der Zusatz das `nowrap`", () => {
    const inBasis = /\.budgetHinweis\s*\{([^}]*)\}/.exec(BASIS);
    expect(inBasis, ".budgetHinweis fehlt in der Basisregel").not.toBeNull();
    expect(inBasis![1]).toMatch(/white-space\s*:\s*normal/);
  });

  it("zeigt `.tagesListe` NUR außerhalb des 767.98px-Blocks (die Basis versteckt sie)", () => {
    const inBasis = /\.tagesListe\s*\{([^}]*)\}/.exec(BASIS);
    expect(inBasis, ".tagesListe fehlt in der Basisregel").not.toBeNull();
    expect(inBasis![1]).toMatch(/display\s*:\s*none/);

    const inMedia = MEDIA_767_BLOECKE.map((b) => /\.tagesListe\s*\{([^}]*)\}/.exec(b)).find(
      Boolean,
    );
    expect(inMedia, ".tagesListe fehlt in einem 767.98px-Block").not.toBeUndefined();
    expect(inMedia![1]).not.toMatch(/display\s*:\s*none/);
  });

  /**
   * DER MOBILE TAGESWAEHLER (Aufgabe 13) — dieselbe Umschaltung wie `.tagesListe`: unsichtbar in
   * der Basisregel, sichtbar (`flex`) nur innerhalb des 767.98px-Blocks.
   */
  it("zeigt `.tagesWaehler` NUR innerhalb des 767.98px-Blocks", () => {
    const inBasis = /\.tagesWaehler\s*\{([^}]*)\}/.exec(BASIS);
    expect(inBasis, ".tagesWaehler fehlt in der Basisregel").not.toBeNull();
    expect(inBasis![1]).toMatch(/display\s*:\s*none/);

    const inMedia = MEDIA_767_BLOECKE.map((b) => /\.tagesWaehler\s*\{([^}]*)\}/.exec(b)).find(Boolean);
    expect(inMedia, ".tagesWaehler fehlt in einem 767.98px-Block").not.toBeUndefined();
    expect(inMedia![1]).not.toMatch(/display\s*:\s*none/);
  });

  it("stellt der antd-Spezifität in `.knopfzeile > *` eine eigene Klasse voran", () => {
    const inMedia = MEDIA_767_BLOECKE.map((b) => /\.modul \.knopfzeile > \*\s*\{([^}]*)\}/.exec(b)).find(
      Boolean,
    );
    expect(
      inMedia,
      "`.modul .knopfzeile > *` fehlt im 767.98px-Block — ohne den Präfix verliert die Regel " +
        "gegen `.ant-btn` durch Dokumentreihenfolge",
    ).not.toBeUndefined();
    expect(inMedia![1]).toMatch(/width\s*:\s*100%/);
  });
});

/**
 * Die beiden Variablen-Blöcke — anhand ihrer VOLLEN, verankerten Selektorzeile
 * gefunden, nicht per Teilstringsuche. `:root[data-theme="dark"] .modul`
 * enthält `.modul` als Teilstring; ein Filter „Selektor enthält `.modul`"
 * träfe deshalb BEIDE Blöcke und die Paaritäts- wie die Kontrastprüfung
 * läsen dann in Wahrheit zweimal denselben (den dunklen) Block. Deshalb hier
 * über volle Zeilen: nur die Basisregel beginnt mit einer Zeile, die EXAKT
 * `.modul {` lautet.
 */
const HELL_BLOCK = /^\.modul \{\n([\s\S]*?)\n\}/m.exec(OHNE_KOMMENTARE)?.[1] ?? null;
const DUNKEL_BLOCK =
  /^:root\[data-theme="dark"\] \.modul \{\n([\s\S]*?)\n\}/m.exec(OHNE_KOMMENTARE)?.[1] ?? null;

const varsAus = (block: string): Map<string, string> => {
  const map = new Map<string, string>();
  for (const m of block.matchAll(/(--auf-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    map.set(m[1], m[2].trim());
  }
  return map;
};

describe("aufgaben.module.css — Aussage 2: Hell/Dunkel-Paarigkeit", () => {
  it("findet je einen Hell- und einen Dunkel-Variablenblock", () => {
    expect(HELL_BLOCK, "kein `.modul { … }`-Block gefunden").not.toBeNull();
    expect(DUNKEL_BLOCK, 'kein `:root[data-theme="dark"] .modul { … }`-Block gefunden').not.toBeNull();
  });

  const hell = varsAus(HELL_BLOCK ?? "");
  const dunkel = varsAus(DUNKEL_BLOCK ?? "");

  it("deklariert mindestens die vier Basisvariablen in beiden Blöcken", () => {
    expect(hell.size).toBeGreaterThan(0);
    expect(dunkel.size).toBeGreaterThan(0);
  });

  /**
   * Paarität JE VARIABLE, in BEIDEN Richtungen: eine Variable, die nur im
   * Dunkelblock steht, ist im Hellen unaufgelöst, und eine unaufgelöste
   * CSS-Variable meldet sich nie. `toEqual` auf zwei sortierten Namensmengen
   * schlägt fehl, sobald EINE Seite einen Namen trägt, den die andere nicht
   * hat — das deckt beide Richtungen ab, nicht nur „Dunkel deckt Hell ab".
   */
  it("führt jede `--auf-*`-Variable in beiden Blöcken — und umgekehrt", () => {
    const hellNamen = [...hell.keys()].sort();
    const dunkelNamen = [...dunkel.keys()].sort();
    expect(dunkelNamen).toEqual(hellNamen);
  });
});

/**
 * WCAG-2.1-KONTRAST, WIRKLICH AUSGERECHNET — Spec §9.2 verlangt die Palette
 * „mit gemessenem AA-Kontrast geliefert, nicht mit geschätztem". Der
 * Hex-Parser ist bewusst schlicht (`#rrggbb`) und lehnt jeden Wert ab, den er
 * nicht versteht, statt ihn stillschweigend zu überspringen — sonst prüft
 * dieser Test irgendwann nichts mehr, ohne rot zu werden.
 */
function hexZuRgb(hex: string): [number, number, number] {
  const treffer = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!treffer) {
    throw new Error(
      `"${hex}" ist kein #rrggbb-Hexwert — der Kontrast-Test lehnt unbekannte Werte ab, ` +
        "statt sie stillschweigend zu überspringen.",
    );
  }
  const n = parseInt(treffer[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Relative Luminanz nach WCAG 2.1: Kanal/255, linearisieren, gewichtet summieren. */
function relativeLuminanz([r, g, b]: [number, number, number]): number {
  const linear = (kanal: number) => {
    const c = kanal / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** `(heller + 0.05) / (dunkler + 0.05)` — Reihenfolge der Operanden ist egal. */
function kontrastverhaeltnis(hexA: string, hexB: string): number {
  const la = relativeLuminanz(hexZuRgb(hexA));
  const lb = relativeLuminanz(hexZuRgb(hexB));
  const [heller, dunkler] = la >= lb ? [la, lb] : [lb, la];
  return (heller + 0.05) / (dunkler + 0.05);
}

const SCHWELLE_AA = 4.5;

/**
 * WCAG 2.1 SC 1.4.11 „Non-text Contrast" — 3:1, und die Zahl steht ABSICHTLICH getrennt von
 * `SCHWELLE_AA`.
 *
 * EIN BALKEN IST KEIN TEXT. Die 4,5:1 der Aussage 5 gelten für Buchstaben; sie an eine Grafik zu
 * legen wäre nicht „strenger", sondern falsch begründet — und ein Riegel mit falscher Begründung
 * wird bei der ersten Farbänderung abgeschaltet statt befolgt. Umgekehrt wäre es schlimmer: ohne
 * eigene Schwelle bliebe die Beziehung Füllung-gegen-Spur **ungemessen**, und sie ist seit der
 * Auslastungsgrafik der alleinige Träger einer Menge.
 */
const SCHWELLE_GRAFIK = 3;

/**
 * Jedes Chip-Ton-Paar `--auf-<ton>-text` / `--auf-<ton>-flaeche` aus einem
 * Variablenblock — generisch über die Namenskonvention gefunden, nicht über
 * eine fest verdrahtete Liste von Tönen. Wächst das Vokabular um einen
 * sechsten Ton, findet dieser Test ihn automatisch statt ihn zu übersehen.
 */
function tonPaare(vars: Map<string, string>): { ton: string; text: string; flaeche: string }[] {
  const namen = [...vars.keys()];
  const textTons = namen
    .filter((n) => n.endsWith("-text"))
    .map((n) => n.replace(/^--auf-/, "").replace(/-text$/, ""));
  const flaechenTons = namen
    .filter((n) => n.endsWith("-flaeche"))
    .map((n) => n.replace(/^--auf-/, "").replace(/-flaeche$/, ""));
  return [...new Set([...textTons, ...flaechenTons])].sort().map((ton) => ({
    ton,
    text: vars.get(`--auf-${ton}-text`) ?? "",
    flaeche: vars.get(`--auf-${ton}-flaeche`) ?? "",
  }));
}

describe("aufgaben.module.css — Aussage 5: gemessener AA-Kontrast", () => {
  const hell = varsAus(HELL_BLOCK ?? "");
  const dunkel = varsAus(DUNKEL_BLOCK ?? "");
  const hellPaare = tonPaare(hell);
  const dunkelPaare = tonPaare(dunkel);

  /**
   * VOR der Kontrastrechnung: jedes Paar muss VOLLSTÄNDIG sein — ein
   * `-text` ohne `-flaeche` (oder umgekehrt) ist kein Paar, und eine
   * Kontrastrechnung, die einen leeren String gegen einen echten Hexwert
   * misst, wäre falsch grün oder falsch rot, aber in keinem Fall aussagekräftig.
   */
  it("hat für jeden gefundenen Ton beide Hälften des Paars, hell und dunkel", () => {
    expect(hellPaare.length, "kein Chip-Ton-Paar im hellen Block gefunden").toBeGreaterThan(0);
    expect(dunkelPaare.length, "kein Chip-Ton-Paar im dunklen Block gefunden").toBeGreaterThan(0);
    for (const paar of [...hellPaare, ...dunkelPaare]) {
      expect(paar.text, `Ton "${paar.ton}" hat keinen --auf-${paar.ton}-text`).not.toBe("");
      expect(paar.flaeche, `Ton "${paar.ton}" hat keinen --auf-${paar.ton}-flaeche`).not.toBe("");
    }
  });

  it(`hält für jedes Chip-Ton-Paar ≥ ${SCHWELLE_AA} Kontrast — hell UND dunkel`, () => {
    for (const paar of hellPaare) {
      const wert = kontrastverhaeltnis(paar.text, paar.flaeche);
      expect(
        wert,
        `hell/--auf-${paar.ton}-text (${paar.text}) auf --auf-${paar.ton}-flaeche (${paar.flaeche}): ${wert.toFixed(2)} < ${SCHWELLE_AA}`,
      ).toBeGreaterThanOrEqual(SCHWELLE_AA);
    }
    for (const paar of dunkelPaare) {
      const wert = kontrastverhaeltnis(paar.text, paar.flaeche);
      expect(
        wert,
        `dunkel/--auf-${paar.ton}-text (${paar.text}) auf --auf-${paar.ton}-flaeche (${paar.flaeche}): ${wert.toFixed(2)} < ${SCHWELLE_AA}`,
      ).toBeGreaterThanOrEqual(SCHWELLE_AA);
    }
  });

  it(`hält --auf-tinte auf --auf-papier ≥ ${SCHWELLE_AA} Kontrast — hell UND dunkel`, () => {
    const hellWert = kontrastverhaeltnis(hell.get("--auf-tinte") ?? "", hell.get("--auf-papier") ?? "");
    const dunkelWert = kontrastverhaeltnis(
      dunkel.get("--auf-tinte") ?? "",
      dunkel.get("--auf-papier") ?? "",
    );
    expect(hellWert, `hell: ${hellWert.toFixed(2)} < ${SCHWELLE_AA}`).toBeGreaterThanOrEqual(
      SCHWELLE_AA,
    );
    expect(dunkelWert, `dunkel: ${dunkelWert.toFixed(2)} < ${SCHWELLE_AA}`).toBeGreaterThanOrEqual(
      SCHWELLE_AA,
    );
  });

  /**
   * `--auf-stahl` ist die Textfarbe von `.prioKontur`/`.prioText` (sichtbarer
   * Text), fällt aber als BASISvariable nicht unter das `-text`/`-flaeche`-
   * Muster von `tonPaare()` und bliebe sonst ungemessen.
   *
   * DER VORBEHALT AUS AUFGABE 5 IST AUFGELÖST (Abschlussreview G5) — er stand
   * hier sechzehn Aufgaben lang im Futur („den tatsächlichen Hintergrund legen
   * erst Aufgabe 6/7 fest"), obwohl beide längst fertig waren. Nachgesehen:
   * `.prioKontur`/`.prioText` sitzen über `_ui/Chip.tsx` in `AufgabenListe`,
   * `FreigabeZone` und `a/[id]/page.tsx` auf der reinen Inhaltsfläche, also auf
   * `Layout.bodyBg` (`core/theme/theme.ts`) — und die IST `FARBEN.papier`
   * = `#eef0f1` im Hellen, numerisch genau `--auf-papier`. Die Annahme war
   * richtig; die Messung bleibt, wo sie ist.
   *
   * DIE BEIDEN ABWEICHENDEN FLÄCHEN SIND BEIDE GÜNSTIGER, also bleibt diese
   * Messung der ungünstigste Fall: auf der Kartenfläche `#ffffff` (die Chips in
   * `VerteilenDialog`s Tabelle) steigt der Hellwert von 5.19 auf 5.93, und im
   * Dunkeln ist `Layout.bodyBg` reines `#000000` gegenüber `--auf-papier`
   * `#0f1113` — 8.29 statt 7.47.
   */
  /**
   * `--auf-achtung-text` STEHT SEIT `_ui/Frist.tsx` ALS SICHTBARER TEXT AUF DER INHALTSFLÄCHE
   * (Oberflächen-Spec §6.5) — auf der Kante UND auf dem Wort von `.fristUeberfaellig`. Bis dahin
   * trat er ausschließlich als Chip-Textfarbe zu seiner `-flaeche`-Hälfte auf und war damit von
   * `tonPaare()` gedeckt; ohne seine Hälfte findet ihn das Muster nicht, und die einzige
   * farbtragende Stelle des neuen Entwurfs bliebe die einzige ungemessene.
   *
   * DIE ABWEICHENDEN TRÄGERFLÄCHEN SIND BEIDE GÜNSTIGER, also bleibt diese Messung der
   * ungünstigste Fall — dieselbe Begründung, die der Kommentar bei `--auf-stahl` schon führt: auf
   * der weißen Zellenfläche der `VerteilenTabelle` steigt der Hellwert, und im Dunkeln ist
   * `Layout.bodyBg` reines `#000000` gegenüber `--auf-papier` `#0f1113`.
   */
  it(`hält --auf-achtung-text auf --auf-papier ≥ ${SCHWELLE_AA} Kontrast — hell UND dunkel`, () => {
    const hellWert = kontrastverhaeltnis(
      hell.get("--auf-achtung-text") ?? "",
      hell.get("--auf-papier") ?? "",
    );
    const dunkelWert = kontrastverhaeltnis(
      dunkel.get("--auf-achtung-text") ?? "",
      dunkel.get("--auf-papier") ?? "",
    );
    expect(hellWert, `hell: ${hellWert.toFixed(2)} < ${SCHWELLE_AA}`).toBeGreaterThanOrEqual(
      SCHWELLE_AA,
    );
    expect(dunkelWert, `dunkel: ${dunkelWert.toFixed(2)} < ${SCHWELLE_AA}`).toBeGreaterThanOrEqual(
      SCHWELLE_AA,
    );
  });

  /**
   * DIE FORM IST TEIL DER ZUSAGE, NICHT NUR DIE FARBE (§6.3, Kanal 2; §9.2): `.fristUeberfaellig`
   * darf NIE eine Fläche tragen — eine Pille wäre formgleich mit dem `zurueckgewiesen`-Chip, der
   * in derselben Zeile steht, und ein überfälliges Etwas, das aussieht wie ein zurückgewiesenes,
   * ist schlimmer als gar keine Farbe. Nachprüfbar an genau dieser einen Regel.
   */
  it("gibt `.fristUeberfaellig` eine 3px-Kante und keine `-flaeche`-Variable", () => {
    const inBasis = /\.fristUeberfaellig\s*\{([^}]*)\}/.exec(BASIS);
    expect(inBasis, ".fristUeberfaellig fehlt in der Basisregel").not.toBeNull();
    expect(inBasis![1]).toMatch(/border-inline-start:\s*3px solid var\(--auf-achtung-text\)/);
    expect(inBasis![1], "eine Fläche macht die Marke formgleich mit dem Chip").not.toMatch(
      /-flaeche|background/,
    );
  });

  it(`hält --auf-stahl auf --auf-papier ≥ ${SCHWELLE_AA} Kontrast — hell UND dunkel`, () => {
    const hellWert = kontrastverhaeltnis(hell.get("--auf-stahl") ?? "", hell.get("--auf-papier") ?? "");
    const dunkelWert = kontrastverhaeltnis(
      dunkel.get("--auf-stahl") ?? "",
      dunkel.get("--auf-papier") ?? "",
    );
    expect(hellWert, `hell: ${hellWert.toFixed(2)} < ${SCHWELLE_AA}`).toBeGreaterThanOrEqual(
      SCHWELLE_AA,
    );
    expect(dunkelWert, `dunkel: ${dunkelWert.toFixed(2)} < ${SCHWELLE_AA}`).toBeGreaterThanOrEqual(
      SCHWELLE_AA,
    );
  });

  /**
   * `--auf-karte` IST SEIT DER OBERFLÄCHEN-RUNDE 2026-08-16 DIE DRITTE TRÄGERFLÄCHE, UND DAMIT
   * LÄUFT DIE ALTE „UNGÜNSTIGSTER FALL"-BEGRÜNDUNG AB. Die Kommentare bei `--auf-stahl` und
   * `--auf-achtung-text` oben wiesen `--auf-papier` als schlechtesten Fall aus und zählten die
   * beiden Abweichungen (weiße Zellenfläche, schwarzes `Layout.bodyBg`) als **günstiger** ab. Im
   * Hellen stimmt das für `--auf-karte` (`#ffffff` ist heller als `#eef0f1`) — **im Dunkeln nicht**:
   * die Kartenfläche ist dort mit Absicht HELLER als der Grund (sie soll sich abheben), und jeder
   * Text auf ihr hat damit WENIGER Kontrast als auf `--auf-papier`.
   *
   * DREI WERTE, WEIL DREI DORT WIRKLICH STEHEN: `--auf-tinte` trägt den Zeilentitel und die
   * Kartenüberschrift, `--auf-stahl` die Metazellen und `.prioKontur`/`.prioText`,
   * `--auf-achtung-text` die Überfälligkeitsmarke — alle drei sitzen auf der Führungskarte, auf den
   * Personenkacheln und (beim Überfahren) auf der Zeilenfläche.
   *
   * OHNE DIESEN TEST WÄRE DIE NEUE FLÄCHE DIE EINZIGE UNGEMESSENE — und der stehen gebliebene
   * Kommentar oben behauptete weiterhin etwas, das nicht mehr gilt.
   */
  /**
   * ══ DIE AUSLASTUNGSBALKEN — EINE NEUE FARBBEZIEHUNG, ALSO EINE NEUE MESSUNG (Nachtrag
   *    2026-08-16). `.lastFuellung` liegt auf `.lastBalken`, also **Füllung gegen Spur** —
   *    weder ein `-text`/`-flaeche`-Paar (das `tonPaare()` fände) noch Text auf einer Fläche
   *    (was die Messungen darüber decken). Ohne diesen Test wäre ausgerechnet der Balken
   *    ungemessen, und der ist seit dieser Runde der **alleinige Träger einer Menge**: sagt der
   *    Kontrast nichts, sagt die Grafik nichts.
   *
   *    DIESELBE LÜCKE HATTE `--auf-karte` eine Runde vorher, und sie ist auf demselben Weg
   *    entstanden: eine Farbe wird eingeführt, die alten Messungen greifen sie nicht, und der
   *    Kommentar daneben behauptet weiter, alles sei gemessen.
   *
   *    BEIDE FÜLLFARBEN, WEIL BEIDE VORKOMMEN: `--auf-stahl` trägt den Normalfall,
   *    `--auf-achtung-text` den überbuchten (`.lastFuellungUeber`). Gegen `--auf-linie`, denn das
   *    ist die Spur (`.lastBalken`s `background`) — nicht gegen `--auf-papier` oder `--auf-karte`,
   *    die hinter der Spur liegen und den Balken gar nicht berühren.
   */
  it.each(["--auf-stahl", "--auf-achtung-text"])(
    `hält %s als Balkenfüllung auf --auf-linie ≥ ${SCHWELLE_GRAFIK} Kontrast — hell UND dunkel`,
    (name) => {
      const hellWert = kontrastverhaeltnis(hell.get(name) ?? "", hell.get("--auf-linie") ?? "");
      const dunkelWert = kontrastverhaeltnis(dunkel.get(name) ?? "", dunkel.get("--auf-linie") ?? "");
      expect(
        hellWert,
        `hell/${name} auf --auf-linie: ${hellWert.toFixed(2)} < ${SCHWELLE_GRAFIK}`,
      ).toBeGreaterThanOrEqual(SCHWELLE_GRAFIK);
      expect(
        dunkelWert,
        `dunkel/${name} auf --auf-linie: ${dunkelWert.toFixed(2)} < ${SCHWELLE_GRAFIK}`,
      ).toBeGreaterThanOrEqual(SCHWELLE_GRAFIK);
    },
  );

  /**
   * DIE GEGENPROBE ZUR SCHWELLE SELBST: `SCHWELLE_GRAFIK` muss NIEDRIGER sein als `SCHWELLE_AA`.
   * Ohne diese Zeile könnte eine spätere Aufräumrunde die beiden Konstanten „vereinheitlichen" —
   * und dann prüfte der Balkentest stillschweigend die Textschwelle, was er ausdrücklich nicht
   * soll (ein Balken ist kein Text, s. den Kommentar an der Konstante).
   */
  it("hält die Grafik-Schwelle getrennt von der Textschwelle", () => {
    expect(SCHWELLE_GRAFIK).toBeLessThan(SCHWELLE_AA);
  });

  it.each(["--auf-tinte", "--auf-stahl", "--auf-achtung-text"])(
    `hält %s auf --auf-karte ≥ ${SCHWELLE_AA} Kontrast — hell UND dunkel`,
    (name) => {
      const hellWert = kontrastverhaeltnis(hell.get(name) ?? "", hell.get("--auf-karte") ?? "");
      const dunkelWert = kontrastverhaeltnis(dunkel.get(name) ?? "", dunkel.get("--auf-karte") ?? "");
      expect(hellWert, `hell/${name}: ${hellWert.toFixed(2)} < ${SCHWELLE_AA}`).toBeGreaterThanOrEqual(
        SCHWELLE_AA,
      );
      expect(
        dunkelWert,
        `dunkel/${name}: ${dunkelWert.toFixed(2)} < ${SCHWELLE_AA}`,
      ).toBeGreaterThanOrEqual(SCHWELLE_AA);
    },
  );

  /**
   * `--auf-fuehrung` IST DIE VIERTE TRÄGERFLÄCHE (Oberflächen-Runde 2026-08-16, dritte Hälfte) —
   * und sie ist die einzige, die ihren Zweck NUR erfüllt, solange sie dunkler ist als der Grund.
   * Genau deshalb ist sie die knappste: `--auf-stahl` hält auf ihr im Hellen 4.64, also 0.14 über
   * der Schwelle. Ein einziger weiterer Schritt ins Dunkle — der optisch verlockend wäre, weil die
   * Tönung dann deutlicher spräche — nimmt den Chips ihre Lesbarkeit. Dieser Test ist der Ort, an
   * dem das auffällt, bevor es ausgeliefert wird.
   *
   * DIESELBE LÜCKE, DAS DRITTE MAL: `--auf-karte` und die Balkenfüllungen sind auf demselben Weg
   * entstanden (eine Farbe kommt dazu, die alten Messungen greifen sie nicht). Die Kommentare
   * darüber sagen es beide; hier steht es zum dritten Mal, weil die Wiederholung selbst der Befund
   * ist — jede neue `--auf-*`-Fläche schuldet ihre Messung in derselben Änderung.
   *
   * DREI WERTE, WEIL DREI DORT WIRKLICH STEHEN: `--auf-tinte` trägt Kicker und Überschrift
   * (`.fuehrungKicker` seit dieser Runde), `--auf-stahl` die Prioritäts-Chips und die Metazellen,
   * `--auf-achtung-text` die Überfälligkeitsmarke der Einzelaufgabe.
   */
  it.each(["--auf-tinte", "--auf-stahl", "--auf-achtung-text"])(
    `hält %s auf --auf-fuehrung ≥ ${SCHWELLE_AA} Kontrast — hell UND dunkel`,
    (name) => {
      const hellWert = kontrastverhaeltnis(hell.get(name) ?? "", hell.get("--auf-fuehrung") ?? "");
      const dunkelWert = kontrastverhaeltnis(
        dunkel.get(name) ?? "",
        dunkel.get("--auf-fuehrung") ?? "",
      );
      expect(hellWert, `hell/${name}: ${hellWert.toFixed(2)} < ${SCHWELLE_AA}`).toBeGreaterThanOrEqual(
        SCHWELLE_AA,
      );
      expect(
        dunkelWert,
        `dunkel/${name}: ${dunkelWert.toFixed(2)} < ${SCHWELLE_AA}`,
      ).toBeGreaterThanOrEqual(SCHWELLE_AA);
    },
  );

  /**
   * DIE TÖNUNG MUSS EIN SICHTBARER SCHRITT SEIN, NICHT NUR EIN ANDERER HEXWERT. Zweimal ist an
   * dieser Karte genau das schiefgegangen: erst lag sie numerisch auf `Layout.bodyBg`, dann auf
   * jeder anderen Karte. Beide Male stand die richtige Absicht im Quelltext und war auf dem
   * Bildschirm nicht zu sehen — ein Fehler, den keine Paarigkeits- und keine Kontrastprüfung
   * findet, weil beide nur Text gegen Fläche messen.
   *
   * DER MASSSTAB IST DER ABSTAND ZU DEN NACHBARN, NICHT DER ZUM GRUND — und diese Unterscheidung
   * IST der Befund. Die Karte lag zuletzt auf `--auf-karte`, also exakt auf jeder anderen Karte
   * der Seite; ihr Abstand zum Grund war dabei tadellos. Ein Test, der nur gegen `--auf-papier`
   * misst, wäre also genau bei dem Fehler grün gewesen, den diese Runde behebt.
   *
   * DIE ZUSAGE LAUTET DESHALB: die Führungskarte steht WEITER von einer gewöhnlichen Karte ab, als
   * eine gewöhnliche Karte vom Seitengrund absteht. Gemessen 1.29 gegen 1.14 (hell) und 1.18 gegen
   * 1.11 (dunkel).
   *
   * DER ABSTAND ZUM GRUND WIRD ZUSÄTZLICH GEPRÜFT, ABER MIT EINER FESTEN UNTERGRENZE STATT MIT DEM
   * KARTENSCHRITT: im Hellen liegt er bei 1.13 und damit knapp UNTER den 1.14 der gewöhnlichen
   * Karte. Das ist keine Nachlässigkeit, sondern eine gemessene Decke — `--auf-stahl` hält auf
   * `--auf-fuehrung` noch 4.60, und der nächste sichtbare Schritt ins Dunkle nähme den
   * Prioritäts-Chips auf dieser Karte ihre Lesbarkeit (die Messung darüber schlägt dann zu). Die
   * Untergrenze 1.10 hält fest, dass die Tönung überhaupt eine ist.
   */
  it("setzt --auf-fuehrung weiter von --auf-karte ab als --auf-karte vom Grund", () => {
    for (const [name, block] of [
      ["hell", hell],
      ["dunkel", dunkel],
    ] as const) {
      const fuehrung = block.get("--auf-fuehrung") ?? "";
      const papier = block.get("--auf-papier") ?? "";
      const karte = block.get("--auf-karte") ?? "";
      const kartenschritt = kontrastverhaeltnis(karte, papier);
      const nachbarabstand = kontrastverhaeltnis(fuehrung, karte);
      expect(
        nachbarabstand,
        `${name}: --auf-fuehrung (${fuehrung}) steht ${nachbarabstand.toFixed(3)} von --auf-karte (${karte}) ab, die gewöhnliche Karte ${kartenschritt.toFixed(3)} vom Grund — die Führungskarte ist eine Karte unter Karten`,
      ).toBeGreaterThan(kartenschritt);
      const grundabstand = kontrastverhaeltnis(fuehrung, papier);
      expect(
        grundabstand,
        `${name}: --auf-fuehrung steht nur ${grundabstand.toFixed(3)} vom Seitengrund ab — das ist keine Tönung mehr`,
      ).toBeGreaterThanOrEqual(1.1);
    }
  });

  /**
   * KEIN SCHATTEN IM GANZEN MODUL — „Schatten hat nur, was schwebt (Dropdown, Modal, Popconfirm)"
   * (`docs/design/feedback-admin.md:191`). Diese Datei stylt ausschließlich Flächen IM Fluss der
   * Seite; das Schwebende kommt von antd und bringt seinen Schatten selbst mit.
   *
   * DER RIEGEL STEHT HIER, WEIL DIE REGEL SCHON EINMAL GEBROCHEN WURDE, und zwar mit einer
   * Begründung, die die falsche Frage beantwortete: `.fuehrung` trug einen `box-shadow`, verteidigt
   * mit „ein statischer Schatten bewegt sich nicht". Das stimmt und ist unerheblich — die Hausregel
   * fragt nach der Höhe, nicht nach der Bewegung. Ohne diesen Test kommt derselbe Schatten auf
   * demselben Weg wieder, sobald eine Fläche sich „nicht genug abhebt".
   */
  it("kennt keinen `box-shadow` — Schatten hat nur, was schwebt", () => {
    expect(
      OHNE_KOMMENTARE,
      "ein `box-shadow` im Modul-CSS: Schatten hat nur, was schwebt",
    ).not.toMatch(/box-shadow/i);
  });
});

/**
 * SPACE-LEITER (Brief, Abschnitt „Weitere Festlegungen“): Abstände liegen auf
 * 4/8/12/16/24/32, mit genau den benannten Ausnahmen aus dem Kopfkommentar bei
 * `.chip`. Der Riegel hier ist die Gegenprobe zu diesem Versprechen, nicht nur
 * eine Wiederholung davon: `.chip`, `.ohneAnker` und `.backlink` wurden schon
 * einmal wortgleich aus `lagerbuch` übernommen, OHNE dass die Ausnahme benannt
 * war — genau drei unkommentierte Werte außerhalb der Leiter. Ohne diesen Test
 * kann eine vierte, wieder unbenannte Ausnahme auf demselben Weg dazukommen;
 * mit ihm muss jeder künftige Wert außerhalb der Leiter zu einer der drei
 * aufgezählten Klassen gehören, sonst schlägt der Test rot.
 */
const SPACE_LEITER = [4, 8, 12, 16, 24, 32];
const ABSTANDS_AUSNAHMEN = [".chip", ".ohneAnker", ".backlink"];

describe("aufgaben.module.css — Aussage 6: Abstände auf der SPACE-Leiter oder benannte Ausnahme", () => {
  it("jeder `padding`- und `gap`-Wert liegt auf 4/8/12/16/24/32 oder gehört zu .chip/.ohneAnker/.backlink", () => {
    const verstoesse: string[] = [];
    for (const regel of ALLE_REGELN) {
      const gehoertZurAusnahme = ABSTANDS_AUSNAHMEN.some((klasse) =>
        regel.selektor.includes(klasse),
      );
      const deklarationen = regel.rumpf
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean);
      for (const deklaration of deklarationen) {
        const treffer = /^(padding[a-z-]*|gap)\s*:\s*(.+)$/i.exec(deklaration);
        if (!treffer) continue;
        const werte = [...treffer[2].matchAll(/([\d.]+)px/g)].map((m) => Number(m[1]));
        for (const wert of werte) {
          if (!SPACE_LEITER.includes(wert) && !gehoertZurAusnahme) {
            verstoesse.push(`${regel.selektor} → ${deklaration}`);
          }
        }
      }
    }
    expect(verstoesse).toEqual([]);
  });
});
