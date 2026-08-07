import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { SCHRIFT } from "./schrift";

/** antds Leiter (docs/design/README.md:149-152). Eine dritte Skala waere der Fehler. */
const LEITER = [12, 14, 16, 20, 24, 30];

describe("SCHRIFT: sieben Rollen auf antds Leiter", () => {
  it("entspricht dem vollstaendigen Rollenvertrag — keine vertauschten oder zusaetzlichen Felder", () => {
    expect(SCHRIFT).toEqual({
      titel: {
        fontSize: 24,
        fontWeight: 600,
        letterSpacing: "0.02em",
        lineHeight: 1.2,
      },
      abschnitt: {
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.09em",
        textTransform: "uppercase",
      },
      feldname: {
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.09em",
        textTransform: "uppercase",
      },
      text: { fontSize: 14 },
      neben: { fontSize: 12 },
      zahl: {
        fontSize: 24,
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1,
      },
      mono: {
        fontFamily: "var(--font-geist-mono)",
        fontSize: 12,
        fontVariantNumeric: "tabular-nums",
      },
    });
  });

  it("jede fontSize liegt auf der Leiter — keine Halbpixelwerte", () => {
    for (const [rolle, stil] of Object.entries(SCHRIFT)) {
      expect(LEITER, `${rolle}: ${stil.fontSize}`).toContain(stil.fontSize);
    }
  });

  it("Zahlenrollen tragen tabular-nums", () => {
    expect(SCHRIFT.zahl.fontVariantNumeric).toBe("tabular-nums");
    expect(SCHRIFT.mono.fontVariantNumeric).toBe("tabular-nums");
  });

  it("die Strukturrollen tragen Versalien plus Laufweite statt einer zweiten Familie", () => {
    for (const rolle of ["abschnitt", "feldname"] as const) {
      expect(SCHRIFT[rolle].textTransform, rolle).toBe("uppercase");
      expect(SCHRIFT[rolle].letterSpacing, rolle).toBeTruthy();
      expect(SCHRIFT[rolle].fontWeight, rolle).toBe(600);
    }
  });

});

type CssParent = { parent?: CssParent; type: string; selector?: string };
type CssDeclaration = { parent?: CssParent; prop: string; value: string };
type CssRoot = { walkDecls(callback: (deklaration: CssDeclaration) => void): void };
type PostCss = { parse(quelle: string, optionen: { from: string }): CssRoot };
type ValueNode = { type: string; value: string };
type ValueParser = (wert: string) => { nodes: ValueNode[] };

/*
 * Next 16 fuehrt PostCSS als direkte Abhaengigkeit. Der Projekt-Resolver sieht
 * die transitive pnpm-Abhaengigkeit absichtlich nicht; deshalb wird er am
 * REALEN Installationsort von `next/package.json` verankert. Im Quelltext
 * steht dadurch kein versionierter `.pnpm`-Pfad. Verwendet werden nur die
 * oeffentlichen PostCSS-APIs `parse()` und `Root#walkDecls()`; fuer die
 * Kurzschrift zerlegt Nexts gebuendelter `postcss-value-parser` den Wert in
 * echte Tokens, sodass eine Familienzeichenkette nicht als Groesze gilt.
 */
const projektRequire = createRequire(join(process.cwd(), "package.json"));
const nextRequire = createRequire(realpathSync(projektRequire.resolve("next/package.json")));
const postcss = nextRequire("postcss") as PostCss;
const parseValue = projektRequire("next/dist/compiled/postcss-value-parser") as ValueParser;

const REM_IN_PX = 16;

function groeszeInPx(wert: string): number | undefined {
  const treffer = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(px|rem)$/i.exec(wert.trim());
  if (!treffer) return undefined;
  const zahl = Number(treffer[1]);
  if (!Number.isFinite(zahl)) return undefined;
  return treffer[2]!.toLowerCase() === "rem" ? zahl * REM_IN_PX : zahl;
}

function schriftgroesze(deklaration: CssDeclaration): string | undefined {
  if (deklaration.prop.toLowerCase() === "font-size") return deklaration.value.trim();
  if (deklaration.prop.toLowerCase() !== "font") return undefined;

  // In der Kurzschrift steht die Groesze vor dem optionalen `/line-height`.
  // Nur einfache px/rem sind hier beweisbar. calc(), var(), em, Prozent und
  // Schluesselwoerter werden unten ausdruecklich als unaufloesbar gemeldet.
  const knoten = parseValue(deklaration.value).nodes;
  const trennstrich = knoten.findIndex((knoten) => knoten.type === "div" && knoten.value === "/");
  const vorZeilenhoehe = trennstrich === -1 ? knoten : knoten.slice(0, trennstrich);
  return vorZeilenhoehe.find((knoten) =>
    knoten.type === "word" && /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(px|rem)$/i.test(knoten.value),
  )?.value;
}

/*
 * Nur echte Element-Tokens und antds exakte Selektorklasse. Die Begrenzungen
 * lassen `input[type]`, `form > input:hover` und `:is(input)` zu, aber weder
 * `.input-hinweis` noch `.ant-select-selector-extra`.
 */
const FELD_SELEKTOR =
  /(^|[\s>+~,(])(?:input|textarea|select)(?=$|[\s>+~.#:[\]),])|\.ant-select-selector(?=$|[\s>+~.#:[\]),])/;

function feldSelektorKette(deklaration: CssDeclaration): string | undefined {
  const selektoren: string[] = [];
  let vorfahr = deklaration.parent;
  while (vorfahr) {
    if (vorfahr.type === "rule" && vorfahr.selector) {
      selektoren.unshift(vorfahr.selector);
      if (FELD_SELEKTOR.test(vorfahr.selector)) return selektoren.join(" ");
    }
    vorfahr = vorfahr.parent;
  }
  return undefined;
}

function alleCss(verzeichnis: string): string[] {
  const treffer: string[] = [];
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) treffer.push(...alleCss(pfad));
    else if (pfad.endsWith(".css")) treffer.push(pfad);
  }
  return treffer;
}

function pruefeCss(quelle: string, datei = "fixture.css"): string[] {
  const verstoesze: string[] = [];
  let wurzel: CssRoot;
  try {
    wurzel = postcss.parse(quelle, { from: datei });
  } catch (error) {
    const meldung = error instanceof Error ? error.message : String(error);
    return [`${datei}: ungueltiges CSS: ${meldung}`];
  }

  wurzel.walkDecls((deklaration) => {
    if (!/^(font-size|font)$/i.test(deklaration.prop)) return;
    const selektor = feldSelektorKette(deklaration);
    if (!selektor) return;

    const wert = schriftgroesze(deklaration);
    const px = wert === undefined ? undefined : groeszeInPx(wert);
    if (px === undefined) {
      verstoesze.push(
        `${datei}: ${selektor} → Groesze nicht sicher aufloesbar: ${deklaration.value}`,
      );
    } else if (px < 16) {
      verstoesze.push(`${datei}: ${selektor} → ${px}px`);
    }
  });
  return verstoesze;
}

describe("CSS-AST-Fixtures fuer den 16px-Guard", () => {
  it.each([
    ["font-size in px", "input { font-size: 14px; }"],
    ["font-size in rem", "input { font-size: .875rem; }"],
    ["font-Kurzform in px", "input { font: 500 14px/1 sans-serif; }"],
    ["font-Kurzform in rem", "input { font: 500 .875rem/1 sans-serif; }"],
  ])("meldet 14px aus %s", (_name, css) => {
    expect(pruefeCss(css)).toEqual(["fixture.css: input → 14px"]);
  });

  it.each([
    [
      "At-Regel im Feldselektor",
      "input { @media (max-width: 600px) { font-size: .875rem; } }",
      "fixture.css: input → 14px",
    ],
    [
      "relativer Selektor im Feldselektor",
      "input { &.kompakt { font: 500 14px/1 sans-serif; } }",
      "fixture.css: input &.kompakt → 14px",
    ],
  ])("meldet 14px aus verschachteltem %s", (_name, css, meldung) => {
    expect(pruefeCss(css)).toEqual([meldung]);
  });

  it("verwechselt verwandte Klassennamen nicht mit Eingabefeldern", () => {
    expect(pruefeCss(`
      .input-hinweis { font-size: 14px; }
      .select-kompakt { font: 500 14px/1 sans-serif; }
      .textarea-info { font-size: .875rem; }
      .ant-select-selector-extra { font-size: 14px; }
    `)).toEqual([]);
  });

  it.each([
    ["blockloses @layer", "@layer lagerbuch;"],
    ["@font-face", '@font-face { font-family: Lagerbuch; src: url("lager{buch}.woff2"); }'],
    ["@property", '@property --abstand { syntax: "<length>"; inherits: false; initial-value: 1rem; }'],
    ["Klammer und Escape im String", String.raw`.hinweis::before { content: "geschweift \}"; }`],
  ])("akzeptiert gueltiges CSS: %s", (_name, css) => {
    expect(pruefeCss(css)).toEqual([]);
  });

  it.each([
    ["font-size", "input { font-size: var(--feldschrift); }", "var(--feldschrift)"],
    ["font", "input { font: 500 calc(1rem - 1px)/1 sans-serif; }", "500 calc(1rem - 1px)/1 sans-serif"],
  ])("meldet unaufloesbares %s, statt es still passieren zu lassen", (_name, css, wert) => {
    expect(pruefeCss(css)).toEqual([
      `fixture.css: input → Groesze nicht sicher aufloesbar: ${wert}`,
    ]);
  });

  it("akzeptiert die Untergrenze in beiden Einheiten und Schreibweisen", () => {
    expect(pruefeCss(`
      input { font-size: 16px; }
      textarea { font-size: 1rem; }
      select { font: 500 16px/1 sans-serif; }
      .ant-select-selector { font: 500 1rem/1 sans-serif; }
    `)).toEqual([]);
  });

  it("meldet ungueltiges CSS weiterhin ausdruecklich", () => {
    expect(pruefeCss("input { font-size: 16px;")).toEqual([
      expect.stringContaining("fixture.css: ungueltiges CSS:"),
    ]);
  });
});

describe("Kein Eingabefeld unter 16px im ganzen Modul", () => {
  it("kein Selektor unter m/lagerbuch setzt <16px auf ein Eingabeelement", () => {
    const verstoesze: string[] = [];
    for (const datei of alleCss("src/app/m/lagerbuch")) {
      verstoesze.push(...pruefeCss(
        readFileSync(datei, "utf8"),
        relative("src/app/m/lagerbuch", datei),
      ));
    }
    expect(verstoesze).toEqual([]);
  });
});
