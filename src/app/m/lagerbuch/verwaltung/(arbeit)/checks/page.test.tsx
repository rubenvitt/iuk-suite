import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checks, lagerorte } from "../../../_db/schema";
import { migrierteTestDb, type TestDb } from "../../../_db/testdb";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { Trefferanzeige } from "../../../_ui/Trefferanzeige";
import { ChecksFilter } from "./ChecksFilter";
import { ChecksTabelle, type ChecksTabelleProps } from "./ChecksTabelle";
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

function importiertAntdTableDirekt(quelle: string): boolean {
  const source = ts.createSourceFile(
    "page.tsx",
    quelle,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  return source.statements.some((anweisung) => {
    if (
      !ts.isImportDeclaration(anweisung)
      || !ts.isStringLiteral(anweisung.moduleSpecifier)
    ) return false;
    if (/^antd\/(?:es|lib)\/table(?:\/|$)/i.test(anweisung.moduleSpecifier.text)) {
      return true;
    }
    if (anweisung.moduleSpecifier.text !== "antd") return false;
    const klausel = anweisung.importClause;
    if (!klausel) return false;
    if (klausel.name) return true;
    const bindungen = anweisung.importClause?.namedBindings;
    if (bindungen && ts.isNamespaceImport(bindungen)) return true;
    return Boolean(bindungen && ts.isNamedImports(bindungen)
      && bindungen.elements.some((element) =>
        (element.propertyName?.text ?? element.name.text) === "Table"));
  });
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

function tabelleAus(seite: ReactNode): ChecksTabelleProps {
  const [tabelle] = elementeVomTyp(seite, ChecksTabelle);
  if (!tabelle) throw new Error("Client-Tabelle der Checks fehlt");
  return tabelle.props as ChecksTabelleProps;
}

describe("Checks-Seite", () => {
  it("ist eine dynamische App-Router-Seite", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(ChecksSeite).toBeTypeOf("function");
  });

  it("schickt nur rekursiv JSON-sichere DTOs an die route-lokale Client-Tabelle", () => {
    checkEintragen({ id: "check-hydration" });

    const props = tabelleAus(checksInhalt(t.db, {}));
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/checks/page.tsx",
      "utf8",
    );

    expect(importiertAntdTableDirekt(quelle)).toBe(false);
    expect(istRekursivJsonSicher(props)).toBe(true);
    expect(props.zeilen[0]).toEqual({
      id: "check-hydration",
      detailHref: "/verwaltung/checks/check-hydration",
      fahrzeugName: "RTW 1",
      abgeschlossenText: "7.8.2026, 12:00:00",
      ergebnisChips: [{
        schluessel: "vollstaendig",
        text: "vollständig",
        ton: "ok",
        zeichen: null,
      }],
      positionenText: "0",
    });
  });

  it("koppelt 51 Checks an exakt die neuesten 50 IDs in der Totalordnung", () => {
    checksMitGleicherSekunde(51);

    const seite = checksInhalt(t.db, {});
    const tabelle = tabelleAus(seite);
    const erwarteteIds = Array.from(
      { length: 50 },
      (_, index) => `check-${String(50 - index).padStart(3, "0")}`,
    );

    expect(tabelle.zeilen.map((zeile) => zeile.id)).toEqual(erwarteteIds);
    expect(tabelle.zeilen).toHaveLength(50);
    expect(tabelle.zeilen.some((zeile) => zeile.id === "check-000")).toBe(false);
    const [kopf] = elementeVomTyp(seite, SeitenKopf);
    expect(kopf.props.beschreibung)
      .toBe("Neueste 50 von mehr Treffern — Zeitraum eingrenzen");
    expect(elementeVomTyp(seite, Trefferanzeige)).toHaveLength(0);
    expect(istRekursivJsonSicher(tabelle)).toBe(true);
  });

  it("behauptet bei exakt 50 Checks nicht, dass weitere Treffer vorhanden sind", () => {
    checksMitGleicherSekunde(50);

    const seite = checksInhalt(t.db, {});
    const tabelle = tabelleAus(seite);

    expect(tabelle.zeilen.map((zeile) => zeile.id)).toEqual(Array.from(
      { length: 50 },
      (_, index) => `check-${String(49 - index).padStart(3, "0")}`,
    ));
    const [kopf] = elementeVomTyp(seite, SeitenKopf);
    expect(kopf.props.beschreibung).toBe("50 Treffer");
  });

  it("bereitet Link, Abschlusszeit, Ergebnis-Chips und Positionszahl serverseitig vor", () => {
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

    const zeile = tabelleAus(checksInhalt(t.db, {})).zeilen[0];
    expect(zeile.detailHref).toBe("/verwaltung/checks/check-aussage");
    expect(zeile.fahrzeugName).toBe("RTW 1");
    expect(zeile.abgeschlossenText).toBe("7.8.2026, 12:00:00");
    expect(zeile.positionenText).toBe("1");
    expect(zeile.ergebnisChips).toEqual([
      {
        schluessel: "nachgefuellt", ton: "rot", zeichen: null,
        text: "1 aus Handlager nachgefüllt",
      },
      {
        schluessel: "korrigiert", ton: "gelb", zeichen: null,
        text: "2 korrigiert",
      },
      {
        schluessel: "offen", ton: "rot", zeichen: "warnung",
        text: "1 fehlt weiterhin",
      },
      {
        schluessel: "geraete", ton: "rot", zeichen: null,
        text: "1 Gerät(e) auffällig",
      },
      {
        schluessel: "flaschen", ton: "rot", zeichen: "sauerstoff",
        text: "1 Flasche(n) niedrig",
      },
    ]);
    expect(zeile.ergebnisChips.map((eintrag) => eintrag.text))
      .not.toContain("vollständig");
    expect(istRekursivJsonSicher(zeile)).toBe(true);
  });

  it("zeigt ohne Auffälligkeit ausschließlich den vollständigen Status", () => {
    checkEintragen({ id: "check-vollstaendig" });

    expect(tabelleAus(checksInhalt(t.db, {})).zeilen[0].ergebnisChips).toEqual([{
      schluessel: "vollstaendig",
      text: "vollständig",
      ton: "ok",
      zeichen: null,
    }]);
  });

  it("zeigt einen Check ohne Abschlusszeit als Gedankenstrich statt als Datum", () => {
    checkEintragen({ id: "check-offen", completedAt: null });

    const zeile = tabelleAus(checksInhalt(t.db, {})).zeilen[0];

    expect(zeile.abgeschlossenText).toBe("—");
    expect(istRekursivJsonSicher(zeile)).toBe(true);
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
    expect(tabelle.zeilen.map((zeile) => zeile.id)).toEqual(["check-trotz-ungueltig"]);
    expect(tabelle.leertext).toBe("Noch kein abgeschlossener Fahrzeug-Check.");
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
    expect(tabelle.zeilen).toEqual([]);
    expect(tabelle.leertext).toBe("Kein Check passt zu Fahrzeug und Zeitraum.");
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

  it("verriegelt die directive-freie RSC-Seite gegen direkte antd-Table-Importe", () => {
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/checks/page.tsx",
      "utf8",
    );

    expect(importiertAntdTableDirekt(quelle)).toBe(false);
    expect(importiertAntdTableDirekt('import { Table as Tabelle } from "antd";'))
      .toBe(true);
    expect(importiertAntdTableDirekt(
      'import * as Antd from "antd"; const tabelle = <Antd.Table />;',
    )).toBe(true);
    expect(importiertAntdTableDirekt(
      'import Antd from "antd"; const tabelle = <Antd.Table />;',
    )).toBe(true);
    expect(quelle).not.toMatch(/["']use client["']/);
    expect(runtimeImporteAusChecksFilter(quelle)).toEqual(["ChecksFilter"]);
  });
});
