import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement, type ReactElement, type ReactNode } from "react";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("../../_lib/host", () => ({ requireLagerbuchHost: vi.fn() }));
vi.mock("../../_lib/zugang", () => ({ requireLagerbuchAdmin: vi.fn() }));

import { headers } from "next/headers";
import { LAGERBUCH_NAV } from "../../_lib/nav";
import { requireLagerbuchHost } from "../../_lib/host";
import { requireLagerbuchAdmin, type Viewer } from "../../_lib/zugang";
import { SeitenKopf } from "../../_ui/SeitenKopf";
import { VerwaltungsRahmen } from "../../_ui/VerwaltungsRahmen";

const VERWALTUNG = "src/app/m/lagerbuch/verwaltung";
const ARBEIT = join(VERWALTUNG, "(arbeit)");
const LAYOUT = join(ARBEIT, "layout.tsx");
const SEITE = join(ARBEIT, "page.tsx");

type Aufruf = { position: number; awaited: boolean };
type LayoutAnalyse = {
  hatDefaultLayout: boolean;
  hatUseClientDirektive: boolean;
  verboteneQuellen: string[];
  authQuellen: string[];
  authAufrufe: string[];
  shellMounts: string[];
  layoutAufrufe: Record<"headers" | "requireLagerbuchHost" | "requireLagerbuchAdmin", Aufruf[]>;
};

function literalWert(node: ts.Node | undefined): string | undefined {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined;
}

function istVerboteneQuelle(modul: string): boolean {
  const paket = (name: string) => modul === name || modul.startsWith(`${name}/`);
  return (
    paket("antd") ||
    paket("@ant-design/icons") ||
    paket("lucide-react") ||
    modul === "@/core/shell" ||
    modul.startsWith("@/core/shell/") ||
    /(^|\/)core\/shell\/(Shell|icons)(\/|$)/.test(modul) ||
    /(^|\/)_ui\/ikonen(\/|$)/.test(modul)
  );
}

function istAuthQuelle(modul: string): boolean {
  return (
    modul === "@/core/auth" ||
    modul.startsWith("@/core/auth/") ||
    /(^|\/)core\/auth(\/|$)/.test(modul)
  );
}

function aufrufName(node: ts.Expression): string | undefined {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return undefined;
}

function stehtUnterAwait(node: ts.CallExpression): boolean {
  let aktuell: ts.Node = node;
  while (aktuell.parent) {
    aktuell = aktuell.parent;
    if (ts.isAwaitExpression(aktuell)) return true;
    if (ts.isStatement(aktuell)) return false;
  }
  return false;
}

/**
 * Compiler-Trivia (also auch JSDoc und Zeilenkommentare) wird absichtlich nie
 * als Produktcode ausgewertet. Derselbe Analysator prueft reale Quelle und
 * Mutationsfixtures, damit keine neue Importform am Riegel vorbeikommt.
 */
function analysiereLayout(quelle: string, dateiname = "mutation.tsx"): LayoutAnalyse {
  const source = ts.createSourceFile(
    dateiname,
    quelle,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const modulQuellen: string[] = [];
  const authAufrufe: string[] = [];
  const shellMounts: string[] = [];
  let defaultLayout: ts.FunctionDeclaration | undefined;

  const hatUseClientDirektive = (() => {
    for (const statement of source.statements) {
      if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) {
        return false;
      }
      if (statement.expression.text === "use client") return true;
    }
    return false;
  })();

  function merkeModulquelle(node: ts.Node | undefined) {
    const modul = literalWert(node);
    if (modul) modulQuellen.push(modul);
  }

  function besuche(node: ts.Node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      merkeModulquelle(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      merkeModulquelle(node.moduleReference.expression);
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        merkeModulquelle(node.arguments[0]);
      } else if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
        merkeModulquelle(node.arguments[0]);
      }

      const name = aufrufName(node.expression);
      if (name === "auth" || name === "viewerOderNull") authAufrufe.push(name);
    }

    if (
      ts.isFunctionDeclaration(node) &&
      node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
    ) {
      defaultLayout = node;
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = node.tagName.getText(source);
      if (name.split(".").at(-1) === "Shell") shellMounts.push(name);
    }

    ts.forEachChild(node, besuche);
  }

  besuche(source);

  const layoutAufrufe: LayoutAnalyse["layoutAufrufe"] = {
    headers: [],
    requireLagerbuchHost: [],
    requireLagerbuchAdmin: [],
  };
  if (defaultLayout?.body) {
    function besucheLayout(node: ts.Node) {
      if (ts.isCallExpression(node)) {
        const name = aufrufName(node.expression);
        if (name && Object.hasOwn(layoutAufrufe, name)) {
          layoutAufrufe[name as keyof typeof layoutAufrufe].push({
            position: node.getStart(source),
            awaited: stehtUnterAwait(node),
          });
        }
      }
      ts.forEachChild(node, besucheLayout);
    }
    besucheLayout(defaultLayout.body);
  }

  return {
    hatDefaultLayout: defaultLayout !== undefined,
    hatUseClientDirektive,
    verboteneQuellen: modulQuellen.filter(istVerboteneQuelle),
    authQuellen: modulQuellen.filter(istAuthQuelle),
    authAufrufe,
    shellMounts,
    layoutAufrufe,
  };
}

const VERBOTENE_MODULE = [
  "antd",
  "antd/es/button",
  "@ant-design/icons",
  "@ant-design/icons/es/icons/LogoutOutlined",
  "lucide-react",
  "lucide-react/icons/log-out",
  "@/core/shell/Shell",
  "../../../../../../core/shell/icons",
  "../../_ui/ikonen",
] as const;

const LADEFORMEN = [
  ["normaler Import", (modul: string) => `import * as x from "${modul}";`],
  ["Side-Effect-Import", (modul: string) => `import "${modul}";`],
  ["dynamischer Import", (modul: string) => `void import("${modul}");`],
  ["Re-Export", (modul: string) => `export * from "${modul}";`],
  ["Import-Equals", (modul: string) => `import x = require("${modul}");`],
  ["bare require", (modul: string) => `void require("${modul}");`],
] as const;

const LADE_MUTATIONEN = VERBOTENE_MODULE.flatMap((modul) =>
  LADEFORMEN.map(([form, quelle]) => ({ form, modul, quelle: quelle(modul) })),
);

describe("Layout-Quellriegel: Mutationsfixtures", () => {
  it.each(LADE_MUTATIONEN)("findet $form aus $modul", ({ modul, quelle }) => {
    expect(analysiereLayout(quelle).verboteneQuellen).toEqual([modul]);
  });

  it("findet direkte und aliasierte Auth-Quellen sowie eigene Viewer-Aufrufe", () => {
    const analyse = analysiereLayout(`
      import { auth as liesSitzung } from "@/core/auth";
      auth();
      viewerOderNull();
    `);

    expect(analyse.authQuellen).toEqual(["@/core/auth"]);
    expect(analyse.authAufrufe).toEqual(["auth", "viewerOderNull"]);
  });

  it("erkennt nur eine echte Direktive im Direktivenprolog", () => {
    expect(
      analysiereLayout('"use strict";\n"use client";\nexport const x = 1;').hatUseClientDirektive,
    ).toBe(true);
    expect(analysiereLayout('const x = 1;\n"use client";').hatUseClientDirektive).toBe(false);
  });

  it.each([
    ["Blockkommentar", "/*"],
    ["Ganzzeilenkommentar", "//"],
    ["trailing Kommentar", "trailing"],
  ] as const)("ignoriert alle verbotenen Woerter im %s", (_name, art) => {
    const woerter =
      'import Shell from "@/core/shell/Shell"; import("antd"); require("lucide-react"); ' +
      '"use client"; auth(); viewerOderNull(); <Shell />;';
    const quelle =
      art === "/*"
        ? `/* ${woerter} */\nexport const ok = 1;`
        : art === "//"
          ? `// ${woerter}\nexport const ok = 1;`
          : `export const ok = 1; // ${woerter}`;
    const analyse = analysiereLayout(quelle);

    expect(analyse.verboteneQuellen).toEqual([]);
    expect(analyse.authQuellen).toEqual([]);
    expect(analyse.authAufrufe).toEqual([]);
    expect(analyse.shellMounts).toEqual([]);
    expect(analyse.hatUseClientDirektive).toBe(false);
  });
});

describe("verwaltung/(arbeit)/layout.tsx: statischer Vertrag", () => {
  it("existiert als Server-Layout ohne eigene UI-, Shell- oder Auth-Abkuerzung", () => {
    const vorhanden = existsSync(LAYOUT);
    expect(vorhanden).toBe(true);
    if (!vorhanden) return;

    const analyse = analysiereLayout(readFileSync(LAYOUT, "utf8"), LAYOUT);
    expect(analyse.hatDefaultLayout).toBe(true);
    expect(analyse.hatUseClientDirektive).toBe(false);
    expect(analyse.verboteneQuellen).toEqual([]);
    expect(analyse.authQuellen).toEqual([]);
    expect(analyse.authAufrufe).toEqual([]);
    expect(analyse.shellMounts).toEqual([]);
  });

  it("besitzt genau die drei Layout-Aufrufe in der Reihenfolge Header, Host, Admin", () => {
    const vorhanden = existsSync(LAYOUT);
    expect(vorhanden).toBe(true);
    if (!vorhanden) return;

    const { layoutAufrufe } = analysiereLayout(readFileSync(LAYOUT, "utf8"), LAYOUT);
    expect(layoutAufrufe.headers).toHaveLength(1);
    expect(layoutAufrufe.requireLagerbuchHost).toHaveLength(1);
    expect(layoutAufrufe.requireLagerbuchAdmin).toHaveLength(1);
    expect([
      layoutAufrufe.headers[0].position,
      layoutAufrufe.requireLagerbuchHost[0].position,
      layoutAufrufe.requireLagerbuchAdmin[0].position,
    ]).toEqual(
      [
        layoutAufrufe.headers[0].position,
        layoutAufrufe.requireLagerbuchHost[0].position,
        layoutAufrufe.requireLagerbuchAdmin[0].position,
      ].toSorted((a, b) => a - b),
    );
    expect(layoutAufrufe.requireLagerbuchAdmin[0].awaited).toBe(true);
  });
});

const headersMock = vi.mocked(headers);
const hostRiegelMock = vi.mocked(requireLagerbuchHost);
const adminRiegelMock = vi.mocked(requireLagerbuchAdmin);
const VIEWER: Viewer = {
  sub: "admin-1",
  groups: ["lagerbuch-admin"],
  name: "Ada Verwaltung",
  email: "ada@example.test",
};

let ereignisse: string[];
let kopf: Headers;
let adminFreigeben: (viewer: Viewer) => void;

type LayoutFunktion = (props: { children: ReactNode }) => Promise<ReactElement>;

async function ladeLayout(): Promise<LayoutFunktion | null> {
  const vorhanden = existsSync(LAYOUT);
  expect(vorhanden).toBe(true);
  if (!vorhanden) return null;
  const modul = await vi.importActual<{ default: LayoutFunktion }>("./layout");
  return modul.default;
}

beforeEach(() => {
  vi.clearAllMocks();
  ereignisse = [];
  kopf = new Headers({ host: "lagerbuch.localtest.me" });
  const adminVersprechen = new Promise<Viewer>((resolve) => {
    adminFreigeben = resolve;
  });
  headersMock.mockImplementation(async () => {
    ereignisse.push("headers");
    return kopf as never;
  });
  hostRiegelMock.mockImplementation(() => {
    ereignisse.push("host");
  });
  adminRiegelMock.mockImplementation(() => {
    ereignisse.push("admin");
    return adminVersprechen;
  });
});

describe("verwaltung/(arbeit)/layout.tsx: Laufzeitvertrag", () => {
  it("liest genau einen eigenen Header und reicht dieselbe Instanz vor dem Admin-Riegel weiter", async () => {
    const Layout = await ladeLayout();
    if (!Layout) return;

    const ergebnis = Layout({ children: null });
    await vi.waitFor(() => expect(adminRiegelMock).toHaveBeenCalledTimes(1));
    adminFreigeben(VIEWER);
    await ergebnis;

    expect(ereignisse).toEqual(["headers", "host", "admin"]);
    expect(headersMock).toHaveBeenCalledTimes(1);
    expect(hostRiegelMock).toHaveBeenCalledTimes(1);
    expect(hostRiegelMock).toHaveBeenCalledWith(kopf);
  });

  it("gibt das Layout erst nach abgeschlossenem Admin-Riegel zurueck", async () => {
    const Layout = await ladeLayout();
    if (!Layout) return;

    let abgeschlossen = false;
    const ergebnis = Layout({ children: null });
    void ergebnis.then(() => {
      abgeschlossen = true;
    });
    await vi.waitFor(() => expect(adminRiegelMock).toHaveBeenCalledTimes(1));
    await Promise.resolve();

    try {
      expect(abgeschlossen).toBe(false);
    } finally {
      adminFreigeben(VIEWER);
    }
    await ergebnis;
  });

  it("liefert den VerwaltungsRahmen mit identischen Kindern und exakt LAGERBUCH_NAV", async () => {
    const Layout = await ladeLayout();
    if (!Layout) return;

    adminRiegelMock.mockImplementationOnce(() => {
      ereignisse.push("admin");
      return Promise.resolve(VIEWER);
    });
    const kind = createElement("span", { "data-testid": "unveraendertes-kind" }, "Inhalt");
    const element = (await Layout({ children: kind })) as ReactElement<{
      nav?: unknown;
      children?: ReactNode;
    }>;

    expect(element.type).toBe(VerwaltungsRahmen);
    expect(element.props.nav).toBe(LAGERBUCH_NAV);
    expect(element.props.children).toBe(kind);
  });
});

function allePfade(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((eintrag) => {
    const absolut = join(root, eintrag.name);
    return eintrag.isDirectory() ? [absolut, ...allePfade(absolut)] : [absolut];
  });
}

describe("verwaltung/: Verzeichnisvertrag", () => {
  it("enthaelt die bis T128 befristete Uebersichtsseite mit ihrem exakten Platzhalter", async () => {
    const vorhanden = existsSync(SEITE);
    expect(vorhanden).toBe(true);
    if (!vorhanden) return;

    const modul = await vi.importActual<{
      dynamic: string;
      default: () => ReactElement<{ titel?: string; beschreibung?: string }>;
    }>("./page");
    const element = modul.default();

    expect(modul.dynamic).toBe("force-dynamic");
    expect(element.type).toBe(SeitenKopf);
    expect(element.props).toEqual({
      titel: "Übersicht",
      beschreibung: "Kennzahlen folgen in T128.",
    });
  });

  it("hat weder loses Layout/Seite noch eine zweite Etiketten-Route", () => {
    expect(existsSync(join(VERWALTUNG, "layout.tsx"))).toBe(false);
    expect(existsSync(join(VERWALTUNG, "page.tsx"))).toBe(false);
    expect(existsSync(join(ARBEIT, "etiketten"))).toBe(false);
  });

  it("enthaelt rekursiv weder kein-zugriff noch identitaeten", () => {
    const verbotenePfade = allePfade(VERWALTUNG)
      .map((pfad) => relative(VERWALTUNG, pfad))
      .filter((pfad) =>
        pfad.split(/[\\/]/).some((segment) =>
          ["kein-zugriff", "identitaeten"].includes(segment.replace(/\.[^.]+$/, "")),
        ),
      );

    expect(verbotenePfade).toEqual([]);
  });
});
