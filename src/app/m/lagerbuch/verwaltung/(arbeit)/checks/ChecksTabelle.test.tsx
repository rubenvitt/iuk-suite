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
import s from "../../../_ui/verwaltung.module.css";
import { ChecksTabelle, type CheckAnzeigeZeile } from "./ChecksTabelle";

const ZEILE: CheckAnzeigeZeile = {
  id: "check-42",
  detailHref: "/verwaltung/checks/check-42",
  fahrzeugName: "RTW 1",
  abgeschlossenText: "7.8.2026, 12:00:00",
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
  ],
  positionenText: "9",
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

describe("ChecksTabelle", () => {
  it("rendert eine gefüllte Anzeigezeile mit unverändertem Tabellenvertrag", async () => {
    await mount(<ChecksTabelle zeilen={[ZEILE]} leertext="Noch kein Check." />);

    expect(queryAll("thead th").map((spalte) => spalte.textContent))
      .toEqual(["Fahrzeug", "Abgeschlossen", "Ergebnis", "Positionen"]);
    const tabelle = query("table");
    expect(tabelle.getAttribute("aria-label")).toBe("Fahrzeug-Checks");
    expect(query("tr[data-row-key='check-42']").textContent).toContain("RTW 1");
    expect(query<HTMLAnchorElement>("a[href='/verwaltung/checks/check-42']").textContent)
      .toBe("RTW 1");
    expect(query(`.${s.jts}`).textContent).toBe("7.8.2026, 12:00:00");
    expect(query("tr[data-row-key='check-42']").textContent)
      .toContain("1 aus Handlager nachgefüllt");
    expect(query("tr[data-row-key='check-42']").textContent).toContain("2 korrigiert");
    expect(query("tr[data-row-key='check-42']").textContent).toContain("1 fehlt weiterhin");
    expect(query("tr[data-row-key='check-42']").textContent).toContain("9");
    expect(queryAll(`.${s.rot}`)).toHaveLength(2);
    expect(queryAll(`.${s.gelb}`)).toHaveLength(1);
    expect(exists(".ant-pagination")).toBe(false);

    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/checks/ChecksTabelle.tsx",
      "utf8",
    );
    expect(quelle.split(/\r?\n/, 1)[0]).toBe('"use client";');
    expect(quelle).toMatch(/rowKey=["']id["']/);
    expect(quelle).toMatch(/pagination=\{false\}/);
    expect(quelle).toMatch(/scroll=\{\{\s*x:\s*["']max-content["']\s*\}\}/);
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
