// @vitest-environment jsdom

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
import s from "../../../../_ui/verwaltung.module.css";
import { PFADE } from "../../../../_ui/ikonen";
import {
  CheckDetailTabellen,
  type CheckDetailTabellenProps,
} from "./CheckDetailTabellen";

const GEFUELLT: CheckDetailTabellenProps = {
  abgleichZeilen: [{
    id: "artikel-1",
    artikel: "Verbandpäckchen",
    sollText: "11",
    istText: "22",
    korrekturText: "33",
    nachgefuelltText: "44",
    offenChip: { text: "fehlt 5", ton: "rot", zeichen: "warnung" },
  }],
  nachfuellZeilen: [{
    id: "position-1",
    fachText: "Fach 7",
    artikelText: "Verbandpäckchen",
    einheitText: "Stk.",
    sollText: "55",
    istText: "66",
    lueckeChip: { text: "3 fehlten", ton: "rot", zeichen: "warnung" },
  }],
  geraeteZeilen: [{
    id: "geraet-1",
    name: "Defibrillator",
    vorhandenChip: { text: "vorhanden", ton: "ok", zeichen: null },
    zustandChip: { text: "Gebrauchsspuren", ton: "gelb", zeichen: null },
    bemerkungText: "Elektroden prüfen",
  }],
  flaschenZeilen: [{
    id: "flasche-1",
    name: "O2 klein",
    druck: { darstellung: "mono", text: "150 bar", ton: null },
    fuellstandChip: { text: "50 %", ton: "ok", zeichen: null },
  }, {
    id: "flasche-ohne-druck",
    name: "O2 ungemessen",
    druck: { darstellung: "chip", text: "nicht gemessen", ton: "grau" },
    fuellstandChip: { text: "nicht gemessen", ton: "grau", zeichen: null },
  }],
  verfallZeilen: [{
    id: "verfall-1",
    artikel: "Kompressen",
    verfallText: "2026-08",
    statusChip: { text: "läuft bald ab", ton: "gelb", zeichen: null },
  }],
  nachfuellLeertext: "Keine Einzelposition erfasst.",
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

function zellenTexte(id: string): string[] {
  return Array.from(
    query(`tr[data-row-key='${id}']`).querySelectorAll("td"),
    (zelle) => zelle.textContent ?? "",
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

describe("CheckDetailTabellen", () => {
  it("rendert jede der fünf Tabellen mit einer gefüllten DTO-Zeile", async () => {
    await mount(<CheckDetailTabellen {...GEFUELLT} />);

    expect(queryAll(".ant-card-head-title").map((titel) => titel.textContent)).toEqual([
      "Abgleich",
      "Nachfüllung (je Fach)",
      "Geräte",
      "Sauerstoff",
      "Verfall (gegen heute gerechnet)",
    ]);
    const tabellen = queryAll<HTMLTableElement>("table");
    expect(tabellen.map((tabelle) => tabelle.getAttribute("aria-label"))).toEqual([
      "Abgleich",
      "Nachfüllung je Fach",
      "Geräte im Check",
      "Sauerstoff im Check",
      "Verfallsmeldungen des Checks",
    ]);
    expect(tabellen.map((tabelle) =>
      Array.from(tabelle.querySelectorAll("thead th"), (spalte) => spalte.textContent)))
      .toEqual([
        ["Artikel", "Soll", "Gezählt", "Korrigiert", "Nachgefüllt", "Offen"],
        ["Fach", "Artikel", "Soll", "Gezählt", "Lücke im Fach"],
        ["Gerät", "Vorhanden", "Zustand", "Bemerkung"],
        ["Flasche", "Druck", "Füllstand"],
        ["Artikel", "Verfall", "Status"],
      ]);

    expect(zellenTexte("artikel-1")).toEqual([
      "Verbandpäckchen", "11", "22", "33", "44", "fehlt 5",
    ]);
    expect(zellenTexte("position-1")).toEqual([
      "Fach 7", "Verbandpäckchen Stk.", "55", "66", "3 fehlten",
    ]);
    expect(zellenTexte("geraet-1")).toEqual([
      "Defibrillator", "vorhanden", "Gebrauchsspuren", "Elektroden prüfen",
    ]);
    expect(zellenTexte("flasche-1")).toEqual(["O2 klein", "150 bar", "50 %"]);
    expect(zellenTexte("flasche-ohne-druck"))
      .toEqual(["O2 ungemessen", "nicht gemessen", "nicht gemessen"]);
    expect(zellenTexte("verfall-1"))
      .toEqual(["Kompressen", "2026-08", "läuft bald ab"]);
    const druckGemessen = query("tr[data-row-key='flasche-1'] td:nth-child(2)");
    expect(druckGemessen.querySelector(`.${s.chip}`)).toBeNull();
    // Mono-Indirektion (Task 5): SCHRIFT.mono bezieht die Familie seit dem
    // Adapter ueber `core/theme/schrift.ts` — `--font-mono`, die ROLLE, statt
    // der Familie. `--font-geist-mono` steht seit 2026-08-12 nur noch in der
    // `next/font`-Registrierung (`app/layout.tsx`) und in der Aufloesung in
    // `app/globals.css`; kein Konsument nennt sie mehr direkt.
    expect(druckGemessen.querySelector<HTMLElement>("span")?.style.fontFamily)
      .toBe("var(--font-mono)");
    const druckUngemessen = query(
      "tr[data-row-key='flasche-ohne-druck'] td:nth-child(2)",
    );
    expect(druckUngemessen.querySelector(`.${s.grau}`)).not.toBeNull();
    expect(Array.from(
      document.querySelectorAll("tbody svg path"),
      (pfad) => pfad.getAttribute("d"),
    )).toEqual([PFADE.warnung, PFADE.warnung]);
    expect(queryAll(`.${s.rot}`).length).toBeGreaterThanOrEqual(2);
    expect(queryAll(`.${s.ok}`).length).toBeGreaterThanOrEqual(2);
    expect(queryAll(`.${s.gelb}`).length).toBeGreaterThanOrEqual(2);
    expect(exists(".ant-pagination")).toBe(false);

    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/checks/[id]/CheckDetailTabellen.tsx",
      "utf8",
    );
    expect(hatUseClientAlsErsteDirektive(quelle)).toBe(true);
    expect(hatUseClientAlsErsteDirektive('"use strict";\n"use client";'))
      .toBe(false);
    expect(quelle.match(/rowKey=["']id["']/g)).toHaveLength(5);
    expect(quelle.match(/pagination=\{false\}/g)).toHaveLength(5);
    expect(quelle.match(/scroll=\{\{\s*x:\s*["']max-content["']\s*\}\}/g))
      .toHaveLength(5);
  });

  it("behält alle fünf Leertexte einschließlich Altformat-Erklärung bei", async () => {
    await mount(
      <CheckDetailTabellen
        abgleichZeilen={[]}
        nachfuellZeilen={[]}
        geraeteZeilen={[]}
        flaschenZeilen={[]}
        verfallZeilen={[]}
        nachfuellLeertext="Dieser Check stammt aus dem alten Format — Einzelpositionen sind darin nicht enthalten."
      />,
    );

    expect(document.body.textContent).toContain("Keine Positionen erfasst.");
    expect(document.body.textContent)
      .toContain("Dieser Check stammt aus dem alten Format — Einzelpositionen sind darin nicht enthalten.");
    expect(document.body.textContent).toContain("Keine Geräte in diesem Check.");
    expect(document.body.textContent).toContain("Keine Flaschen in diesem Check.");
    expect(document.body.textContent).toContain("Keine Verfallsangabe in diesem Check.");
  });

  it("ersetzt bei unlesbarem Ergebnis ALLE fünf Leertexte durch denselben Satz", async () => {
    /**
     * §11.5 Zustand 27, Review-Fund Minor 3. Jeder der fünf Vorgabetexte
     * BEHAUPTET etwas („Keine Geräte in diesem Check.") — bei zerstörtem
     * `ergebnis` hat das niemand geprüft, und die Tabellen widersprächen sonst
     * der Warnung über ihnen. EIN Text für alle fünf, weil es EINE Ursache ist;
     * `nachfuellLeertext` wird dabei mit überschrieben, sonst stünde
     * ausgerechnet dort noch die Behauptung.
     */
    const SATZ = "Das Ergebnis dieses Checks ist nicht lesbar.";
    await mount(
      <CheckDetailTabellen
        abgleichZeilen={[]}
        nachfuellZeilen={[]}
        geraeteZeilen={[]}
        flaschenZeilen={[]}
        verfallZeilen={[]}
        nachfuellLeertext="Keine Einzelposition erfasst."
        unlesbarLeertext={SATZ}
      />,
    );

    expect(document.body.textContent?.match(new RegExp(SATZ, "g"))).toHaveLength(5);
    expect(document.body.textContent).not.toContain("Keine Positionen erfasst.");
    expect(document.body.textContent).not.toContain("Keine Einzelposition erfasst.");
    expect(document.body.textContent).not.toContain("Keine Geräte in diesem Check.");
    expect(document.body.textContent).not.toContain("Keine Flaschen in diesem Check.");
    expect(document.body.textContent).not.toContain("Keine Verfallsangabe in diesem Check.");
  });
});
