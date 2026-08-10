// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import {
  exists,
  mount,
  query,
  queryAll,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import s from "../../_ui/verwaltung.module.css";
import {
  LetzteBuchungenTable,
  type UebersichtJournalZeile,
} from "./LetzteBuchungenTable";

const ZEILEN = [
  {
    id: "journal-positiv",
    zeitText: "07.08. 17:00",
    artikelName: "Verbandpäckchen",
    vorgangText: "Korrektur · Nachgezählt",
    deltaText: "+3",
    deltaTon: "positiv",
  },
  {
    id: "journal-neutral",
    zeitText: "07.08. 16:00",
    artikelName: "Kompressen",
    vorgangText: "Korrektur",
    deltaText: "0",
    deltaTon: "neutral",
  },
  {
    id: "journal-negativ",
    zeitText: "07.08. 15:00",
    artikelName: "Infusionsbesteck",
    vorgangText: "Entnahme",
    deltaText: "-2",
    deltaTon: "negativ",
  },
] satisfies UebersichtJournalZeile[];

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

function ersteDirektive(quelle: string): string | null {
  const source = ts.createSourceFile(
    "LetzteBuchungenTable.tsx",
    quelle,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const [ersteAnweisung] = source.statements;
  return ersteAnweisung
    && ts.isExpressionStatement(ersteAnweisung)
    && ts.isStringLiteral(ersteAnweisung.expression)
    ? ersteAnweisung.expression.text
    : null;
}

beforeAll(() => {
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) =>
    getComputedStyleOhnePseudo(element),
  );
});

afterEach(async () => {
  await unmount();
});

afterAll(() => vi.restoreAllMocks());

describe("LetzteBuchungenTable", () => {
  it("traegt use client kommentarrobust als echte erste Direktive", () => {
    expect(ersteDirektive('// Hinweis\n"use client";\nconst wert = 1;'))
      .toBe("use client");
    expect(ersteDirektive('const wert = 1;\n"use client";')).toBeNull();

    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/LetzteBuchungenTable.tsx",
      "utf8",
    );
    expect(ersteDirektive(quelle)).toBe("use client");
  });

  it("rendert gefuellte primitive DTOs mit stabilen Tabellenattributen", async () => {
    await mount(<LetzteBuchungenTable zeilen={ZEILEN} />);

    expect(queryAll("thead th").map((spalte) => spalte.textContent)).toEqual([
      "Zeit",
      "Artikel",
      "Vorgang",
      "Δ",
    ]);
    expect(query("table").getAttribute("aria-label")).toBe("Letzte Buchungen");
    expect(queryAll("tbody tr[data-row-key]").map((zeile) =>
      zeile.getAttribute("data-row-key"))).toEqual([
      "journal-positiv",
      "journal-neutral",
      "journal-negativ",
    ]);

    const positiv = query("tr[data-row-key='journal-positiv']");
    expect(positiv.textContent).toContain("07.08. 17:00");
    expect(positiv.textContent).toContain("Verbandpäckchen");
    expect(positiv.textContent).toContain("Korrektur · Nachgezählt");
    expect(positiv.textContent).toContain("+3");
    expect(positiv.querySelector(`.${s.jts}`)).not.toBeNull();
    expect(positiv.querySelector(`.${s.jdelta}.${s.jplus}`)).not.toBeNull();

    const neutral = query("tr[data-row-key='journal-neutral']");
    const neutralDelta = neutral.querySelector(`.${s.jdelta}`);
    expect(neutralDelta).not.toBeNull();
    expect(neutralDelta?.classList.contains(s.jplus)).toBe(false);
    expect(neutralDelta?.classList.contains(s.jminus)).toBe(false);

    const negativ = query("tr[data-row-key='journal-negativ']");
    expect(negativ.textContent).toContain("-2");
    expect(negativ.querySelector(`.${s.jdelta}.${s.jminus}`)).not.toBeNull();
    expect(exists(".ant-pagination")).toBe(false);
    expect(query(".ant-table-content").getAttribute("style")).toContain("overflow-x: auto");
  });

  it("behaelt den bisherigen Leerzustand ohne leere Tabelle", async () => {
    await mount(<LetzteBuchungenTable zeilen={[]} />);
    expect(document.body.textContent).toContain("Noch keine Buchungen.");
    expect(exists("table")).toBe(false);
  });
});
