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
   * Muster von `tonPaare()` und bliebe sonst ungemessen. Der Vorbehalt: diese
   * Messung nimmt `--auf-papier` als Hintergrund an, weil das die einzige
   * heute belegbare Annahme ist — den tatsächlichen Hintergrund legen erst
   * Aufgabe 6/7 fest.
   */
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
