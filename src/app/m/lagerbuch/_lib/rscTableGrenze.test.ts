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

function importiertAntdTable(source: ts.SourceFile): boolean {
  return source.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)) return false;
    const modul = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) return false;

    if (/^antd\/(?:es|lib)\/table(?:\/|$)/.test(modul)) {
      if (clause.name) return true;
      const bindungen = clause.namedBindings;
      if (bindungen && ts.isNamespaceImport(bindungen)) return true;
      return Boolean(bindungen && ts.isNamedImports(bindungen)
        && bindungen.elements.some((element) => !element.isTypeOnly));
    }
    if (modul !== "antd") return false;

    const bindungen = clause.namedBindings;
    if (bindungen && ts.isNamespaceImport(bindungen)) return true;
    if (!bindungen || !ts.isNamedImports(bindungen)) return false;
    return bindungen.elements.some((element) => (
      !element.isTypeOnly
      && (element.propertyName ?? element.name).text === "Table"
    ));
  });
}

function verstoesseIn(quelle: string, dateiname = "probe.tsx"): string[] {
  const source = ts.createSourceFile(
    dateiname,
    quelle,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  if (hatUseClientDirektive(source) || !importiertAntdTable(source)) return [];
  return [dateiname];
}

describe("RSC-/antd-Tabellengrenze", () => {
  it("erkennt Alias-, Namespace- und Subpfadimporte strukturell", () => {
    expect(verstoesseIn('import { Table as DatenTabelle } from "antd";'))
      .toEqual(["probe.tsx"]);
    expect(verstoesseIn('import * as Antd from "antd";'))
      .toEqual(["probe.tsx"]);
    expect(verstoesseIn('import Tabelle from "antd/es/table";'))
      .toEqual(["probe.tsx"]);
    expect(verstoesseIn('import { type TableProps } from "antd";'))
      .toEqual([]);
    expect(verstoesseIn('import { type TableProps } from "antd/es/table";'))
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
