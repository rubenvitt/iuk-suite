import { readFileSync } from "node:fs";
import type { ComponentProps, ReactElement } from "react";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { getModule } from "@/core/registry";
import { Shell } from "@/core/shell/Shell";
import { LAGERBUCH_NAV } from "../_lib/nav";
import s from "./verwaltung.module.css";
import { VerwaltungsRahmen } from "./VerwaltungsRahmen";

const QUELLE = readFileSync(
  "src/app/m/lagerbuch/_ui/VerwaltungsRahmen.tsx",
  "utf8",
);

type QuellenAnalyse = {
  verboteneImporte: string[];
  hatUseClientDirektive: boolean;
  ruftLagerbuchModulAb: boolean;
  nutztRegistryVariante: boolean;
  nutztLagerbuchModuleKey: boolean;
  hatVollesVariantLiteral: boolean;
  importiertVerwaltungsCssAlsS: boolean;
  navProperty?: { optional: boolean; typ: string };
};

/**
 * Derselbe AST-Riegel prueft die echte Komponente und die Mutationsfixtures.
 * Kommentare sind Compiler-Trivia; Importformen und Direktiven werden deshalb
 * nach ihrer Syntaxrolle statt nach zufaelligen Woertern im Rohtext bewertet.
 */
function analysiereQuelle(quelle: string, dateiname = "mutation.tsx"): QuellenAnalyse {
  const source = ts.createSourceFile(
    dateiname,
    quelle,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const analyse: QuellenAnalyse = {
    verboteneImporte: [],
    hatUseClientDirektive: false,
    ruftLagerbuchModulAb: false,
    nutztRegistryVariante: false,
    nutztLagerbuchModuleKey: false,
    hatVollesVariantLiteral: false,
    importiertVerwaltungsCssAlsS: false,
  };

  for (const statement of source.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    if (statement.expression.text === "use client") analyse.hatUseClientDirektive = true;
  }

  function literalWert(node: ts.Node | undefined): string | undefined {
    return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      ? node.text
      : undefined;
  }

  function istVerbotenerImport(spezifizierer: string): boolean {
    return (
      spezifizierer === "antd" ||
      spezifizierer.startsWith("antd/") ||
      spezifizierer === "@ant-design/icons" ||
      spezifizierer.startsWith("@ant-design/icons/")
    );
  }

  function importPruefen(node: ts.Node | undefined) {
    const spezifizierer = literalWert(node);
    if (spezifizierer && istVerbotenerImport(spezifizierer)) {
      analyse.verboteneImporte.push(spezifizierer);
    }
  }

  function attributName(node: ts.JsxAttribute): string {
    return node.name.getText(source);
  }

  function attributLiteral(node: ts.JsxAttribute): string | undefined {
    if (!node.initializer) return undefined;
    if (ts.isStringLiteral(node.initializer)) return node.initializer.text;
    return ts.isJsxExpression(node.initializer)
      ? literalWert(node.initializer.expression)
      : undefined;
  }

  function besuche(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const spezifizierer = literalWert(node.moduleSpecifier);
      importPruefen(node.moduleSpecifier);
      if (
        spezifizierer === "./verwaltung.module.css" &&
        node.importClause?.name?.text === "s"
      ) {
        analyse.importiertVerwaltungsCssAlsS = true;
      }
    } else if (ts.isExportDeclaration(node)) {
      importPruefen(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      importPruefen(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      importPruefen(node.arguments[0]);
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "getModule" &&
      literalWert(node.arguments[0]) === "lagerbuch"
    ) {
      analyse.ruftLagerbuchModulAb = true;
    }

    if (ts.isJsxAttribute(node)) {
      const name = attributName(node);
      const literal = attributLiteral(node);
      if (name === "moduleKey" && literal === "lagerbuch") {
        analyse.nutztLagerbuchModuleKey = true;
      }
      if (name === "variant" && literal === "full") {
        analyse.hatVollesVariantLiteral = true;
      }
      if (
        name === "variant" &&
        node.initializer &&
        ts.isJsxExpression(node.initializer) &&
        node.initializer.expression &&
        ts.isPropertyAccessExpression(node.initializer.expression) &&
        ts.isIdentifier(node.initializer.expression.expression) &&
        node.initializer.expression.expression.text === "mod" &&
        node.initializer.expression.name.text === "shell"
      ) {
        analyse.nutztRegistryVariante = true;
      }
    }

    if (ts.isFunctionDeclaration(node) && node.name?.text === "VerwaltungsRahmen") {
      const props = node.parameters[0]?.type;
      if (props && ts.isTypeLiteralNode(props)) {
        const nav = props.members.find(
          (member): member is ts.PropertySignature =>
            ts.isPropertySignature(member) && member.name.getText(source) === "nav",
        );
        if (nav) {
          analyse.navProperty = {
            optional: nav.questionToken !== undefined,
            typ: nav.type?.getText(source) ?? "",
          };
        }
      }
    }

    ts.forEachChild(node, besuche);
  }

  besuche(source);
  return analyse;
}

function verboteneImporte(quelle: string): string[] {
  return analysiereQuelle(quelle).verboteneImporte;
}

function hatUseClientDirektive(quelle: string): boolean {
  return analysiereQuelle(quelle).hatUseClientDirektive;
}

function hatVollesVariantLiteral(quelle: string): boolean {
  return analysiereQuelle(quelle).hatVollesVariantLiteral;
}

const ANALYSE = analysiereQuelle(QUELLE, "VerwaltungsRahmen.tsx");

describe("Quelltext-Riegel: Mutationsfixtures", () => {
  const importMutationen = [
    ["normaler Import aus antd", 'import { Button } from "antd";', "antd"],
    ["normaler Import aus antd-Unterpfad", 'import Button from "antd/es/button";', "antd/es/button"],
    [
      "normaler Import aus @ant-design/icons",
      'import { AlertOutlined } from "@ant-design/icons";',
      "@ant-design/icons",
    ],
    [
      "normaler Import aus @ant-design/icons-Unterpfad",
      'import AlertOutlined from "@ant-design/icons/es/icons/AlertOutlined";',
      "@ant-design/icons/es/icons/AlertOutlined",
    ],
    ["Side-Effect-Import aus antd", 'import "antd";', "antd"],
    ["Side-Effect-Import aus antd-Unterpfad", 'import "antd/reset.css";', "antd/reset.css"],
    [
      "Side-Effect-Import aus @ant-design/icons",
      'import "@ant-design/icons";',
      "@ant-design/icons",
    ],
    [
      "Side-Effect-Import aus @ant-design/icons-Unterpfad",
      'import "@ant-design/icons/es";',
      "@ant-design/icons/es",
    ],
    ["dynamischer Import aus antd", 'void import("antd");', "antd"],
    [
      "dynamischer Import aus antd-Unterpfad",
      'void import("antd/es/button");',
      "antd/es/button",
    ],
    [
      "dynamischer Import aus @ant-design/icons",
      'void import("@ant-design/icons");',
      "@ant-design/icons",
    ],
    [
      "dynamischer Import aus @ant-design/icons-Unterpfad",
      'void import("@ant-design/icons/es");',
      "@ant-design/icons/es",
    ],
    ["Re-Export aus antd", 'export { Button } from "antd";', "antd"],
    ["Re-Export aus antd-Unterpfad", 'export * from "antd/es/button";', "antd/es/button"],
    [
      "Re-Export aus @ant-design/icons",
      'export { AlertOutlined } from "@ant-design/icons";',
      "@ant-design/icons",
    ],
    [
      "Re-Export aus @ant-design/icons-Unterpfad",
      'export * from "@ant-design/icons/es";',
      "@ant-design/icons/es",
    ],
  ] as const;

  it.each(importMutationen)("findet %s", (_name, quelle, spezifizierer) => {
    expect(verboteneImporte(quelle)).toEqual([spezifizierer]);
  });

  const kommentarMutationen = [
    [
      "Blockkommentar",
      '/* import { Button } from "antd"; "use client"; variant="full" */\nexport const ok = 1;',
    ],
    [
      "Ganzzeilenkommentar",
      '// import { Button } from "antd"; "use client"; variant="full"\nexport const ok = 1;',
    ],
    [
      "trailing Kommentar",
      'export const ok = 1; // import { Button } from "antd"; "use client"; variant="full"',
    ],
  ] as const;

  it.each(kommentarMutationen)("ignoriert verbotene Woerter im %s", (_name, quelle) => {
    expect(verboteneImporte(quelle)).toEqual([]);
    expect(hatUseClientDirektive(quelle)).toBe(false);
    expect(hatVollesVariantLiteral(quelle)).toBe(false);
  });

  it.each([
    ["einfache Direktive", '"use client";\nexport const x = 1;', true],
    [
      "Direktive nach anderer Direktive und Kommentaren",
      '/* Kopf */\n"use strict"; // erlaubt\n// dazwischen\n"use client"\nexport const x = 1;',
      true,
    ],
    ["String nach Code", 'const x = 1;\n"use client";', false],
    ["String in einer Funktion", 'function f() {\n  "use client";\n}', false],
    ["geklammerter String", '("use client");\nexport const x = 1;', false],
  ] as const)("wertet den Direktivenprolog aus: %s", (_name, quelle, erwartet) => {
    expect(hatUseClientDirektive(quelle)).toBe(erwartet);
  });
});

describe("VerwaltungsRahmen", () => {
  it("bleibt eine Server Component ohne eigenen antd-Zugriff", () => {
    expect(ANALYSE.hatUseClientDirektive).toBe(false);
    expect(ANALYSE.verboteneImporte).toEqual([]);
  });

  it("nimmt die Shell-Variante aus der Lagerbuch-Registry", () => {
    expect(ANALYSE.ruftLagerbuchModulAb).toBe(true);
    expect(ANALYSE.nutztRegistryVariante).toBe(true);
    expect(ANALYSE.nutztLagerbuchModuleKey).toBe(true);
    expect(ANALYSE.hatVollesVariantLiteral).toBe(false);
  });

  it("haelt `nav` als Pflichtprop ohne `undefined`-Ausweg", () => {
    type Props = ComponentProps<typeof VerwaltungsRahmen>;
    type NavIstOptional = Pick<Props, "nav"> extends Required<Pick<Props, "nav">>
      ? false
      : true;
    type NavErlaubtUndefined = undefined extends Props["nav"] ? true : false;

    const navIstOptional: NavIstOptional = false;
    const navErlaubtUndefined: NavErlaubtUndefined = false;

    expect(navIstOptional).toBe(false);
    expect(navErlaubtUndefined).toBe(false);
    expect(ANALYSE.navProperty).toEqual({ optional: false, typ: "SuiteNavItem[]" });
  });

  it("traegt Modul-CSS, Shell, Navigation und Kinder an einer Stelle", () => {
    const kind = <span data-testid="lagerbuch-kind">Inhalt</span>;
    const aussen = VerwaltungsRahmen({ nav: LAGERBUCH_NAV, children: kind }) as ReactElement<{
      className: string;
      children: ReactElement<{
        variant: string;
        moduleKey: string;
        nav: unknown;
        children: unknown;
      }>;
    }>;

    expect(ANALYSE.importiertVerwaltungsCssAlsS).toBe(true);
    expect(aussen.type).toBe("div");
    expect(aussen.props.className).toBe(s.modul);

    const innen = aussen.props.children;
    expect(innen.type).toBe(Shell);
    expect(innen.props.variant).toBe(getModule("lagerbuch").shell);
    expect(innen.props.moduleKey).toBe("lagerbuch");
    expect(innen.props.nav).toBe(LAGERBUCH_NAV);
    expect(innen.props.children).toBe(kind);
  });
});
