// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exists,
  mount,
  query,
  queryAll,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import s from "../../../../_ui/verwaltung.module.css";
import {
  CheckDetailTabellen,
  type CheckDetailTabellenProps,
} from "./CheckDetailTabellen";

const GEFUELLT: CheckDetailTabellenProps = {
  abgleichZeilen: [{
    id: "artikel-1",
    artikel: "Verbandpäckchen",
    sollText: "4",
    istText: "2",
    korrekturText: "1",
    nachgefuelltText: "1",
    offenChip: { text: "fehlt 1", ton: "rot", zeichen: "warnung" },
  }],
  nachfuellZeilen: [{
    id: "position-1",
    fachText: "Fach 7",
    artikelText: "Verbandpäckchen",
    einheitText: "Stk.",
    sollText: "4",
    istText: "2",
    lueckeChip: { text: "2 fehlten", ton: "rot", zeichen: "warnung" },
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

    expect(query("tr[data-row-key='artikel-1']").textContent)
      .toContain("Verbandpäckchen4211fehlt 1");
    expect(query("tr[data-row-key='position-1']").textContent)
      .toContain("Fach 7Verbandpäckchen Stk.422 fehlten");
    expect(query("tr[data-row-key='geraet-1']").textContent)
      .toContain("DefibrillatorvorhandenGebrauchsspurenElektroden prüfen");
    expect(query("tr[data-row-key='flasche-1']").textContent)
      .toContain("O2 klein150 bar50 %");
    expect(query("tr[data-row-key='verfall-1']").textContent)
      .toContain("Kompressen2026-08läuft bald ab");
    expect(queryAll(`.${s.rot}`).length).toBeGreaterThanOrEqual(2);
    expect(queryAll(`.${s.ok}`).length).toBeGreaterThanOrEqual(2);
    expect(queryAll(`.${s.gelb}`).length).toBeGreaterThanOrEqual(2);
    expect(exists(".ant-pagination")).toBe(false);

    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/checks/[id]/CheckDetailTabellen.tsx",
      "utf8",
    );
    expect(quelle.split(/\r?\n/, 1)[0]).toBe('"use client";');
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
});
