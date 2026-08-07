import { Table } from "antd";
import Link from "next/link";
import { readFileSync } from "node:fs";
import {
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checks, lagerorte } from "../../../_db/schema";
import { migrierteTestDb, type TestDb } from "../../../_db/testdb";
import { Chip } from "../../../_ui/Chip";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { Trefferanzeige } from "../../../_ui/Trefferanzeige";
import { ChecksFilter } from "./ChecksFilter";
import ChecksSeite, { checksInhalt, dynamic } from "./page";

const ZEIT = new Date("2026-08-07T10:00:00Z");
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-seite-checks-");
  t.db.insert(lagerorte).values({
    id: "rtw-1",
    name: "RTW 1",
    typ: "fahrzeug",
    kennung: "UE-RK 1234",
    aktiv: true,
  }).run();
});

afterEach(() => {
  t.schliessen();
});

function checkEintragen({
  id,
  completedAt = ZEIT,
  ergebnis = "[]",
}: {
  id: string;
  completedAt?: Date | null;
  ergebnis?: string;
}) {
  t.db.insert(checks).values({
    id,
    fahrzeugId: "rtw-1",
    quelleTyp: "system",
    quelleId: "test",
    startedAt: ZEIT,
    completedAt,
    ergebnis,
  }).run();
}

function checksMitGleicherSekunde(anzahl: number): void {
  for (let index = 0; index < anzahl; index += 1) {
    checkEintragen({ id: `check-${String(index).padStart(3, "0")}` });
  }
}

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

function textVon(wert: ReactNode): string {
  if (typeof wert === "string" || typeof wert === "number") return String(wert);
  if (Array.isArray(wert)) return wert.map(textVon).join("");
  if (!isValidElement(wert)) return "";
  return textVon((wert.props as { children?: ReactNode }).children);
}

function enthaeltDate(wert: unknown, gesehen = new WeakSet<object>()): boolean {
  if (wert instanceof Date) return true;
  if (Array.isArray(wert)) return wert.some((eintrag) => enthaeltDate(eintrag, gesehen));
  if (wert === null || typeof wert !== "object") return false;
  if (gesehen.has(wert)) return false;
  gesehen.add(wert);
  if (isValidElement(wert)) {
    return enthaeltDate((wert as ReactElement<Record<string, unknown>>).props, gesehen);
  }
  return Object.values(wert).some((eintrag) => enthaeltDate(eintrag, gesehen));
}

type TabellenProps = {
  rowKey: string;
  pagination: boolean;
  scroll: { x: string };
  "aria-label": string;
  locale: { emptyText: ReactNode };
  columns: Array<{ title: ReactNode; dataIndex: string; align?: string }>;
  dataSource: Array<Record<string, ReactNode>>;
};

function tabelleAus(seite: ReactNode): TabellenProps {
  const [tabelle] = elementeVomTyp(seite, Table);
  if (!tabelle) throw new Error("Check-Tabelle fehlt");
  return tabelle.props as TabellenProps;
}

function analysiereRscGrenze(quelle: string) {
  const source = ts.createSourceFile(
    "page.tsx",
    quelle,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let renderEigenschaften = 0;
  let nichtStatischeRowKeys = 0;

  function heisstRender(name: ts.PropertyName): boolean {
    if ((ts.isIdentifier(name) || ts.isStringLiteral(name)) && name.text === "render") {
      return true;
    }
    return ts.isComputedPropertyName(name)
      && ts.isStringLiteral(name.expression)
      && name.expression.text === "render";
  }

  function besuche(node: ts.Node) {
    if (
      (
        ts.isPropertyAssignment(node)
        || ts.isMethodDeclaration(node)
        || ts.isShorthandPropertyAssignment(node)
        || ts.isGetAccessorDeclaration(node)
        || ts.isSetAccessorDeclaration(node)
      )
      && heisstRender(node.name)
    ) {
      renderEigenschaften += 1;
    }
    if (ts.isJsxAttribute(node) && node.name.getText(source) === "rowKey") {
      const initializer = node.initializer;
      const statischerString = initializer !== undefined && (
        ts.isStringLiteral(initializer)
        || (
          ts.isJsxExpression(initializer)
          && initializer.expression !== undefined
          && (
            ts.isStringLiteral(initializer.expression)
            || ts.isNoSubstitutionTemplateLiteral(initializer.expression)
          )
        )
      );
      if (!statischerString) nichtStatischeRowKeys += 1;
    }
    ts.forEachChild(node, besuche);
  }

  besuche(source);
  return { renderEigenschaften, nichtStatischeRowKeys };
}

function runtimeImporteAusChecksFilter(quelle: string): string[] {
  const source = ts.createSourceFile(
    "page.tsx",
    quelle,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const namen: string[] = [];
  for (const anweisung of source.statements) {
    if (
      !ts.isImportDeclaration(anweisung)
      || !ts.isStringLiteral(anweisung.moduleSpecifier)
      || anweisung.moduleSpecifier.text !== "./ChecksFilter"
    ) continue;
    const klausel = anweisung.importClause;
    if (!klausel || klausel.isTypeOnly) continue;
    if (klausel.name) namen.push(klausel.name.text);
    if (klausel.namedBindings && ts.isNamedImports(klausel.namedBindings)) {
      for (const element of klausel.namedBindings.elements) {
        if (!element.isTypeOnly) namen.push(element.propertyName?.text ?? element.name.text);
      }
    }
  }
  return namen;
}

describe("Checks-Seite", () => {
  it("ist eine dynamische App-Router-Seite", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(ChecksSeite).toBeTypeOf("function");
  });

  it("koppelt 51 Checks an exakt die neuesten 50 IDs in der Totalordnung", () => {
    checksMitGleicherSekunde(51);

    const seite = checksInhalt(t.db, {});
    const tabelle = tabelleAus(seite);
    const erwarteteIds = Array.from(
      { length: 50 },
      (_, index) => `check-${String(50 - index).padStart(3, "0")}`,
    );

    expect(tabelle.dataSource.map((zeile) => zeile.id)).toEqual(erwarteteIds);
    expect(tabelle.dataSource).toHaveLength(50);
    expect(tabelle.dataSource.some((zeile) => zeile.id === "check-000")).toBe(false);
    const [kopf] = elementeVomTyp(seite, SeitenKopf);
    expect(kopf.props.beschreibung)
      .toBe("Neueste 50 von mehr Treffern — Zeitraum eingrenzen");
    expect(elementeVomTyp(seite, Trefferanzeige)).toHaveLength(0);
    expect(enthaeltDate(tabelle.dataSource)).toBe(false);
  });

  it("behauptet bei exakt 50 Checks nicht, dass weitere Treffer vorhanden sind", () => {
    checksMitGleicherSekunde(50);

    const seite = checksInhalt(t.db, {});
    const tabelle = tabelleAus(seite);

    expect(tabelle.dataSource.map((zeile) => zeile.id)).toEqual(Array.from(
      { length: 50 },
      (_, index) => `check-${String(49 - index).padStart(3, "0")}`,
    ));
    const [kopf] = elementeVomTyp(seite, SeitenKopf);
    expect(kopf.props.beschreibung).toBe("50 Treffer");
  });

  it("bereitet Links, Abschlusszeit, Ergebnis-Chips und Positionszahl serverseitig vor", () => {
    checkEintragen({
      id: "check-aussage",
      ergebnis: JSON.stringify({
        positionen: [{ sollPositionId: "sp-1", artikelId: "a-1", soll: 4, ist: 3 }],
        artikel: [{
          artikelId: "a-1",
          sollSumme: 4,
          istSumme: 2,
          recordedVorher: 3,
          korrektur: -2,
          nachfuellGewuenscht: 1,
          nachfuellGebucht: 1,
        }],
        geraete: [{
          geraetId: "g-1",
          vorhanden: false,
          zustand: "Defekt",
          bemerkung: null,
        }],
        flaschen: [{
          flascheId: "f-1",
          druckBar: 10,
          nennfuelldruckBar: 200,
        }],
        verfall: [],
      }),
    });

    const zeile = tabelleAus(checksInhalt(t.db, {})).dataSource[0];
    const [link] = elementeVomTyp(zeile.fahrzeug, Link);
    expect(link.props.href).toBe("/verwaltung/checks/check-aussage");
    expect(textVon(zeile.fahrzeug)).toBe("RTW 1");
    expect(textVon(zeile.abgeschlossen)).toBe("7.8.2026, 12:00:00");
    expect(textVon(zeile.positionen)).toBe("1");

    expect(elementeVomTyp(zeile.ergebnis, Chip).map((chip) => ({
      ton: chip.props.ton,
      zeichen: chip.props.zeichen,
      text: textVon(chip),
    }))).toEqual([
      { ton: "rot", zeichen: undefined, text: "1 aus Handlager nachgefüllt" },
      { ton: "gelb", zeichen: undefined, text: "2 korrigiert" },
      { ton: "rot", zeichen: "warnung", text: "1 fehlt weiterhin" },
      { ton: "rot", zeichen: undefined, text: "1 Gerät(e) auffällig" },
      { ton: "rot", zeichen: "sauerstoff", text: "1 Flasche(n) niedrig" },
    ]);
    expect(textVon(zeile.ergebnis)).not.toContain("vollständig");
    expect(enthaeltDate(zeile)).toBe(false);
  });

  it("zeigt ohne Auffälligkeit ausschließlich den vollständigen Status", () => {
    checkEintragen({ id: "check-vollstaendig" });

    const zeile = tabelleAus(checksInhalt(t.db, {})).dataSource[0];
    const chips = elementeVomTyp(zeile.ergebnis, Chip);

    expect(chips).toHaveLength(1);
    expect(chips[0].props.ton).toBe("ok");
    expect(textVon(chips[0])).toBe("vollständig");
  });

  it("zeigt einen Check ohne Abschlusszeit als Gedankenstrich statt als Datum", () => {
    checkEintragen({ id: "check-offen", completedAt: null });

    const zeile = tabelleAus(checksInhalt(t.db, {})).dataSource[0];

    expect(textVon(zeile.abgeschlossen)).toBe("—");
    expect(enthaeltDate(zeile.abgeschlossen)).toBe(false);
  });

  it("normalisiert ungültige Grenzen vor der Client-Insel und ignoriert sie beim Lesen", () => {
    checkEintragen({ id: "check-trotz-ungueltig" });

    const seite = checksInhalt(t.db, {
      von: "  unsinn  ",
      bis: " 2026-02-31 ",
    });
    const [filter] = elementeVomTyp(seite, ChecksFilter);
    const tabelle = tabelleAus(seite);

    expect(filter.props).toMatchObject({
      fz: "",
      von: "",
      bis: "",
      hinweise: [
        "Das Datum in der Adresse ist ungültig und wurde ignoriert.",
        "Das Datum in der Adresse ist ungültig und wurde ignoriert.",
      ],
    });
    expect(tabelle.dataSource.map((zeile) => zeile.id)).toEqual(["check-trotz-ungueltig"]);
    expect(tabelle.locale.emptyText).toBe("Noch kein abgeschlossener Fahrzeug-Check.");
  });

  it("behält gültige umgekehrte Grenzen sichtbar und zeigt den gefilterten Leertext", () => {
    checkEintragen({ id: "check-ausserhalb" });

    const seite = checksInhalt(t.db, {
      von: "  2026-08-07 ",
      bis: " 2026-08-01  ",
    });
    const [filter] = elementeVomTyp(seite, ChecksFilter);
    const tabelle = tabelleAus(seite);

    expect(filter.props).toMatchObject({
      von: "2026-08-07",
      bis: "2026-08-01",
      hinweise: ["Der Zeitraum ist leer: „von“ liegt nach „bis“."],
    });
    expect(tabelle.dataSource).toEqual([]);
    expect(tabelle.locale.emptyText).toBe("Kein Check passt zu Fahrzeug und Zeitraum.");
  });

  it("ignoriert unbekannte Fahrzeug-IDs und sortiert die Auswahl deutsch nach Namen", () => {
    t.db.insert(lagerorte).values([
      { id: "fz-z", name: "Zulu", typ: "fahrzeug", kennung: null, aktiv: true },
      { id: "fz-a", name: "Ärztewagen", typ: "fahrzeug", kennung: null, aktiv: true },
    ]).run();

    const seite = checksInhalt(t.db, { fz: "nicht-vorhanden" });
    const [filter] = elementeVomTyp(seite, ChecksFilter);

    expect(filter.props.fz).toBe("");
    expect((filter.props.fahrzeuge as Array<{ id: string }>).map((fahrzeug) => fahrzeug.id))
      .toEqual(["fz-a", "rtw-1", "fz-z"]);
  });

  it("setzt die vollständigen statischen Tabellenverträge", () => {
    const tabelle = tabelleAus(checksInhalt(t.db, {}));

    expect(tabelle.rowKey).toBe("id");
    expect(tabelle.pagination).toBe(false);
    expect(tabelle.scroll).toEqual({ x: "max-content" });
    expect(tabelle["aria-label"]).toBe("Fahrzeug-Checks");
    expect(tabelle.columns.map((spalte) => spalte.title))
      .toEqual(["Fahrzeug", "Abgeschlossen", "Ergebnis", "Positionen"]);
    expect(tabelle.columns.map((spalte) => spalte.dataIndex))
      .toEqual(["fahrzeug", "abgeschlossen", "ergebnis", "positionen"]);
    expect(tabelle.columns[3].align).toBe("right");
  });

  it("verriegelt die RSC-Grenze gegen Render-Methoden und nicht statische rowKeys", () => {
    const pfad = "src/app/m/lagerbuch/verwaltung/(arbeit)/checks/page.tsx";
    const quelle = readFileSync(pfad, "utf8");

    expect(analysiereRscGrenze(quelle)).toEqual({
      renderEigenschaften: 0,
      nichtStatischeRowKeys: 0,
    });
    expect(runtimeImporteAusChecksFilter(quelle)).toEqual(["ChecksFilter"]);

    const mutation = `
      const render = () => null;
      const spalten = [
        { render() { return null; } },
        { "render": () => null },
        { ["render"]: () => null },
        { render },
      ];
      const tabelle = <Table rowKey={(zeile) => zeile.id} columns={spalten} />;
    `;
    expect(analysiereRscGrenze(mutation)).toEqual({
      renderEigenschaften: 4,
      nichtStatischeRowKeys: 1,
    });
  });
});
