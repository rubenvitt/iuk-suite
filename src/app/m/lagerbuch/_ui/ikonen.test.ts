import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { PFADE, type IkonName } from "./ikonen";

const WURZEL = "src/app/m/lagerbuch";
const IKON_NAMEN = new Set(Object.keys(PFADE));

function alleDateien(verzeichnis: string, endungen: string[]): string[] {
  const treffer: string[] = [];
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) treffer.push(...alleDateien(pfad, endungen));
    else if (endungen.some((e) => pfad.endsWith(e))) treffer.push(pfad);
  }
  return treffer;
}

type BefundArt =
  | "verbotener-import"
  | "rohes-svg"
  | "unbekannter-ikon-name"
  | "unsichere-ikon-assertion";

type Befund = {
  art: BefundArt;
  detail: string;
};

type AnalyseOptionen = {
  erlaubtRohesSvg?: boolean;
};

/**
 * DER EINE AST-RIEGEL fuer echte Moduldateien UND die Negativ-Fixtures.
 *
 * Textregexe koennen weder Kommentare von Code noch die gueltigen Formen der
 * TypeScript-/JSX-Grammatik zuverlaessig unterscheiden. Die Compiler-API
 * liefert dagegen Import-, Call- und JSX-Knoten und ignoriert Kommentare von
 * selbst. Lokale `const`-Aliase werden lexikalisch gegen die naechste sichtbare
 * Deklaration aufgeloest; ein Alias in einem inneren Block kann deshalb keinen
 * gleichnamigen aeusseren Alias falsch ueberschreiben.
 */
function analysiereQuelle(
  dateiname: string,
  quelle: string,
  optionen: AnalyseOptionen = {},
): Befund[] {
  const source = ts.createSourceFile(
    dateiname,
    quelle,
    ts.ScriptTarget.Latest,
    true,
    dateiname.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const befunde: Befund[] = [];
  const konstante = new Map<string, ts.VariableDeclaration[]>();
  const ikoneNamen = new Set<string>();
  const ikoneNamensraeume = new Set<string>();
  const createElementNamen = new Set(["createElement"]);
  const reactNamensraeume = new Set(["React"]);

  function ort(node: ts.Node): string {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    return `${dateiname}:${line + 1}:${character + 1}`;
  }

  function scopeVon(node: ts.Node): ts.Node {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isBlock(p) || ts.isSourceFile(p)) return p;
    }
    return source;
  }

  function istInScope(scope: ts.Node, node: ts.Node): boolean {
    for (let p: ts.Node | undefined = node; p; p = p.parent) if (p === scope) return true;
    return false;
  }

  function tiefe(node: ts.Node): number {
    let n = 0;
    for (let p: ts.Node | undefined = node; p; p = p.parent) n++;
    return n;
  }

  function sammle(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      ts.isVariableDeclarationList(node.parent) &&
      (node.parent.flags & ts.NodeFlags.Const) !== 0
    ) {
      const liste = konstante.get(node.name.text) ?? [];
      liste.push(node);
      konstante.set(node.name.text, liste);
    }

    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spezifizierer = node.moduleSpecifier.text;
      if (spezifizierer === "./ikonen" && node.importClause?.namedBindings) {
        const bindungen = node.importClause.namedBindings;
        if (ts.isNamedImports(bindungen)) {
          for (const element of bindungen.elements) {
            if ((element.propertyName ?? element.name).text === "Ikone") {
              ikoneNamen.add(element.name.text);
            }
          }
        } else {
          ikoneNamensraeume.add(bindungen.name.text);
        }
      }
      if (spezifizierer === "react" && node.importClause?.namedBindings) {
        const bindungen = node.importClause.namedBindings;
        if (ts.isNamedImports(bindungen)) {
          for (const element of bindungen.elements) {
            if ((element.propertyName ?? element.name).text === "createElement") {
              createElementNamen.add(element.name.text);
            }
          }
        } else {
          reactNamensraeume.add(bindungen.name.text);
        }
      }
      if (spezifizierer === "react" && node.importClause?.name) {
        reactNamensraeume.add(node.importClause.name.text);
      }
    }

    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteral(node.moduleReference.expression) &&
      node.moduleReference.expression.text === "./ikonen"
    ) {
      ikoneNamensraeume.add(node.name.text);
    }
    ts.forEachChild(node, sammle);
  }
  sammle(source);

  function deklarationFuer(name: string, nutzung: ts.Node): ts.VariableDeclaration | undefined {
    return (konstante.get(name) ?? [])
      .filter((d) => d.pos < nutzung.pos && istInScope(scopeVon(d), nutzung))
      .sort((a, b) => tiefe(scopeVon(b)) - tiefe(scopeVon(a)))[0];
  }

  function stringWert(
    ausdruck: ts.Expression | undefined,
    gesehen = new Set<ts.VariableDeclaration>(),
  ): string | undefined {
    if (!ausdruck) return undefined;
    if (ts.isStringLiteral(ausdruck) || ts.isNoSubstitutionTemplateLiteral(ausdruck)) {
      return ausdruck.text;
    }
    if (
      ts.isParenthesizedExpression(ausdruck) ||
      ts.isAsExpression(ausdruck) ||
      ts.isSatisfiesExpression(ausdruck) ||
      ts.isTypeAssertionExpression(ausdruck) ||
      ts.isNonNullExpression(ausdruck)
    ) {
      return stringWert(ausdruck.expression, gesehen);
    }
    if (ts.isIdentifier(ausdruck)) {
      const deklaration = deklarationFuer(ausdruck.text, ausdruck);
      if (!deklaration?.initializer || gesehen.has(deklaration)) return undefined;
      const danach = new Set(gesehen);
      danach.add(deklaration);
      return stringWert(deklaration.initializer, danach);
    }
    return undefined;
  }

  function istVerboteneQuelle(spezifizierer: string): boolean {
    return (
      spezifizierer === "@ant-design/icons" ||
      spezifizierer.startsWith("@ant-design/icons/") ||
      spezifizierer === "lucide-react" ||
      spezifizierer.startsWith("lucide-react/") ||
      spezifizierer === "@/core/shell/icons" ||
      /(?:^|\/)core\/shell\/icons(?:$|\/)/.test(spezifizierer)
    );
  }

  function importPruefen(ausdruck: ts.Expression | undefined, node: ts.Node) {
    const spezifizierer = stringWert(ausdruck);
    if (spezifizierer && istVerboteneQuelle(spezifizierer)) {
      befunde.push({
        art: "verbotener-import",
        detail: `${ort(node)} importiert ${JSON.stringify(spezifizierer)}`,
      });
    }
  }

  function istIkoneTag(tag: ts.JsxTagNameExpression): boolean {
    if (ts.isIdentifier(tag)) return ikoneNamen.has(tag.text);
    return (
      ts.isPropertyAccessExpression(tag) &&
      ts.isIdentifier(tag.expression) &&
      ikoneNamensraeume.has(tag.expression.text) &&
      tag.name.text === "Ikone"
    );
  }

  function istIkonNameTyp(typ: ts.TypeNode): boolean {
    return /(?:^|\.)IkonName$/.test(typ.getText(source).replace(/\s/g, ""));
  }

  function unsichereAssertion(
    ausdruck: ts.Expression,
    gesehen = new Set<ts.VariableDeclaration>(),
  ): ts.Node | undefined {
    if (ts.isParenthesizedExpression(ausdruck) || ts.isNonNullExpression(ausdruck)) {
      return unsichereAssertion(ausdruck.expression, gesehen);
    }
    if (
      (ts.isAsExpression(ausdruck) || ts.isTypeAssertionExpression(ausdruck)) &&
      istIkonNameTyp(ausdruck.type)
    ) {
      return stringWert(ausdruck.expression) === undefined ? ausdruck : undefined;
    }
    if (ts.isSatisfiesExpression(ausdruck)) {
      // `satisfies` prueft dynamische Werte wirklich; nur sein Literal muss
      // unten gegen die Laufzeit-Tabelle PFADE abgeglichen werden. Eine darin
      // versteckte `as IkonName`-Assertion bleibt dagegen unsicher.
      return unsichereAssertion(ausdruck.expression, gesehen);
    }
    if (ts.isIdentifier(ausdruck)) {
      const deklaration = deklarationFuer(ausdruck.text, ausdruck);
      if (!deklaration?.initializer || gesehen.has(deklaration)) return undefined;
      const danach = new Set(gesehen);
      danach.add(deklaration);
      return unsichereAssertion(deklaration.initializer, danach);
    }
    return undefined;
  }

  function ikonNamePruefen(element: ts.JsxOpeningLikeElement) {
    const attribut = element.attributes.properties.find(
      (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(source) === "name",
    );
    if (!attribut?.initializer) return;

    const ausdruck = ts.isStringLiteral(attribut.initializer)
      ? attribut.initializer
      : ts.isJsxExpression(attribut.initializer)
        ? attribut.initializer.expression
        : undefined;
    const literal = stringWert(ausdruck);
    if (literal !== undefined && !IKON_NAMEN.has(literal)) {
      befunde.push({
        art: "unbekannter-ikon-name",
        detail: `${ort(attribut)} kennt ${JSON.stringify(literal)} nicht`,
      });
      return;
    }
    if (ausdruck) {
      const assertion = unsichereAssertion(ausdruck);
      if (assertion) {
        befunde.push({
          art: "unsichere-ikon-assertion",
          detail: `${ort(assertion)} erzwingt IkonName aus einem nicht aufloesbaren Wert`,
        });
      }
    }
  }

  function svgTagPruefen(tag: ts.JsxTagNameExpression, node: ts.Node) {
    if (optionen.erlaubtRohesSvg || !ts.isIdentifier(tag)) return;
    if (tag.text === "svg" || stringWert(tag) === "svg") {
      befunde.push({ art: "rohes-svg", detail: `${ort(node)} erzeugt ein natives SVG` });
    }
  }

  function besuche(node: ts.Node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      importPruefen(node.moduleSpecifier, node);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      importPruefen(node.moduleReference.expression, node);
    } else if (ts.isCallExpression(node)) {
      const istDynamischerImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const istRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (istDynamischerImport || istRequire) importPruefen(node.arguments[0], node);

      const istCreateElement =
        (ts.isIdentifier(node.expression) && createElementNamen.has(node.expression.text)) ||
        (ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          reactNamensraeume.has(node.expression.expression.text) &&
          node.expression.name.text === "createElement");
      if (
        !optionen.erlaubtRohesSvg &&
        istCreateElement &&
        stringWert(node.arguments[0]) === "svg"
      ) {
        befunde.push({ art: "rohes-svg", detail: `${ort(node)} erzeugt ein natives SVG` });
      }
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      svgTagPruefen(node.tagName, node);
      if (istIkoneTag(node.tagName)) ikonNamePruefen(node);
    }
    ts.forEachChild(node, besuche);
  }
  besuche(source);
  return befunde;
}

function modulBefunde(): Befund[] {
  return alleDateien(WURZEL, [".ts", ".tsx"]).flatMap((datei) =>
    analysiereQuelle(relative(WURZEL, datei), readFileSync(datei, "utf8"), {
      erlaubtRohesSvg: datei.endsWith("/_ui/ikonen.tsx"),
    }),
  );
}

/**
 * DER MODUL-EIGENE RIEGEL — UND WARUM DER VORHANDENE NICHT REICHT.
 *
 * `core/shell/icons.test.ts` erlaubt antd-Icons in einer Client-Insel. Die
 * Lagerbuch-Regel geht weiter: kein fremdes Zeichenpaket im ganzen Modul, keine
 * zweite lokale SVG-Quelle und kein Laufzeitname ausserhalb von PFADE.
 */
describe("Ikonen-Riegel: AST statt Textregex", () => {
  const dateien = alleDateien(WURZEL, [".ts", ".tsx"]);
  const befunde = modulBefunde();

  it("findet ueberhaupt Dateien (sonst prueft der Scan nichts)", () => {
    expect(dateien.length).toBeGreaterThan(10);
  });

  it("findet keinen verbotenen statischen, dynamischen oder require-Import", () => {
    expect(befunde.filter((b) => b.art === "verbotener-import").map((b) => b.detail)).toEqual([]);
  });

  it("nur ikonen.tsx erzeugt ein natives SVG", () => {
    expect(befunde.filter((b) => b.art === "rohes-svg").map((b) => b.detail)).toEqual([]);
  });

  it("jeder literal benutzte IkonName existiert und keine unsichere Assertion umgeht die Union", () => {
    expect(
      befunde
        .filter((b) => b.art === "unbekannter-ikon-name" || b.art === "unsichere-ikon-assertion")
        .map((b) => b.detail),
    ).toEqual([]);
  });

  it("ikonen.tsx traegt weder Import noch use-client-Direktive", () => {
    const quelle = readFileSync(join(WURZEL, "_ui/ikonen.tsx"), "utf8");
    const source = ts.createSourceFile("ikonen.tsx", quelle, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    expect(
      source.statements.filter(ts.isImportDeclaration).length +
        source.statements.filter(ts.isImportEqualsDeclaration).length,
    ).toBe(0);
    expect(
      source.statements.some(
        (s) =>
          ts.isExpressionStatement(s) &&
          ts.isStringLiteral(s.expression) &&
          s.expression.text === "use client",
      ),
    ).toBe(false);
  });
});

describe("Ikonen: die Union ist die Autoritaet", () => {
  it("fuehrt genau 36 Namen", () => {
    expect(Object.keys(PFADE)).toHaveLength(36);
  });

  it("fuehrt die acht Fachzeichen namentlich", () => {
    const fach: IkonName[] = [
      "warnung",
      "medizin",
      "objekt",
      "sauerstoff",
      "akku",
      "verfall",
      "handlager-griff",
      "fahrzeug",
    ];
    for (const name of fach) expect(PFADE[name], name).toBeTruthy();
  });

  it("jeder Pfad ist ein nicht leeres `d`-Attribut", () => {
    for (const [name, d] of Object.entries(PFADE)) {
      expect(typeof d, name).toBe("string");
      expect(d.trim().length, name).toBeGreaterThan(4);
      expect(d, `${name} beginnt nicht mit einem Move-Befehl`).toMatch(/^[Mm]/);
    }
  });

  it("kein Pfad ist doppelt vergeben", () => {
    const werte = Object.values(PFADE);
    expect(new Set(werte).size).toBe(werte.length);
  });
});

describe("AST-Riegel — dieselbe Analyse fuer reale Dateien und Negativ-Fixtures", () => {
  const faelle: {
    name: string;
    quelle: string;
    erwartet: BefundArt | null;
  }[] = [
    { name: "Side-Effect-Import", quelle: 'import "@ant-design/icons";', erwartet: "verbotener-import" },
    { name: "dynamischer Import", quelle: 'void import("lucide-react");', erwartet: "verbotener-import" },
    { name: "require", quelle: 'require("@/core/shell/icons");', erwartet: "verbotener-import" },
    {
      name: "import equals",
      quelle: 'import Icons = require("@ant-design/icons");',
      erwartet: "verbotener-import",
    },
    {
      name: "Export-Import",
      quelle: 'export { X } from "lucide-react";',
      erwartet: "verbotener-import",
    },
    {
      name: "const-aliasierter Spezifizierer",
      quelle: 'const paket = "@ant-design/icons"; void import(paket);',
      erwartet: "verbotener-import",
    },
    {
      name: "const-aliasierter require-Spezifizierer",
      quelle: 'const paket = "lucide-react"; require(paket);',
      erwartet: "verbotener-import",
    },
    {
      name: "kommentierter Scheinimport",
      quelle: '// import { X } from "@ant-design/icons";',
      erwartet: null,
    },
    { name: "SVG-Tagalias", quelle: 'const Svg = "svg"; <Svg />;', erwartet: "rohes-svg" },
    { name: "createElement-SVG", quelle: 'createElement("svg", {});', erwartet: "rohes-svg" },
    { name: "React.createElement-SVG", quelle: 'React.createElement("svg", {});', erwartet: "rohes-svg" },
    {
      name: "benannter React-createElement-Alias",
      quelle: 'import { createElement as h } from "react"; h("svg", {});',
      erwartet: "rohes-svg",
    },
    {
      name: "React-Namespace-Alias",
      quelle: 'import * as R from "react"; R.createElement("svg", {});',
      erwartet: "rohes-svg",
    },
    {
      name: "React-Defaultimport-Alias",
      quelle: 'import R from "react"; R.createElement("svg", {});',
      erwartet: "rohes-svg",
    },
    {
      name: "const-aliasiertes createElement-SVG",
      quelle: 'const tag = "svg"; React.createElement(tag, {});',
      erwartet: "rohes-svg",
    },
    {
      name: "Leerraum um name",
      quelle: 'import { Ikone } from "./ikonen"; <Ikone name = "warnungg" />;',
      erwartet: "unbekannter-ikon-name",
    },
    {
      name: "JSX-Ausdruck als Literal",
      quelle: 'import { Ikone } from "./ikonen"; <Ikone name={"warnungg"} />;',
      erwartet: "unbekannter-ikon-name",
    },
    {
      name: "unsichere as-Assertion mit Literal",
      quelle: 'import { Ikone } from "./ikonen"; <Ikone name={"warnungg" as IkonName} />;',
      erwartet: "unbekannter-ikon-name",
    },
    {
      name: "unsichere as-Assertion mit dynamischem Wert",
      quelle: 'import { Ikone } from "./ikonen"; <Ikone name={wert as IkonName} />;',
      erwartet: "unsichere-ikon-assertion",
    },
    {
      name: "const-aliasierte unsichere as-Assertion",
      quelle: 'import { Ikone } from "./ikonen"; const name = wert as IkonName; <Ikone name={name} />;',
      erwartet: "unsichere-ikon-assertion",
    },
    {
      name: "satisfies-Literal",
      quelle: 'import { Ikone } from "./ikonen"; <Ikone name={"warnungg" satisfies IkonName} />;',
      erwartet: "unbekannter-ikon-name",
    },
    {
      name: "satisfies darf eine innere as-Assertion nicht waschen",
      quelle: 'import { Ikone } from "./ikonen"; <Ikone name={(wert as IkonName) satisfies IkonName} />;',
      erwartet: "unsichere-ikon-assertion",
    },
    {
      name: "benannter Ikone-Importalias",
      quelle: 'import { Ikone as Zeichen } from "./ikonen"; <Zeichen name="warnungg" />;',
      erwartet: "unbekannter-ikon-name",
    },
    {
      name: "Ikone-Namespace-Import",
      quelle: 'import * as Icons from "./ikonen"; <Icons.Ikone name="warnungg" />;',
      erwartet: "unbekannter-ikon-name",
    },
    {
      name: "gueltiger dynamischer IkonName bleibt TypeScript-Aufgabe",
      quelle: 'import { Ikone, type IkonName } from "./ikonen"; const name: IkonName = wert; <Ikone name={name} />;',
      erwartet: null,
    },
    {
      name: "dynamisches satisfies bleibt TypeScript-Aufgabe",
      quelle: 'import { Ikone, type IkonName } from "./ikonen"; <Ikone name={wert satisfies IkonName} />;',
      erwartet: null,
    },
  ];

  for (const fall of faelle) {
    it(fall.name, () => {
      const befunde = analysiereQuelle(`${fall.name}.tsx`, fall.quelle);
      if (fall.erwartet === null) expect(befunde).toEqual([]);
      else expect(befunde.map((b) => b.art)).toContain(fall.erwartet);
    });
  }
});
