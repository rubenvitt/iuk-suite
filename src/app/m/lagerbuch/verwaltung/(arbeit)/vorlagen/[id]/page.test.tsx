// @vitest-environment jsdom

import { act, isValidElement, type ReactElement, type ReactNode } from "react";
import { Card } from "antd";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import {
  artikel,
  fahrzeugTemplates,
  lagerorte,
  templatePositionen,
} from "../../../../_db/schema";
import { migrierteTestDb, type TestDb } from "../../../../_db/testdb";
import { Chip } from "../../../../_ui/Chip";
import { Kachel } from "../../../../_ui/Kachel";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import verwaltungStyles from "../../../../_ui/verwaltung.module.css";
import { TemplateAktionen } from "./TemplateAktionen";
import { TemplatePosEditor } from "./TemplatePosEditor";
import {
  VerknuepfteFahrzeugeTable,
  type VerknuepftesFahrzeugDto,
} from "./VerknuepfteFahrzeugeTable";
import VorlageDetailSeite, { dynamic } from "./page";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock("../../../../_db/client", () => ({
  getDb: () => mocks.getDb(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const NOW = new Date("2026-08-07T12:00:00Z");
const echtesGetComputedStyle = globalThis.getComputedStyle;
let t: TestDb;

function elementeVomTyp(wert: ReactNode, typ: unknown): ReactElement[] {
  if (Array.isArray(wert)) return wert.flatMap((kind) => elementeVomTyp(kind, typ));
  if (!isValidElement(wert)) return [];
  const treffer = wert.type === typ ? [wert] : [];
  const kinder = (wert.props as { children?: ReactNode }).children;
  return [...treffer, ...elementeVomTyp(kinder, typ)];
}

function istRekursivJsonSicher(wert: unknown): boolean {
  if (wert === null || typeof wert === "string" || typeof wert === "boolean") return true;
  if (typeof wert === "number") return Number.isFinite(wert);
  if (Array.isArray(wert)) return wert.every(istRekursivJsonSicher);
  if (
    typeof wert !== "object"
    || isValidElement(wert)
    || wert instanceof Date
    || Object.getPrototypeOf(wert) !== Object.prototype
  ) return false;
  return Reflect.ownKeys(wert).every((schluessel) =>
    typeof schluessel === "string"
    && istRekursivJsonSicher((wert as Record<string, unknown>)[schluessel]));
}

function importiertAntdTableDirekt(quelle: string): boolean {
  const source = ts.createSourceFile(
    "page.tsx",
    quelle,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const objektImporte = new Set<string>();
  for (const anweisung of source.statements) {
    if (!ts.isImportDeclaration(anweisung) || !ts.isStringLiteral(anweisung.moduleSpecifier)) {
      continue;
    }
    const klausel = anweisung.importClause;
    if (!klausel || klausel.isTypeOnly) continue;
    const bindungen = klausel.namedBindings;
    if (/^antd\/(?:es|lib)\/table(?:\/|$)/i.test(anweisung.moduleSpecifier.text)) return true;
    if (anweisung.moduleSpecifier.text !== "antd") continue;
    if (klausel.name) objektImporte.add(klausel.name.text);
    if (bindungen && ts.isNamespaceImport(bindungen)) objektImporte.add(bindungen.name.text);
    if (bindungen && ts.isNamedImports(bindungen) && bindungen.elements.some((element) =>
      !element.isTypeOnly
      && (element.propertyName?.text ?? element.name.text) === "Table")) return true;
  }

  let gefunden = false;
  function besuche(node: ts.Node): void {
    if (
      ts.isPropertyAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && objektImporte.has(node.expression.text)
      && node.name.text === "Table"
    ) gefunden = true;
    ts.forEachChild(node, besuche);
  }
  ts.forEachChild(source, besuche);
  return gefunden;
}

async function seite(id = "tpl-rtw"): Promise<ReactNode> {
  return VorlageDetailSeite({ params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("getComputedStyle", (element: Element, pseudo?: string | null) => {
    if (pseudo) {
      return { getPropertyValue: () => "" } as unknown as CSSStyleDeclaration;
    }
    return echtesGetComputedStyle(element);
  });
  t = migrierteTestDb("lagerbuch-vorlage-detail-seite-");
  t.db.insert(fahrzeugTemplates).values({
    id: "tpl-rtw",
    name: "RTW Standard",
    aktiv: false,
    createdAt: NOW,
  }).run();
  t.db.insert(lagerorte).values([
    {
      id: "rtw-inaktiv",
      name: "Ersatzwagen",
      typ: "fahrzeug",
      kennung: null,
      aktiv: false,
      templateId: "tpl-rtw",
    },
    {
      id: "rtw-aktiv",
      name: "RTW Nord",
      typ: "fahrzeug",
      kennung: "UE-RK 112",
      aktiv: true,
      templateId: "tpl-rtw",
    },
    {
      id: "rtw-fremd",
      name: "RTW Fremd",
      typ: "fahrzeug",
      kennung: "UE-RK 999",
      aktiv: true,
      templateId: null,
    },
  ]).run();
  t.db.insert(artikel).values([
    {
      id: "a-aktiv",
      name: "Verbandpäckchen",
      einheit: "Stk.",
      fach: "Handlager A1",
      mindestbestand: 0,
      aktiv: true,
      createdAt: NOW,
    },
    {
      id: "a-inaktiv",
      name: "Altartikel",
      einheit: "Stk.",
      fach: "Handlager Z9",
      mindestbestand: 0,
      aktiv: false,
      createdAt: NOW,
    },
  ]).run();
  t.db.insert(templatePositionen).values({
    id: "tp-1",
    templateId: "tpl-rtw",
    fachLabel: "Fach 2",
    sort: 7,
    artikelId: "a-aktiv",
    soll: 4,
  }).run();
  mocks.getDb.mockReturnValue(t.db);
});

afterEach(async () => {
  await unmount();
  t.schliessen();
  vi.unstubAllGlobals();
});

describe("Vorlagen-Detailseite als Server Component", () => {
  it("ist dynamisch, hat async Params und liefert für unbekannte IDs 404", async () => {
    expect(dynamic).toBe("force-dynamic");
    expect(VorlageDetailSeite).toBeTypeOf("function");
    await expect(seite("fehlt")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("zeigt Pflicht-Rueckweg, Kopf und die drei Bereiche", async () => {
    const inhalt = await seite();
    const kopf = elementeVomTyp(inhalt, SeitenKopf)[0];
    const zurueck = (kopf.props as {
      zurueck?: { titel: string; href: string };
    }).zurueck;
    expect(zurueck).toEqual({ titel: "Alle Vorlagen", href: "/verwaltung/vorlagen" });
    expect((kopf.props as { titel: string }).titel).toBe("RTW Standard");
    expect(elementeVomTyp(
      (kopf.props as { beschreibung: ReactNode }).beschreibung,
      Chip,
    )).toHaveLength(1);

    // Die Zahlen aus dem frueheren Fliesstext stehen jetzt auf den Kacheln,
    // nicht mehr zusaetzlich in der Kopf-Beschreibung (sonst stuende dieselbe
    // Zahl zweimal auf der Seite).
    const kacheln = elementeVomTyp(inhalt, Kachel);
    expect(kacheln.map((k) => (k.props as { beschriftung: ReactNode }).beschriftung)).toEqual([
      "Positionen",
      "Fächer",
      "Fahrzeuge",
    ]);
    expect(kacheln.map((k) => (k.props as { zahl: ReactNode }).zahl)).toEqual([1, 1, 2]);

    expect(elementeVomTyp(inhalt, Card).map((karte) =>
      (karte.props as { title: string }).title)).toEqual([
      "Positionen",
      "Verknüpfte Fahrzeuge",
      "Aktionen",
    ]);
  });

  it("übergibt den Inseln ausschließlich explizite, rekursiv JSON-sichere DTOs", async () => {
    const inhalt = await seite();
    const editor = elementeVomTyp(inhalt, TemplatePosEditor)[0];
    const fahrzeuge = elementeVomTyp(inhalt, VerknuepfteFahrzeugeTable)[0];
    const aktionen = elementeVomTyp(inhalt, TemplateAktionen)[0];

    expect(editor.props).toEqual({
      templateId: "tpl-rtw",
      positionen: [{
        id: "tp-1",
        fachLabel: "Fach 2",
        sort: 7,
        artikelId: "a-aktiv",
        artikelName: "Verbandpäckchen",
        einheit: "Stk.",
        handlagerFach: "Handlager A1",
        soll: 4,
      }],
      artikel: [{ id: "a-aktiv", name: "Verbandpäckchen", fach: "Handlager A1" }],
    });
    expect(fahrzeuge.props).toEqual({
      zeilen: [
        { id: "rtw-aktiv", name: "RTW Nord", kennung: "UE-RK 112", aktiv: true },
        { id: "rtw-inaktiv", name: "Ersatzwagen", kennung: null, aktiv: false },
      ],
    });
    expect(aktionen.props).toEqual({
      id: "tpl-rtw",
      name: "RTW Standard",
      aktiv: false,
      fahrzeuge: 2,
    });
    expect([editor.props, fahrzeuge.props, aktionen.props].every(istRekursivJsonSicher)).toBe(true);
  });

  it("importiert und rendert in der RSC keine antd-Tabelle", () => {
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/vorlagen/[id]/page.tsx",
      "utf8",
    );
    expect(quelle).not.toMatch(/^\s*["']use client["']/m);
    expect(importiertAntdTableDirekt(quelle)).toBe(false);
    expect(quelle).not.toMatch(/\brender\s*:/);
    expect(quelle).not.toMatch(/<Table\b|Table\.Column|Card\.Meta|Typography\.Title/);
  });
});

describe("VerknuepfteFahrzeugeTable", () => {
  const ZEILEN: VerknuepftesFahrzeugDto[] = [
    { id: "rtw-aktiv", name: "RTW Nord", kennung: "UE-RK 112", aktiv: true },
    { id: "rtw-inaktiv", name: "Ersatzwagen", kennung: null, aktiv: false },
  ];

  it("rendert die gefüllte Tabelle vollständig mit äußeren Fahrzeug-Links", async () => {
    await mount(<VerknuepfteFahrzeugeTable zeilen={ZEILEN} />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(queryAll("thead th").map((zelle) => zelle.textContent)).toEqual([
      "Fahrzeug",
      "Status",
    ]);
    expect(queryAll("tbody tr[data-row-key]").map((zeile) =>
      zeile.getAttribute("data-row-key"))).toEqual(["rtw-aktiv", "rtw-inaktiv"]);
    const links = queryAll<HTMLAnchorElement>("tbody a");
    expect(links.map((link) => ({ href: link.getAttribute("href"), text: link.textContent })))
      .toEqual([
        { href: "/verwaltung/fahrzeuge/rtw-aktiv", text: "RTW Nord (UE-RK 112)" },
        { href: "/verwaltung/fahrzeuge/rtw-inaktiv", text: "Ersatzwagen" },
      ]);
    expect(queryAll(`tbody .${verwaltungStyles.chip}.${verwaltungStyles.grau}`)
      .map((chip) => chip.textContent)).toEqual(["inaktiv"]);
    expect(queryAll("[aria-label='Verknüpfte Fahrzeuge']")).toHaveLength(1);
    expect(queryAll(".ant-pagination")).toHaveLength(0);
  });

  it("zeigt einen festen Leertext und hält die Spalten statisch in der Client-Insel", async () => {
    await mount(<VerknuepfteFahrzeugeTable zeilen={[]} />);
    expect(document.body.textContent).toContain("Kein Fahrzeug nutzt diese Vorlage.");

    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/vorlagen/[id]/VerknuepfteFahrzeugeTable.tsx",
      "utf8",
    );
    expect(quelle).toMatch(/^\s*["']use client["'];/);
    expect(quelle).toMatch(/const\s+SPALTEN[^=]*=/);
    expect(quelle).toMatch(/rowKey="id"[\s\S]*pagination=\{false\}[\s\S]*scroll=\{\{ x: "max-content" \}\}/);
  });
});
