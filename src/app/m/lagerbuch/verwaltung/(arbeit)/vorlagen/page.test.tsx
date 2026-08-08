// @vitest-environment jsdom

import { isValidElement, type ReactElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exists,
  mount,
  query,
  queryAll,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import {
  artikel,
  fahrzeugTemplates,
  lagerorte,
  templatePositionen,
} from "../../../_db/schema";
import { migrierteTestDb, type TestDb } from "../../../_db/testdb";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import s from "../../../_ui/verwaltung.module.css";
import { NeuTemplate } from "./NeuTemplate";
import { TemplateTable, type TemplateAnzeigeZeile } from "./TemplateTable";
import VorlagenSeite, { dynamic, vorlagenInhalt } from "./page";

const JETZT = new Date("2026-08-07T12:00:00Z");
const PAGE_PFAD = "src/app/m/lagerbuch/verwaltung/(arbeit)/vorlagen/page.tsx";
const TABLE_PFAD = "src/app/m/lagerbuch/verwaltung/(arbeit)/vorlagen/TemplateTable.tsx";

const DOM_ZEILEN: TemplateAnzeigeZeile[] = [
  {
    id: "template-standard",
    name: "RTW Standard",
    detailHref: "/verwaltung/vorlagen/template-standard",
    inaktiv: false,
    bestueckungText: "2 Positionen · 2 Fächer",
    fahrzeugeText: "1 Fahrzeug",
  },
  {
    id: "template-alt",
    name: "Altvorlage",
    detailHref: "/verwaltung/vorlagen/template-alt",
    inaktiv: true,
    bestueckungText: "1 Position · 1 Fach",
    fahrzeugeText: "2 Fahrzeuge",
  },
];

let t: TestDb;
const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-vorlagen-seite-");
  vi.spyOn(window, "getComputedStyle")
    .mockImplementation((element) => getComputedStyleOhnePseudo(element));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await unmount();
  t.schliessen();
});

function elementeVomTyp(
  wert: ReactNode,
  typ: unknown,
): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(wert)) return wert.flatMap((kind) => elementeVomTyp(kind, typ));
  if (!isValidElement(wert)) return [];
  const treffer = wert.type === typ
    ? [wert as ReactElement<Record<string, unknown>>]
    : [];
  const kinder = (wert.props as { children?: ReactNode }).children;
  return [...treffer, ...elementeVomTyp(kinder, typ)];
}

function istRekursivJsonSicher(wert: unknown): boolean {
  if (
    wert === null
    || typeof wert === "string"
    || typeof wert === "boolean"
  ) return true;
  if (typeof wert === "number") return Number.isFinite(wert);
  if (Array.isArray(wert)) return wert.every(istRekursivJsonSicher);
  if (typeof wert !== "object" || Object.getPrototypeOf(wert) !== Object.prototype) {
    return false;
  }
  return Reflect.ownKeys(wert).every((schluessel) =>
    typeof schluessel === "string"
    && istRekursivJsonSicher((wert as Record<string, unknown>)[schluessel]));
}

function sourceAus(quelle: string): ts.SourceFile {
  return ts.createSourceFile(
    "datei.tsx",
    quelle,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function importiertAntdTableDirekt(quelle: string): boolean {
  const source = sourceAus(quelle);
  const objektImporte = new Set<string>();
  for (const anweisung of source.statements) {
    if (
      !ts.isImportDeclaration(anweisung)
      || !ts.isStringLiteral(anweisung.moduleSpecifier)
    ) continue;
    const klausel = anweisung.importClause;
    if (!klausel || klausel.isTypeOnly) continue;
    const bindungen = klausel.namedBindings;
    if (/^antd\/(?:es|lib)\/table(?:\/|$)/i.test(anweisung.moduleSpecifier.text)) {
      if (
        klausel.name
        || (bindungen && ts.isNamespaceImport(bindungen))
        || (bindungen && ts.isNamedImports(bindungen)
          && bindungen.elements.some((element) => !element.isTypeOnly))
      ) return true;
      continue;
    }
    if (anweisung.moduleSpecifier.text !== "antd") continue;
    if (klausel.name) objektImporte.add(klausel.name.text);
    if (bindungen && ts.isNamespaceImport(bindungen)) objektImporte.add(bindungen.name.text);
    if (bindungen && ts.isNamedImports(bindungen) && bindungen.elements.some((element) =>
      !element.isTypeOnly
      && (element.propertyName?.text ?? element.name.text) === "Table")) {
      return true;
    }
  }

  let tableZugriff = false;
  function besuche(node: ts.Node): void {
    if (
      ts.isPropertyAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && objektImporte.has(node.expression.text)
      && node.name.text === "Table"
    ) tableZugriff = true;
    if (
      ts.isElementAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && objektImporte.has(node.expression.text)
      && node.argumentExpression !== undefined
      && (ts.isStringLiteral(node.argumentExpression)
        || ts.isNoSubstitutionTemplateLiteral(node.argumentExpression))
      && node.argumentExpression.text === "Table"
    ) tableZugriff = true;
    ts.forEachChild(node, besuche);
  }
  ts.forEachChild(source, besuche);
  return tableZugriff;
}

function hatRenderProperty(quelle: string): boolean {
  let treffer = false;
  function besuche(node: ts.Node): void {
    if (
      (ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node))
      && ((ts.isIdentifier(node.name) && node.name.text === "render")
        || (ts.isStringLiteral(node.name) && node.name.text === "render"))
    ) treffer = true;
    ts.forEachChild(node, besuche);
  }
  ts.forEachChild(sourceAus(quelle), besuche);
  return treffer;
}

function hatUseClientDirektive(quelle: string): boolean {
  const [erste] = sourceAus(quelle).statements;
  return Boolean(
    erste
    && ts.isExpressionStatement(erste)
    && ts.isStringLiteral(erste.expression)
    && erste.expression.text === "use client",
  );
}

function vorlagenEintragen(): void {
  t.db.insert(fahrzeugTemplates).values([
    {
      id: "template-alt",
      name: "Altvorlage",
      aktiv: false,
      createdAt: JETZT,
    },
    {
      id: "template-standard",
      name: "RTW Standard",
      aktiv: true,
      createdAt: JETZT,
    },
  ]).run();
  t.db.insert(artikel).values([
    {
      id: "artikel-kompresse",
      name: "Kompresse",
      einheit: "Stk",
      fach: "A1",
      mindestbestand: 0,
      aktiv: true,
      createdAt: JETZT,
    },
    {
      id: "artikel-binde",
      name: "Binde",
      einheit: "Stk",
      fach: "A2",
      mindestbestand: 0,
      aktiv: true,
      createdAt: JETZT,
    },
  ]).run();
  t.db.insert(templatePositionen).values([
    {
      id: "position-standard-1",
      templateId: "template-standard",
      fachLabel: "A1",
      sort: 1,
      artikelId: "artikel-kompresse",
      soll: 10,
    },
    {
      id: "position-standard-2",
      templateId: "template-standard",
      fachLabel: "A2",
      sort: 2,
      artikelId: "artikel-binde",
      soll: 4,
    },
    {
      id: "position-alt-1",
      templateId: "template-alt",
      fachLabel: "B1",
      sort: 1,
      artikelId: "artikel-kompresse",
      soll: 2,
    },
  ]).run();
  t.db.insert(lagerorte).values([
    {
      id: "fahrzeug-standard",
      name: "RTW 1",
      typ: "fahrzeug",
      kennung: "UE-RK 129",
      aktiv: true,
      templateId: "template-standard",
    },
    {
      id: "fahrzeug-alt-1",
      name: "KTW Alt 1",
      typ: "fahrzeug",
      kennung: null,
      aktiv: true,
      templateId: "template-alt",
    },
    {
      id: "fahrzeug-alt-2",
      name: "KTW Alt 2",
      typ: "fahrzeug",
      kennung: null,
      aktiv: false,
      templateId: "template-alt",
    },
  ]).run();
}

function tabellenProps(inhalt: ReactNode): { zeilen: TemplateAnzeigeZeile[] } {
  const [tabelle] = elementeVomTyp(inhalt, TemplateTable);
  if (!tabelle) throw new Error("Client-Tabelle der Vorlagen fehlt");
  return tabelle.props as { zeilen: TemplateAnzeigeZeile[] };
}

describe("Vorlagenseite als Server Component", () => {
  it("ist dynamisch, directive-frei und behält Table sowie Zellrenderer in der Client-Insel", () => {
    const quelle = readFileSync(PAGE_PFAD, "utf8");

    expect(dynamic).toBe("force-dynamic");
    expect(VorlagenSeite).toBeTypeOf("function");
    expect(hatUseClientDirektive(quelle)).toBe(false);
    expect(importiertAntdTableDirekt(quelle)).toBe(false);
    expect(hatRenderProperty(quelle)).toBe(false);
    expect(quelle).not.toMatch(/from\s+["']next\/link["']/);
    expect(quelle).not.toMatch(/_ui\/Chip/);

    expect(importiertAntdTableDirekt('import { Table as Tabelle } from "antd";'))
      .toBe(true);
    expect(importiertAntdTableDirekt(
      'import * as Antd from "antd"; const tabelle = <Antd.Table />;',
    )).toBe(true);
    expect(hatRenderProperty("const spalten = [{ render: () => null }];")).toBe(true);
  });

  it("projiziert Daten, Links und alle Anzeigetexte rekursiv JSON-sicher", () => {
    vorlagenEintragen();

    const inhalt = vorlagenInhalt(t.db);
    const [kopf] = elementeVomTyp(inhalt, SeitenKopf);
    expect(kopf.props.titel).toBe("Vorlagen");
    expect(kopf.props.beschreibung).toContain("Bestückung einmal definieren");
    expect(isValidElement(kopf.props.aktionen)).toBe(true);
    expect((kopf.props.aktionen as ReactElement).type).toBe(NeuTemplate);

    const props = tabellenProps(inhalt);
    expect(props.zeilen).toEqual(DOM_ZEILEN);
    expect(istRekursivJsonSicher(props)).toBe(true);
  });

  it("liefert im Datenleerfall eine leere primitive Liste an dieselbe Tabelle", () => {
    const props = tabellenProps(vorlagenInhalt(t.db));
    expect(props).toEqual({ zeilen: [] });
    expect(istRekursivJsonSicher(props)).toBe(true);
  });
});

describe("TemplateTable", () => {
  it("ist eine echte Client-Insel mit statischen Spalten", () => {
    const quelle = readFileSync(TABLE_PFAD, "utf8");
    expect(hatUseClientDirektive(quelle)).toBe(true);
    expect(quelle).toMatch(/const\s+SPALTEN\b/);
    expect(quelle).toMatch(/columns=\{SPALTEN\}/);
    expect(quelle).not.toMatch(/columns=\{\s*\[/);
  });

  it("rendert die gefüllte Tabelle mit genau drei Spalten und echten äußeren Links", async () => {
    await mount(<TemplateTable zeilen={DOM_ZEILEN} />);

    expect(queryAll("thead th").map((spalte) => spalte.textContent))
      .toEqual(["Vorlage", "Bestückung", "Fahrzeuge"]);
    expect(query("table").getAttribute("aria-label")).toBe("Vorlagen");
    expect(exists(".ant-pagination")).toBe(false);
    expect(queryAll("tbody tr[data-row-key]").map((zeile) => zeile.getAttribute("data-row-key")))
      .toEqual(["template-standard", "template-alt"]);

    const standard = query<HTMLElement>("tr[data-row-key='template-standard']");
    const standardLink = standard.querySelector<HTMLAnchorElement>(
      "a[href='/verwaltung/vorlagen/template-standard']",
    );
    expect(standardLink?.textContent).toBe("RTW Standard");
    expect(standardLink?.style.fontWeight).toBe("600");
    expect(standard.textContent).toContain("2 Positionen · 2 Fächer");
    expect(standard.textContent).toContain("1 Fahrzeug");
    expect(standard.textContent).not.toContain("inaktiv");

    const alt = query<HTMLElement>("tr[data-row-key='template-alt']");
    expect(alt.querySelector("a")?.getAttribute("href"))
      .toBe("/verwaltung/vorlagen/template-alt");
    expect(alt.textContent).toContain("inaktiv");
    expect(alt.textContent).toContain("1 Position · 1 Fach");
    expect(alt.textContent).toContain("2 Fahrzeuge");
    expect(alt.querySelectorAll(`.${s.chip}`)).toHaveLength(2);
    const fahrzeugChip = Array.from(alt.querySelectorAll<HTMLElement>(`.${s.chip}`))
      .find((chip) => chip.textContent?.includes("2 Fahrzeuge"));
    expect(fahrzeugChip?.querySelector("svg")).not.toBeNull();
  });

  it("aktiviert horizontales Scrollen und zeigt den fachlichen Leertext", async () => {
    await mount(<TemplateTable zeilen={DOM_ZEILEN} />);
    expect(query<HTMLElement>(".ant-table-content").style.overflowX).toBe("auto");
    await unmount();

    await mount(<TemplateTable zeilen={[]} />);
    expect(document.body.textContent).toContain(
      "Noch keine Vorlagen. Lege oben die erste an — oder erstelle eine Vorlage direkt aus einem gepackten Fahrzeug.",
    );
  });
});
