import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { artikel, buchungen, chargen } from "../../../_db/schema";
import { migrierteTestDb, type TestDb } from "../../../_db/testdb";
import { HANDLAGER_ID } from "../../../_lib/konstanten";
import { JOURNAL_GRENZE } from "../../../_lib/grenzen";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { JournalFilter } from "./JournalFilter";
import {
  JournalTable,
  type JournalAnzeigeZeile,
} from "./JournalTable";
import JournalSeite, {
  dynamic,
  journalDaten,
  journalInhalt,
} from "./page";

let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-journal-seite-");
  t.db.insert(artikel).values({
    id: "artikel-1",
    name: "Verbandpäckchen",
    einheit: "Stk.",
    fach: "A1",
    mindestbestand: 0,
    aktiv: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  }).run();
  t.db.insert(chargen).values({
    id: "charge-1",
    artikelId: "artikel-1",
    chargenNr: "LOT-1",
    verfall: "2030-01",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  }).run();
});

afterEach(() => {
  t.schliessen();
});

function buche({
  id,
  ts = "2026-08-07T12:00:00Z",
  typ = "zugang",
  menge = 1,
  kommentar = null,
}: {
  id: string;
  ts?: string;
  typ?: "zugang" | "entnahme" | "korrektur" | "umlagerung";
  menge?: number;
  kommentar?: string | null;
}) {
  t.db.insert(buchungen).values({
    id,
    ts: new Date(ts),
    typ,
    artikelId: "artikel-1",
    chargeId: "charge-1",
    lagerortId: HANDLAGER_ID,
    menge,
    quelleTyp: "system",
    quelleId: "system",
    referenz: null,
    kommentar,
  }).run();
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

function istJsonSicher(wert: unknown): boolean {
  if (wert === null) return true;
  if (["string", "number", "boolean"].includes(typeof wert)) return true;
  if (Array.isArray(wert)) return wert.every(istJsonSicher);
  if (typeof wert !== "object" || Object.getPrototypeOf(wert) !== Object.prototype) {
    return false;
  }
  return Object.values(wert).every(istJsonSicher);
}

function importiertUnsichereAntdTableForm(quelle: string): boolean {
  const source = ts.createSourceFile(
    "page.tsx",
    quelle,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  return source.statements.some((statement) => {
    if (
      !ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== "antd"
    ) return false;
    const importClause = statement.importClause;
    if (!importClause) return false;
    if (importClause.name) return true;
    if (importClause.namedBindings && ts.isNamespaceImport(importClause.namedBindings)) {
      return true;
    }
    const bindungen = importClause.namedBindings;
    return bindungen && ts.isNamedImports(bindungen)
      ? bindungen.elements.some(
        (element) => (element.propertyName?.text ?? element.name.text) === "Table",
      )
      : false;
  });
}

describe("Journalseite — Regime B und Deckel", () => {
  it("ist dynamisch und liest bei 100/101 exakt die neuesten IDs in totaler Ordnung", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(JournalSeite).toBeTypeOf("function");

    for (let index = 0; index < JOURNAL_GRENZE; index += 1) {
      buche({ id: `id-${String(index).padStart(3, "0")}` });
    }
    const genauHundert = journalDaten(t.db, {});
    expect(genauHundert.zeilen).toHaveLength(100);
    expect(genauHundert.mehrVorhanden).toBe(false);
    expect(genauHundert.zeilen.map((zeile) => zeile.id)).toEqual(
      Array.from(
        { length: 100 },
        (_, index) => `id-${String(99 - index).padStart(3, "0")}`,
      ),
    );

    buche({ id: "id-100" });
    const hundertVonHundertundeins = journalDaten(t.db, {});
    expect(hundertVonHundertundeins.zeilen).toHaveLength(100);
    expect(hundertVonHundertundeins.mehrVorhanden).toBe(true);
    expect(hundertVonHundertundeins.zeilen.map((zeile) => zeile.id)).toEqual(
      Array.from(
        { length: 100 },
        (_, index) => `id-${String(100 - index).padStart(3, "0")}`,
      ),
    );
    expect(hundertVonHundertundeins.zeilen.map((zeile) => zeile.id))
      .not.toContain("id-000");

    const [kopf] = elementeVomTyp(
      journalInhalt(hundertVonHundertundeins),
      SeitenKopf,
    );
    expect(kopf.props.beschreibung).toBe(
      "Append-only Buchungsjournal — der Bestand ist immer die Summe der Buchungen. "
      + "Neueste 100 von mehr Treffern — Zeitraum eingrenzen.",
    );
  });

  it("normalisiert Typ und Datum vor SQL und reicht nur skalare Werte zur Insel", () => {
    buche({ id: "zugang", typ: "zugang" });
    buche({ id: "entnahme", typ: "entnahme", menge: -1 });

    const ungueltig = journalDaten(t.db, {
      typ: "inventur",
      von: "2026-02-31",
      bis: "gestern",
    });
    expect(ungueltig.zeilen.map((zeile) => zeile.id)).toEqual([
      "zugang",
      "entnahme",
    ]);
    expect(ungueltig.werte).toEqual({ q: "", typ: "", von: "", bis: "" });
    expect(ungueltig.filter).toEqual({
      q: undefined,
      typ: undefined,
      von: undefined,
      bis: undefined,
    });
    expect(ungueltig.hinweise).toHaveLength(2);

    const [insel] = elementeVomTyp(journalInhalt(ungueltig), JournalFilter);
    expect(insel.props).toEqual({
      q: "",
      typ: "",
      von: "",
      bis: "",
      hinweise: ungueltig.hinweise,
    });
    expect(istJsonSicher(insel.props)).toBe(true);

    const gefiltert = journalDaten(t.db, {
      q: "  päckchen ",
      typ: "entnahme",
      von: " 2026-08-07 ",
      bis: "2026-08-07",
    });
    expect(gefiltert.zeilen.map((zeile) => zeile.id)).toEqual(["entnahme"]);
    expect(gefiltert.werte).toEqual({
      q: "päckchen",
      typ: "entnahme",
      von: "2026-08-07",
      bis: "2026-08-07",
    });
  });

  it("behaelt umgekehrte gueltige Grenzen sichtbar und liefert ehrlich keine Zeile", () => {
    buche({ id: "buchung" });
    const daten = journalDaten(t.db, {
      von: "2026-08-08",
      bis: "2026-08-07",
    });

    expect(daten.zeilen).toEqual([]);
    expect(daten.werte).toMatchObject({
      von: "2026-08-08",
      bis: "2026-08-07",
    });
    expect(daten.filter.von?.getTime()).toBeGreaterThan(
      daten.filter.bis?.getTime() ?? Number.POSITIVE_INFINITY,
    );
    expect(daten.hinweise).toEqual([
      "Der Zeitraum ist leer: „von“ liegt nach „bis“.",
    ]);
  });
});

describe("Journalseite — JSON-sichere Client-Grenze", () => {
  it("formatiert alle Anzeigeinformationen als rekursiv primitive DTOs", () => {
    buche({
      id: "id-negativ",
      typ: "entnahme",
      menge: -1,
      kommentar: "Verbraucht",
    });
    buche({ id: "id-positiv", typ: "zugang", menge: 2 });

    const seite = journalInhalt(journalDaten(t.db, {}));
    const [tabelle] = elementeVomTyp(seite, JournalTable);
    const props = tabelle.props as {
      zeilen: JournalAnzeigeZeile[];
      leertext: string;
    };

    expect(props.zeilen).toEqual([
      {
        id: "id-positiv",
        zeitText: "07.08. 14:00",
        artikelName: "Verbandpäckchen",
        vorgangText: "Wareneingang",
        deltaText: "+2",
        deltaTon: "positiv",
        quelleName: "System",
        quelleId: "system",
      },
      {
        id: "id-negativ",
        zeitText: "07.08. 14:00",
        artikelName: "Verbandpäckchen",
        vorgangText: "Entnahme · Verbraucht",
        deltaText: "-1",
        deltaTon: "negativ",
        quelleName: "System",
        quelleId: "system",
      },
    ]);
    expect(istJsonSicher(props)).toBe(true);
  });

  it("unterscheidet den Leertext mit Filter und nennt ohne Deckel die echte Zahl", () => {
    const ohneFilter = journalDaten(t.db, {});
    const [leereTabelle] = elementeVomTyp(journalInhalt(ohneFilter), JournalTable);
    expect((leereTabelle.props as { leertext: string }).leertext)
      .toBe("Noch keine Buchung.");
    const [leererKopf] = elementeVomTyp(journalInhalt(ohneFilter), SeitenKopf);
    expect(leererKopf.props.beschreibung).toContain("0 Treffer.");

    const mitFilter = journalDaten(t.db, { q: "ohne-treffer" });
    const [gefilterteTabelle] = elementeVomTyp(journalInhalt(mitFilter), JournalTable);
    expect((gefilterteTabelle.props as { leertext: string }).leertext)
      .toBe("Keine Buchung passt zu Suche, Vorgang und Zeitraum.");
  });

  it("erkennt benannte, Alias-, Namespace- und Default-Importe als Negativproben", () => {
    expect(importiertUnsichereAntdTableForm('import { Table } from "antd";')).toBe(true);
    expect(importiertUnsichereAntdTableForm(
      'import { Table as JournalTabelle } from "antd";',
    )).toBe(true);
    expect(importiertUnsichereAntdTableForm('import * as antd from "antd";')).toBe(true);
    expect(importiertUnsichereAntdTableForm('import antd from "antd";')).toBe(true);
    expect(importiertUnsichereAntdTableForm(
      'import { Card as Karte, Empty } from "antd";',
    )).toBe(false);
  });

  it("importiert in der directive-freien RSC-Seite keine antd-Table", () => {
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/journal/page.tsx",
      "utf8",
    );
    expect(importiertUnsichereAntdTableForm(quelle)).toBe(false);
    expect(quelle).not.toMatch(/["']use client["']/);
    expect(quelle).not.toContain(String.fromCodePoint(0x2212));
    expect(quelle).not.toContain("Trefferanzeige");

    const source = ts.createSourceFile(
      "page.tsx",
      quelle,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const clientImporte = source.statements.filter((statement) => (
      ts.isImportDeclaration(statement)
      && ts.isStringLiteral(statement.moduleSpecifier)
      && ["./JournalFilter", "./JournalTable"].includes(statement.moduleSpecifier.text)
    ));
    expect(clientImporte).toHaveLength(2);
    expect(quelle).toContain('from "./journalFilterLogik"');
  });
});
