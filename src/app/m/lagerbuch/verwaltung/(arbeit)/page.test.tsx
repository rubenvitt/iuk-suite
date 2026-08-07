import { Empty } from "antd";
import Link from "next/link";
import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { artikel, buchungen, chargen } from "../../_db/schema";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { HANDLAGER_ID } from "../../_lib/konstanten";
import { Kachel } from "../../_ui/Kachel";
import {
  LetzteBuchungenTable,
  type UebersichtJournalZeile,
} from "./LetzteBuchungenTable";
import { kritischeArtikel, verwaltungInhalt } from "./page";

let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-seite-uebersicht-");
});

afterEach(() => {
  t.schliessen();
});

function artikelMit({
  id,
  name,
  bestand,
  mindestbestand,
  verfall,
}: {
  id: string;
  name: string;
  bestand: number;
  mindestbestand: number;
  verfall?: string;
}) {
  t.db.insert(artikel).values({
    id,
    name,
    einheit: "Stk",
    fach: "A1",
    mindestbestand,
    aktiv: true,
    createdAt: new Date("2026-08-07T10:00:00Z"),
  }).run();
  if (!verfall) return;

  const chargeId = `charge-${id}`;
  t.db.insert(chargen).values({
    id: chargeId,
    artikelId: id,
    chargenNr: `LOT-${id}`,
    verfall,
    createdAt: new Date("2020-01-01T10:00:00Z"),
  }).run();
  if (bestand === 0) return;

  t.db.insert(buchungen).values({
    id: `buchung-${id}`,
    ts: new Date("2026-08-07T11:00:00Z"),
    typ: "zugang",
    artikelId: id,
    chargeId,
    lagerortId: HANDLAGER_ID,
    menge: bestand,
    quelleTyp: "system",
    quelleId: "test",
    referenz: null,
    kommentar: null,
  }).run();
}

function journalBuchung({
  id,
  artikelId,
  ts,
  menge,
  kommentar = null,
}: {
  id: string;
  artikelId: string;
  ts: string;
  menge: number;
  kommentar?: string | null;
}) {
  t.db.insert(buchungen).values({
    id,
    ts: new Date(ts),
    typ: "korrektur",
    artikelId,
    chargeId: `charge-${artikelId}`,
    lagerortId: HANDLAGER_ID,
    menge,
    quelleTyp: "system",
    quelleId: "test",
    referenz: null,
    kommentar,
  }).run();
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

function elementeVomTyp(wert: ReactNode, typ: unknown): ReactElement[] {
  if (Array.isArray(wert)) return wert.flatMap((kind) => elementeVomTyp(kind, typ));
  if (!isValidElement(wert)) return [];
  const treffer = wert.type === typ ? [wert] : [];
  const kinder = (wert.props as { children?: ReactNode }).children;
  return [...treffer, ...elementeVomTyp(kinder, typ)];
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

describe("kritischeArtikel", () => {
  it("nimmt einen Artikel unter Mindestbestand auf", () => {
    artikelMit({
      id: "artikel-unter-mindest",
      name: "Kompressen",
      bestand: 0,
      mindestbestand: 10,
    });

    expect(
      kritischeArtikel(t.db, new Date("2026-08-07T12:00:00Z")).map((zeile) => zeile.id),
    ).toEqual(["artikel-unter-mindest"]);
  });

  it("nimmt einen Artikel mit auffälliger Charge trotz ausreichendem Bestand auf", () => {
    artikelMit({
      id: "artikel-abgelaufen",
      name: "Infusionsbesteck",
      bestand: 50,
      mindestbestand: 1,
      verfall: "2020-01",
    });

    expect(
      kritischeArtikel(t.db, new Date("2026-08-07T12:00:00Z")).map((zeile) => zeile.id),
    ).toEqual(["artikel-abgelaufen"]);
  });

  it("liefert ausschließlich fertige Anzeigeinformationen ohne Date", () => {
    artikelMit({
      id: "artikel-anzeige",
      name: "Infusionsbesteck",
      bestand: 50,
      mindestbestand: 1,
      verfall: "2020-01",
    });

    const zeilen = kritischeArtikel(t.db, new Date("2026-08-07T12:00:00Z"));

    expect(zeilen).toEqual([
      {
        id: "artikel-anzeige",
        name: "Infusionsbesteck",
        fach: "A1",
        bestand: 50,
        mindestbestand: 1,
        unterMindest: false,
        chargeText: "abgelaufen",
        chargeTon: "rot",
      },
    ]);
    expect(istJsonSicher(zeilen)).toBe(true);
  });

  it("lässt einen Artikel mit ausreichendem Bestand und unauffälliger Charge weg", () => {
    artikelMit({
      id: "artikel-unauffaellig",
      name: "Dreiecktuch",
      bestand: 50,
      mindestbestand: 1,
      verfall: "2099-12",
    });

    expect(kritischeArtikel(t.db, new Date("2026-08-07T12:00:00Z"))).toEqual([]);
  });
});

describe("Verwaltungsübersicht", () => {
  it("zeigt im leeren Zustand fünf Kacheln, zwei Chargenlinks und eine leere Journalinsel", () => {
    const seite = verwaltungInhalt(t.db, new Date("2026-08-07T12:00:00Z"));
    const kacheln = elementeVomTyp(seite, Kachel);

    expect(kacheln).toHaveLength(5);
    expect(kacheln.map((element) =>
      (element.props as { href?: string }).href ?? null)).toEqual([
      null,
      "/verwaltung/verfall",
      "/verwaltung/verfall",
      null,
      null,
    ]);
    expect(elementeVomTyp(seite, Empty).map((element) =>
      (element.props as { description?: ReactNode }).description)).toEqual([
      "Alles im grünen Bereich.",
    ]);
    const [journal] = elementeVomTyp(seite, LetzteBuchungenTable);
    expect(journal.props).toEqual({ zeilen: [] });
  });

  it("ordnet alle fünf Kennzahlen korrekt zu und zeigt die kritischen Artikel als Links", () => {
    artikelMit({
      id: "artikel-unter-mindest",
      name: "Kompressen",
      bestand: 0,
      mindestbestand: 10,
    });
    artikelMit({
      id: "artikel-abgelaufen",
      name: "Infusionsbesteck",
      bestand: 50,
      mindestbestand: 1,
      verfall: "2020-01",
    });
    artikelMit({
      id: "artikel-kritisch",
      name: "Beatmungsmaske",
      bestand: 50,
      mindestbestand: 1,
      verfall: "2026-08",
    });

    const seite = verwaltungInhalt(t.db, new Date("2026-08-07T12:00:00Z"));
    const kachelProps = elementeVomTyp(seite, Kachel).map((element) =>
      element.props as {
        zahl: number;
        beschriftung: string;
        ton?: string;
        href?: string;
      });

    expect(kachelProps).toEqual([
      {
        zahl: 1,
        beschriftung: "Artikel unter Mindestbestand",
        ton: "rot",
      },
      {
        zahl: 1,
        beschriftung: "Chargen bald fällig / kritisch",
        ton: "gelb",
        href: "/verwaltung/verfall",
      },
      {
        zahl: 1,
        beschriftung: "abgelaufen — aussondern nötig",
        ton: "rot",
        href: "/verwaltung/verfall",
      },
      {
        zahl: 1,
        beschriftung: "unter Mindestbestand, noch nicht bestellt",
      },
      {
        zahl: 2,
        beschriftung: "Buchungen im Journal",
      },
    ]);

    const artikelLinks = elementeVomTyp(seite, Link).map((element) =>
      element.props as { href: string; children: ReactNode });
    expect(artikelLinks.map((props) => props.href)).toEqual([
      "/verwaltung/artikel",
      "/verwaltung/artikel",
      "/verwaltung/artikel",
    ]);
    expect(artikelLinks.map((props) => String(props.children)).toSorted()).toEqual([
      "Beatmungsmaske",
      "Infusionsbesteck",
      "Kompressen",
    ]);
  });

  it("zeigt die neuesten fünf Buchungen in totaler Ordnung als primitive Client-DTOs", () => {
    artikelMit({
      id: "artikel-journal",
      name: "Verbandpäckchen",
      bestand: 10,
      mindestbestand: 1,
      verfall: "2099-12",
    });
    journalBuchung({
      id: "journal-neu",
      artikelId: "artikel-journal",
      ts: "2026-08-07T15:00:00Z",
      menge: 3,
      kommentar: "Nachgezählt",
    });
    journalBuchung({
      id: "journal-gleich-b",
      artikelId: "artikel-journal",
      ts: "2026-08-07T14:00:00Z",
      menge: -1,
    });
    journalBuchung({
      id: "journal-gleich-a",
      artikelId: "artikel-journal",
      ts: "2026-08-07T14:00:00Z",
      menge: 0,
    });
    journalBuchung({
      id: "journal-mittel",
      artikelId: "artikel-journal",
      ts: "2026-08-07T13:00:00Z",
      menge: 2,
    });
    journalBuchung({
      id: "journal-alt",
      artikelId: "artikel-journal",
      ts: "2026-08-07T12:00:00Z",
      menge: -2,
    });

    const seite = verwaltungInhalt(t.db, new Date("2026-08-07T16:00:00Z"));
    const [tabelle] = elementeVomTyp(seite, LetzteBuchungenTable);
    expect(tabelle).toBeDefined();
    const props = tabelle.props as { zeilen: UebersichtJournalZeile[] };

    expect(props.zeilen.map((zeile) => zeile.id)).toEqual([
      "journal-neu",
      "journal-gleich-b",
      "journal-gleich-a",
      "journal-mittel",
      "journal-alt",
    ]);
    expect(props.zeilen[0]).toEqual({
      id: "journal-neu",
      zeitText: "07.08. 17:00",
      artikelName: "Verbandpäckchen",
      vorgangText: "Korrektur · Nachgezählt",
      deltaText: "+3",
      deltaTon: "positiv",
    });
    expect(props.zeilen[2].deltaText).toBe("0");
    expect(props.zeilen[2].deltaTon).toBe("neutral");
    expect(istJsonSicher(props)).toBe(true);
  });

  it("erkennt benannte, Alias-, Namespace- und Default-Importe als Negativproben", () => {
    expect(importiertUnsichereAntdTableForm('import { Table } from "antd";')).toBe(true);
    expect(importiertUnsichereAntdTableForm(
      'import { Table as UebersichtsTabelle } from "antd";',
    )).toBe(true);
    expect(importiertUnsichereAntdTableForm('import * as antd from "antd";')).toBe(true);
    expect(importiertUnsichereAntdTableForm('import antd from "antd";')).toBe(true);
    expect(importiertUnsichereAntdTableForm(
      'import { Card as Karte, Empty } from "antd";',
    )).toBe(false);
  });

  it("importiert in der directive-freien RSC-Seite keine antd-Table", () => {
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/page.tsx",
      "utf8",
    );
    expect(importiertUnsichereAntdTableForm(quelle)).toBe(false);
    expect(quelle).not.toMatch(/["']use client["']/);
    expect(quelle).toContain('from "./LetzteBuchungenTable"');
  });
});
