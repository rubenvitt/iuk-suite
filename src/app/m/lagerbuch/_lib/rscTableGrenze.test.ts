import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ARBEITSBEREICH = join(
  process.cwd(),
  "src/app/m/lagerbuch/verwaltung/(arbeit)",
);

function pageDateien(wurzel: string): string[] {
  if (!existsSync(wurzel)) return [];
  const dateien: string[] = [];
  for (const eintrag of readdirSync(wurzel)) {
    const pfad = join(wurzel, eintrag);
    if (statSync(pfad).isDirectory()) {
      dateien.push(...pageDateien(pfad));
    } else if (eintrag === "page.tsx") {
      dateien.push(pfad);
    }
  }
  return dateien.sort();
}

function hatUseClientDirektive(source: ts.SourceFile): boolean {
  for (const statement of source.statements) {
    if (!ts.isExpressionStatement(statement)
      || !ts.isStringLiteral(statement.expression)) return false;
    if (statement.expression.text === "use client") return true;
  }
  return false;
}

type AntdModulArt = "root" | "table";

function antdModulArt(modul: string): AntdModulArt | null {
  const root = modul.endsWith("/") ? modul.slice(0, -1) : modul;
  if (root === "antd" || /^antd\/(?:es|lib)(?:\/index(?:\.js)?)?$/.test(root)) {
    return "root";
  }
  if (/^antd\/(?:es|lib)\/table(?:\/|$)/.test(modul)) return "table";
  return null;
}

function wertBindungen(clause: ts.ImportClause): boolean {
  if (clause.name) return true;
  const bindungen = clause.namedBindings;
  if (bindungen && ts.isNamespaceImport(bindungen)) return true;
  return Boolean(bindungen && ts.isNamedImports(bindungen)
    && bindungen.elements.some((element) => !element.isTypeOnly));
}

function statischerTableImport(source: ts.SourceFile): boolean {
  return source.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)) return false;
    const art = antdModulArt(statement.moduleSpecifier.text);
    const clause = statement.importClause;
    if (!art || !clause || clause.isTypeOnly) return false;

    if (art === "table") return wertBindungen(clause);

    const bindungen = clause.namedBindings;
    if (clause.name) return true;
    if (bindungen && ts.isNamespaceImport(bindungen)) {
      return namespaceNutztTable(source, bindungen.name.text);
    }
    if (!bindungen || !ts.isNamedImports(bindungen)) return false;
    return bindungen.elements.some((element) => (
      !element.isTypeOnly
      && (element.propertyName ?? element.name).text === "Table"
    ));
  });
}

function entpackeAusdruck(node: ts.Node | undefined): ts.Node | undefined {
  let aktuell = node;
  while (aktuell) {
    if (ts.isAwaitExpression(aktuell)
      || ts.isParenthesizedExpression(aktuell)
      || ts.isAsExpression(aktuell)
      || ts.isTypeAssertionExpression(aktuell)
      || ts.isNonNullExpression(aktuell)
      || ts.isSatisfiesExpression(aktuell)) {
      aktuell = aktuell.expression;
      continue;
    }
    return aktuell;
  }
  return aktuell;
}

function ladeAufrufArt(node: ts.Node | undefined): AntdModulArt | null {
  const aktuell = entpackeAusdruck(node);
  if (!aktuell || !ts.isCallExpression(aktuell) || aktuell.arguments.length !== 1) return null;
  const istImport = aktuell.expression.kind === ts.SyntaxKind.ImportKeyword;
  const istRequire = ts.isIdentifier(aktuell.expression) && aktuell.expression.text === "require";
  if (!istImport && !istRequire) return null;
  const modul = aktuell.arguments[0];
  return ts.isStringLiteralLike(modul) ? antdModulArt(modul.text) : null;
}

function eigenschaftsName(
  node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): string | null {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  const argument = node.argumentExpression;
  return argument && ts.isStringLiteralLike(argument) ? argument.text : null;
}

function bindungHatTable(name: ts.BindingName): boolean {
  return ts.isObjectBindingPattern(name) && name.elements.some((element) => {
    const schluessel = element.propertyName ?? element.name;
    if (ts.isIdentifier(schluessel) || ts.isStringLiteralLike(schluessel)) {
      return schluessel.text === "Table";
    }
    if (ts.isComputedPropertyName(schluessel)) {
      const ausdruck = entpackeAusdruck(schluessel.expression);
      return Boolean(ausdruck && ts.isStringLiteralLike(ausdruck) && ausdruck.text === "Table");
    }
    return false;
  });
}

function namespaceNutztTable(knoten: ts.Node, namespace: string): boolean {
  let gefunden = false;
  function besuche(node: ts.Node): void {
    if (gefunden) return;
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const basis = entpackeAusdruck(node.expression);
      if (basis && ts.isIdentifier(basis)
        && basis.text === namespace
        && eigenschaftsName(node) === "Table") {
        gefunden = true;
        return;
      }
    }
    if (ts.isVariableDeclaration(node)) {
      const initialisierung = entpackeAusdruck(node.initializer);
      if (initialisierung && ts.isIdentifier(initialisierung)
        && initialisierung.text === namespace
        && bindungHatTable(node.name)) {
        gefunden = true;
        return;
      }
    }
    ts.forEachChild(node, besuche);
  }
  besuche(knoten);
  return gefunden;
}

function thenNutztTable(aufruf: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(aufruf.expression)
    || aufruf.expression.name.text !== "then"
    || ladeAufrufArt(aufruf.expression.expression) !== "root") return false;
  const callback = aufruf.arguments[0];
  if (!callback || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))) {
    return false;
  }
  const parameter = callback.parameters[0]?.name;
  if (!parameter) return false;
  if (bindungHatTable(parameter)) return true;
  return ts.isIdentifier(parameter) && namespaceNutztTable(callback.body, parameter.text);
}

function dynamischerTableZugriff(source: ts.SourceFile): boolean {
  let gefunden = false;
  function besuche(node: ts.Node): void {
    if (gefunden) return;

    if (ts.isCallExpression(node)) {
      if (ladeAufrufArt(node) === "table" || thenNutztTable(node)) {
        gefunden = true;
        return;
      }
    }

    if (ts.isVariableDeclaration(node) && node.initializer) {
      const art = ladeAufrufArt(node.initializer);
      if (art === "root" && (bindungHatTable(node.name)
        || (ts.isIdentifier(node.name) && namespaceNutztTable(source, node.name.text)))) {
        gefunden = true;
        return;
      }
    }

    if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
      && ladeAufrufArt(node.expression) === "root"
      && eigenschaftsName(node) === "Table") {
      gefunden = true;
      return;
    }

    ts.forEachChild(node, besuche);
  }
  besuche(source);
  return gefunden;
}

function verstoesseIn(quelle: string, dateiname = "probe.tsx"): string[] {
  const source = ts.createSourceFile(
    dateiname,
    quelle,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  if (hatUseClientDirektive(source)
    || (!statischerTableImport(source) && !dynamischerTableZugriff(source))) return [];
  return [dateiname];
}

describe("RSC-/antd-Tabellengrenze", () => {
  it.each([
    ["Alias aus dem Paket-Root", 'import { Table as DatenTabelle } from "antd";'],
    [
      "Namespace aus dem Paket-Root",
      'import * as Antd from "antd";\nconst t = <Antd.Table />;',
    ],
    ["Named Export aus dem ES-Root", 'import { Table } from "antd/es";'],
    ["Alias aus dem CommonJS-Root", 'import { Table as DatenTabelle } from "antd/lib";'],
    ["Named Export aus dem ES-Slash-Root", 'import { Table } from "antd/es/";'],
    [
      "Alias aus dem CommonJS-Slash-Root",
      'import { Table as DatenTabelle } from "antd/lib/";',
    ],
    [
      "Namespace aus dem ES-Root",
      'import * as Antd from "antd/es";\nconst t = Antd["Table"];',
    ],
    ["Named Export aus der ES-Rootdatei", 'import { Table } from "antd/es/index.js";'],
    ["Default aus dem ES-Table-Subpfad", 'import Tabelle from "antd/es/table";'],
    ["Default aus dem CommonJS-Table-Subpfad", 'import Tabelle from "antd/lib/table";'],
    ["dynamisch destrukturiert", 'const { Table } = await import("antd");'],
    [
      "dynamisch destrukturiert und aliasiert",
      'const { Table: DatenTabelle } = await import("antd/es");',
    ],
    [
      "dynamisch aus dem ES-Slash-Root",
      'const { Table: DatenTabelle } = await import("antd/es/");',
    ],
    [
      "dynamischer Namespace",
      'const Antd = await import("antd/lib");\nconst t = <Antd.Table />;',
    ],
    [
      "dynamischer Namespace mit Element-Zugriff",
      'const Antd = await import("antd/es/");\nconst t = Antd["Table"];',
    ],
    [
      "dynamischer Property-Zugriff",
      'const Tabelle = (await import("antd")).Table;',
    ],
    [
      "dynamischer Element-Zugriff",
      'const Tabelle = (await import("antd/lib"))["Table"];',
    ],
    [
      "dynamisches then mit Alias-Destrukturierung",
      'const Tabelle = import("antd").then(({ Table: DatenTabelle }) => DatenTabelle);',
    ],
    [
      "dynamisches then mit Namespace",
      'const Tabelle = import("antd/es").then((Antd) => Antd.Table);',
    ],
    [
      "dynamischer Table-Subpfad",
      'const Tabelle = (await import("antd/es/table")).default;',
    ],
    ["require destrukturiert", 'const { Table } = require("antd");'],
    [
      "require destrukturiert und aliasiert",
      'const { Table: DatenTabelle } = require("antd/lib");',
    ],
    [
      "require aus dem CommonJS-Slash-Root",
      'const { Table: DatenTabelle } = require("antd/lib/");',
    ],
    [
      "require aus der CommonJS-Rootdatei",
      'const { Table: DatenTabelle } = require("antd/lib/index.js");',
    ],
    [
      "require mit berechnetem Alias-Schlüssel",
      'const { ["Table"]: DatenTabelle } = require("antd");',
    ],
    [
      "require Namespace",
      'const Antd = require("antd/es");\nconst t = <Antd.Table />;',
    ],
    [
      "require Namespace mit Element-Zugriff",
      'const Antd = require("antd/lib/");\nconst t = Antd["Table"];',
    ],
    ["require Property-Zugriff", 'const Tabelle = require("antd").Table;'],
    ["require Element-Zugriff", 'const Tabelle = require("antd/lib")["Table"];'],
    ["require Table-Subpfad", 'const Tabelle = require("antd/lib/table");'],
  ] as const)("erkennt die RED-Mutationsprobe %s", (_name, quelle) => {
    expect(verstoesseIn(quelle)).toEqual(["probe.tsx"]);
  });

  it("lässt Typimporte, andere Komponenten und echte Client-Dateien in Ruhe", () => {
    expect(verstoesseIn('import { type TableProps } from "antd";'))
      .toEqual([]);
    expect(verstoesseIn('import { type TableProps } from "antd/es/table";'))
      .toEqual([]);
    expect(verstoesseIn('import { type TableProps } from "antd/es";'))
      .toEqual([]);
    expect(verstoesseIn('import { type TableProps } from "antd/es/";'))
      .toEqual([]);
    expect(verstoesseIn(
      'import * as Antd from "antd";\nconst warnung = <Antd.Alert />;',
    )).toEqual([]);
    expect(verstoesseIn(
      'import type * as AntdTypen from "antd";\ntype Warnung = typeof AntdTypen.Alert;',
    )).toEqual([]);
    expect(verstoesseIn('const { Card } = await import("antd");'))
      .toEqual([]);
    expect(verstoesseIn('const { Card } = await import("antd/es/");'))
      .toEqual([]);
    expect(verstoesseIn(
      'const Antd = await import("antd/es/");\nconst Karte = Antd.Card;',
    )).toEqual([]);
    expect(verstoesseIn('const { Card } = require("antd/lib");'))
      .toEqual([]);
    expect(verstoesseIn('const { Card } = require("antd/lib/");'))
      .toEqual([]);
    expect(verstoesseIn(
      'const Antd = require("antd/lib/");\nconst Karte = Antd.Card;',
    )).toEqual([]);
    expect(verstoesseIn('const Karte = import("antd").then(({ Card }) => Card);'))
      .toEqual([]);
    expect(verstoesseIn('const Karte = import("antd/es").then((Antd) => Antd.Card);'))
      .toEqual([]);
    expect(verstoesseIn('"use client";\nimport { Table } from "antd";'))
      .toEqual([]);
  });

  it("directive-freie Verwaltungsseiten importieren antd-Table nie direkt", () => {
    const pages = pageDateien(ARBEITSBEREICH);
    expect(pages.length, "keine Verwaltungsseiten geprüft").toBeGreaterThan(0);

    const verstoesse = pages
      .filter((pfad) => verstoesseIn(readFileSync(pfad, "utf8"), pfad).length > 0)
      .map((pfad) => relative(process.cwd(), pfad));

    expect(verstoesse).toEqual([]);
  });
});
