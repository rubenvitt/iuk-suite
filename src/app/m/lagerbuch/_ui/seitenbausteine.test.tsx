// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { mount, unmount, query, queryAll, exists } from "@/app/m/qr/_lib/test-dom";
import { SeitenKopf } from "./SeitenKopf";
import { Kachel } from "./Kachel";
import s from "./verwaltung.module.css";

function parseQuelle(quelle: string): ts.SourceFile {
  return ts.createSourceFile(
    "Komponente.tsx",
    quelle,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function hatUseClientDirektive(quelle: string): boolean {
  // Kommentare sind AST-Trivia und erscheinen nicht in `statements`. Dadurch
  // beginnt die Pruefung am echten Direktiven-Prolog, unabhaengig von Laenge
  // und Form fuehrender Kommentare.
  for (const statement of parseQuelle(quelle).statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) {
      return false;
    }
    if (statement.expression.text === "use client") return true;
  }
  return false;
}

function importDeklarationen(quelle: string): ts.ImportDeclaration[] {
  return parseQuelle(quelle).statements.filter(ts.isImportDeclaration);
}

function modulSpezifizierer(deklaration: ts.ImportDeclaration): string | null {
  return ts.isStringLiteral(deklaration.moduleSpecifier)
    ? deklaration.moduleSpecifier.text
    : null;
}

function importiertAntdBreadcrumb(quelle: string): boolean {
  return importDeklarationen(quelle).some((deklaration) => {
    const modul = modulSpezifizierer(deklaration);
    if (modul !== "antd" && !modul?.startsWith("antd/")) return false;

    if (modul.toLowerCase().split("/").includes("breadcrumb")) return true;

    const bindungen = deklaration.importClause?.namedBindings;
    return Boolean(
      bindungen &&
      ts.isNamedImports(bindungen) &&
      bindungen.elements.some(
        (element) => (element.propertyName ?? element.name).text === "Breadcrumb",
      ),
    );
  });
}

function importiertAntdIcons(quelle: string): boolean {
  return importDeklarationen(quelle).some((deklaration) => {
    const modul = modulSpezifizierer(deklaration);
    return modul === "@ant-design/icons" || Boolean(modul?.startsWith("@ant-design/icons/"));
  });
}

afterEach(async () => { await unmount(); });

describe("Quelltext-Riegel", () => {
  it("erkennt eine wirksame use-client-Direktive nach mehr als 200 Byte Kommentar", () => {
    const quelle = `/* ${"Nur ein fuehrender Kommentar ohne semantische Wirkung. ".repeat(8)} */
"use client";
export function Beispiel() { return null; }
`;
    expect(quelle.indexOf('"use client"')).toBeGreaterThan(200);
    expect(hatUseClientDirektive(quelle)).toBe(true);
  });

  it("akzeptiert die Worte use client in einem Kommentar", () => {
    const quelle = `/* Warum diese Server-Komponente kein "use client" traegt. */
export function Beispiel() { return null; }
`;
    expect(hatUseClientDirektive(quelle)).toBe(false);
  });

  it.each([
    ["benannten Root-Import", 'import { Breadcrumb } from "antd";'],
    ["aliasierten Root-Import", 'import { Breadcrumb as Pfad } from "antd";'],
    ["aliasierten ES-Unterpfadimport", 'import { default as Pfad } from "antd/es/breadcrumb";'],
    ["LIB-Unterpfadimport", 'import Pfad from "antd/lib/breadcrumb/index.js";'],
  ])("erkennt einen %s", (_fall, quelle) => {
    expect(importiertAntdBreadcrumb(quelle)).toBe(true);
  });

  it("akzeptiert das Wort Breadcrumb in einem Kommentar", () => {
    const quelle = `/* Breadcrumb bleibt hier absichtlich eine begruendende Vokabel. */
export function Beispiel() { return null; }
`;
    expect(importiertAntdBreadcrumb(quelle)).toBe(false);
  });
});

describe("SeitenKopf", () => {
  it("rendert ein nacktes <h1>, kein Typography.Title", async () => {
    await mount(<SeitenKopf titel="Artikel & Bestand" />);
    const h1 = query("h1");
    expect(h1.textContent).toBe("Artikel & Bestand");
    // Typography.Title waere ein Compound-Zugriff und ergaebe in einer Server
    // Component HTTP 500 — auf 23 Seiten.
    expect(h1.className).not.toMatch(/ant-typography/);
  });

  it("setzt die Titel-Rolle als Inline-Stil, nicht als Klasse", async () => {
    await mount(<SeitenKopf titel="Journal" />);
    expect(query("h1").getAttribute("style")).toMatch(/font-size:\s*24px/);
  });

  it("rendert Beschreibung und Aktionen, wenn sie da sind", async () => {
    await mount(
      <SeitenKopf
        titel="Vorlagen"
        beschreibung={<span>Bestückung einmal definieren.</span>}
        aktionen={<button type="button">Neue Vorlage</button>}
      />,
    );
    expect(document.body.textContent).toContain("Bestückung einmal definieren.");
    expect(query("button").textContent).toBe("Neue Vorlage");
  });

  it("rendert ohne Beschreibung und ohne Aktionen genau ein Kind", async () => {
    await mount(<SeitenKopf titel="Inventur" />);
    expect(queryAll("h1")).toHaveLength(1);
    expect(exists("p")).toBe(false);
  });
});

describe("Kachel", () => {
  it("rendert Zahl und Beschriftung", async () => {
    await mount(<Kachel zahl={7} beschriftung="Artikel unter Mindestbestand" />);
    expect(document.body.textContent).toContain("7");
    expect(document.body.textContent).toContain("Artikel unter Mindestbestand");
  });

  it("die Zahl traegt tabular-nums und KEINE Farbe", async () => {
    await mount(<Kachel zahl={12} beschriftung="offene Bestellpositionen" ton="rot" />);
    const zahl = query("[data-rolle='kachelzahl']");
    expect(zahl.getAttribute("style")).toMatch(/font-variant-numeric:\s*tabular-nums/);
    // Eine rote 7 IST Rot auf einer Datenflaeche — die Kante traegt die Farbe,
    // die Zahl traegt Tinte (§6.6.4).
    expect(zahl.getAttribute("style")).not.toMatch(/color:/);
  });

  it.each([
    ["rot", "kpiRot"],
    ["gelb", "kpiGelb"],
    ["ok", "kpiOk"],
  ] as const)("faerbt bei Ton %s die Kante ueber .%s", async (ton, klasse) => {
    await mount(<Kachel zahl={1} beschriftung="x" ton={ton} />);
    expect(query(`.${s.kpi}`).className.split(" ")).toContain(s[klasse]);
  });

  it("bekommt ohne Ton keine Kantenklasse", async () => {
    await mount(<Kachel zahl={1} beschriftung="x" />);
    const klassen = query(`.${s.kpi}`).className.split(" ");
    expect(klassen).not.toContain(s.kpiRot);
    expect(klassen).not.toContain(s.kpiGelb);
    expect(klassen).not.toContain(s.kpiOk);
  });

  it("`grau` faerbt die Kante NICHT — er ist kein Ampelwert", async () => {
    await mount(<Kachel zahl={1} beschriftung="x" ton="grau" />);
    const klassen = query(`.${s.kpi}`).className.split(" ");
    expect(klassen).not.toContain(s.kpiRot);
    expect(klassen).not.toContain(s.kpiGelb);
    expect(klassen).not.toContain(s.kpiOk);
  });

  it("mit href wird sie ein Link mit Chevron", async () => {
    // Eine klickbare Kachel ohne erkennbare Klickbarkeit ist eine Sackgasse
    // fuer alle, die es nicht zufaellig ausprobieren.
    await mount(<Kachel zahl={3} beschriftung="abgelaufen" ton="rot" href="/verwaltung/verfall" />);
    const a = query("a");
    expect(a.getAttribute("href")).toBe("/verwaltung/verfall");
    expect(a.className.split(" ")).toContain(s.kpiLink);
    expect(exists("a svg")).toBe(true);
  });

  it("ohne href gibt es keinen Link und kein Chevron", async () => {
    await mount(<Kachel zahl={3} beschriftung="Buchungen im Journal" />);
    expect(exists("a")).toBe(false);
    expect(exists("svg")).toBe(false);
  });
});

/*
 * ZWEI STATT DREI SEIT DEM 13.08.2026: `Brotkrume.tsx` ist geloescht, ihr
 * Rueckweg liegt seit dem Navigations-Umbau in `core/shell/Seitenkopf`
 * (Prop `zurueck`). Die Aussage dieses Blocks aendert sich dadurch NICHT — sie
 * gilt jedem Baustein, den eine Server Component rendert, nicht der Zahl drei.
 * Der Titel nennt deshalb keine Anzahl mehr: eine Zahl im Titel wird bei jedem
 * weiteren Baustein still falsch, ohne dass ein Test rot wird.
 */
describe("Die Verwaltungsbausteine sind RSC-tauglich", () => {
  it.each(["SeitenKopf", "Kachel"])("%s.tsx traegt kein \"use client\"", (name) => {
    const quelle = readFileSync(`src/app/m/lagerbuch/_ui/${name}.tsx`, "utf8");
    expect(hatUseClientDirektive(quelle)).toBe(false);
  });

  it.each(["SeitenKopf", "Kachel"])("%s.tsx importiert keine Icons aus antd", (name) => {
    const quelle = readFileSync(`src/app/m/lagerbuch/_ui/${name}.tsx`, "utf8");
    expect(importiertAntdIcons(quelle)).toBe(false);
  });
});
