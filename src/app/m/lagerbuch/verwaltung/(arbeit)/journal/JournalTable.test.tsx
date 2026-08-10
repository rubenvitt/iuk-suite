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
import s from "../../../_ui/verwaltung.module.css";
import {
  JournalTable,
  type JournalAnzeigeZeile,
} from "./JournalTable";

const ZEILEN = [
  {
    id: "journal-negativ",
    zeitText: "07.08. 14:00",
    artikelName: "Verbandpäckchen",
    vorgangText: "Entnahme · Verbraucht",
    deltaText: "-1",
    deltaTon: "negativ",
    quelleName: "System",
    quelleId: "system",
  },
  {
    id: "journal-positiv",
    zeitText: "07.08. 15:00",
    artikelName: "Kompressen",
    vorgangText: "Wareneingang",
    deltaText: "+2",
    deltaTon: "positiv",
    quelleName: "Helfer",
    quelleId: "111-111",
  },
] satisfies JournalAnzeigeZeile[];

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

function ersteDirektive(quelle: string): string | null {
  const source = ts.createSourceFile(
    "JournalTable.tsx",
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

describe("JournalTable", () => {
  it("traegt use client kommentarrobust als echte erste Direktive", () => {
    expect(ersteDirektive('/* Lizenz */\n"use client";\nconst wert = 1;'))
      .toBe("use client");
    expect(ersteDirektive('const wert = 1;\n"use client";')).toBeNull();

    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/journal/JournalTable.tsx",
      "utf8",
    );
    expect(ersteDirektive(quelle)).toBe("use client");
  });

  it("rendert eine gefuellte DTO-Zeile erst innerhalb der Client-Insel", async () => {
    await mount(<JournalTable zeilen={ZEILEN} leertext="Noch keine Buchung." />);

    expect(queryAll("thead th").map((spalte) => spalte.textContent)).toEqual([
      "Zeit",
      "Artikel",
      "Vorgang",
      "Δ",
      "Quelle",
    ]);
    expect(query("table").getAttribute("aria-label")).toBe("Buchungsjournal");
    expect(queryAll("tbody tr[data-row-key]").map((zeile) =>
      zeile.getAttribute("data-row-key"))).toEqual([
      "journal-negativ",
      "journal-positiv",
    ]);

    const negativ = query("tr[data-row-key='journal-negativ']");
    expect(negativ.textContent).toContain("07.08. 14:00");
    expect(negativ.textContent).toContain("Verbandpäckchen");
    expect(negativ.textContent).toContain("Entnahme · Verbraucht");
    expect(negativ.textContent).toContain("-1");
    expect(negativ.textContent).toContain("System");
    expect(negativ.querySelector(`.${s.jts}`)).not.toBeNull();
    expect(negativ.querySelector(`.${s.jdelta}.${s.jminus}`)).not.toBeNull();
    expect(
      (negativ.querySelectorAll("td")[1].querySelector("span") as HTMLElement).style.fontWeight,
    ).toBe("600");
    expect(negativ.querySelector(`.${s.chip}.${s.grau}`)).not.toBeNull();
    // Ruling A15: der rohe Code/die rohe Kennung steht im `title` des
    // Quelle-Chips, 1:1 aus der Alt-Anwendung
    // (`lagerbuch/src/app/verwaltung/(admin)/journal/page.tsx:62`).
    expect(negativ.querySelector(`.${s.chip}`)?.getAttribute("title")).toBe("system");

    const positiv = query("tr[data-row-key='journal-positiv']");
    expect(positiv.querySelector(`.${s.jdelta}.${s.jplus}`)).not.toBeNull();
    expect(exists(".ant-pagination")).toBe(false);
    expect(query(".ant-table-content").getAttribute("style")).toContain("overflow-x: auto");
  });

  it("zeigt den vom Server gewaehlten Leertext", async () => {
    await mount(<JournalTable zeilen={[]} leertext="Noch keine Buchung." />);
    expect(document.body.textContent).toContain("Noch keine Buchung.");

    await unmount();
    await mount(
      <JournalTable
        zeilen={[]}
        leertext="Keine Buchung passt zu Suche, Vorgang und Zeitraum."
      />,
    );
    expect(document.body.textContent).toContain(
      "Keine Buchung passt zu Suche, Vorgang und Zeitraum.",
    );
  });
});
