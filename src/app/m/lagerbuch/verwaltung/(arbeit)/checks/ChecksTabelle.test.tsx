// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickElement,
  exists,
  mount,
  query,
  queryAll,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import s from "../../../_ui/verwaltung.module.css";
import { ChecksTabelle, type CheckAnzeigeZeile } from "./ChecksTabelle";

const ZEILE: CheckAnzeigeZeile = {
  id: "check-42",
  detailHref: "/verwaltung/checks/check-42",
  fahrzeugName: "RTW 1",
  abgeschlossenText: "7.8.2026, 12:00:00",
  abgeschlossenIso: "2026-08-07T10:00:00.000Z",
  ergebnisChips: [
    {
      schluessel: "nachgefuellt",
      text: "1 aus Handlager nachgefüllt",
      ton: "rot",
      zeichen: null,
    },
    {
      schluessel: "korrigiert",
      text: "2 korrigiert",
      ton: "gelb",
      zeichen: null,
    },
    {
      schluessel: "offen",
      text: "1 fehlt weiterhin",
      ton: "rot",
      zeichen: "warnung",
    },
    {
      schluessel: "flaschen",
      text: "1 Flasche niedrig",
      ton: "rot",
      zeichen: "sauerstoff",
    },
  ],
  positionenText: "9",
};

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

function hatUseClientAlsErsteDirektive(quelle: string): boolean {
  const source = ts.createSourceFile(
    "client.tsx",
    quelle,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const [ersteAnweisung] = source.statements;
  return Boolean(
    ersteAnweisung
    && ts.isExpressionStatement(ersteAnweisung)
    && ts.isStringLiteral(ersteAnweisung.expression)
    && ersteAnweisung.expression.text === "use client",
  );
}

beforeEach(() => {
  vi.spyOn(window, "getComputedStyle")
    .mockImplementation((element) => getComputedStyleOhnePseudo(element));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await unmount();
});

describe("ChecksTabelle", () => {
  it("rendert eine gefüllte Anzeigezeile mit unverändertem Tabellenvertrag", async () => {
    await mount(<ChecksTabelle zeilen={[ZEILE]} leertext="Noch kein Check." />);

    expect(queryAll("thead th").map((spalte) => spalte.textContent))
      .toEqual(["Fahrzeug", "Abgeschlossen", "Ergebnis", "Positionen"]);
    const tabelle = query("table");
    expect(tabelle.getAttribute("aria-label")).toBe("Fahrzeug-Checks");
    const zeile = query("tr[data-row-key='check-42']");
    expect(zeile.textContent).toContain("RTW 1");
    expect(query<HTMLAnchorElement>("a[href='/verwaltung/checks/check-42']").textContent)
      .toBe("RTW 1");
    expect(query(`.${s.jts}`).textContent).toBe("7.8.2026, 12:00:00");
    expect(zeile.textContent).toContain("1 aus Handlager nachgefüllt");
    expect(zeile.textContent).toContain("2 korrigiert");
    expect(zeile.textContent).toContain("1 fehlt weiterhin");
    expect(zeile.textContent).toContain("1 Flasche niedrig");
    expect(zeile.textContent).toContain("9");
    expect(Array.from(
      zeile.querySelectorAll("[data-zeichen]"),
      (zeichen) => zeichen.getAttribute("data-zeichen"),
    )).toEqual(["warnung", "sauerstoff"]);
    expect(queryAll(`.${s.rot}`)).toHaveLength(3);
    expect(queryAll(`.${s.gelb}`)).toHaveLength(1);
    expect(exists(".ant-pagination")).toBe(false);

    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/checks/ChecksTabelle.tsx",
      "utf8",
    );
    expect(hatUseClientAlsErsteDirektive(quelle)).toBe(true);
    expect(hatUseClientAlsErsteDirektive('"use strict";\n"use client";'))
      .toBe(false);
    expect(quelle).toMatch(/rowKey=["']id["']/);
    // `pagination={false}` und `scroll={{ x: "max-content" }}` standen bis zur
    // Umstellung auf `@/core/tabelle` hier im Quelltext. Beides ist jetzt
    // Vorgabe der `Datentabelle`; geprueft wird die WIRKUNG am DOM — die
    // Pagination oben, die Tabellenbreite hier.
    expect(query<HTMLTableElement>("table").style.width).toBe("max-content");
  });

  /**
   * ⚠️ DER BEWEIS, DASS NICHT UEBER DEN ANZEIGETEXT SORTIERT WIRD.
   * „1.10.2026" steht als Zeichenkette VOR „7.8.2026"; nur ueber
   * `abgeschlossenIso` ordnet der Oktober hinter den August. Die Vorgabe ist
   * absteigend (so liefert es die Abfrage), ein Klick dreht auf aufsteigend.
   */
  it("sortiert den Abschluss über den ISO-Stempel, nicht über den Text", async () => {
    const august: CheckAnzeigeZeile = {
      ...ZEILE,
      id: "check-august",
      abgeschlossenText: "7.8.2026, 12:00:00",
      abgeschlossenIso: "2026-08-07T10:00:00.000Z",
    };
    const oktober: CheckAnzeigeZeile = {
      ...ZEILE,
      id: "check-oktober",
      abgeschlossenText: "1.10.2026, 12:00:00",
      abgeschlossenIso: "2026-10-01T10:00:00.000Z",
    };

    await mount(<ChecksTabelle zeilen={[august, oktober]} leertext="leer" />);

    const schluessel = () => queryAll("tbody tr[data-row-key]")
      .map((tr) => tr.getAttribute("data-row-key"));
    expect(schluessel()).toEqual(["check-oktober", "check-august"]);

    const kopf = queryAll<HTMLElement>("thead th")
      .find((th) => (th.textContent ?? "").includes("Abgeschlossen"));
    await clickElement(kopf!.querySelector<HTMLElement>(".ant-table-column-sorters")!);
    expect(schluessel()).toEqual(["check-august", "check-oktober"]);
  });

  it("zeigt den serverseitig festgelegten Leertext unverändert", async () => {
    await mount(
      <ChecksTabelle
        zeilen={[]}
        leertext="Kein Check passt zu Fahrzeug und Zeitraum."
      />,
    );

    expect(document.body.textContent)
      .toContain("Kein Check passt zu Fahrzeug und Zeitraum.");
  });
});
