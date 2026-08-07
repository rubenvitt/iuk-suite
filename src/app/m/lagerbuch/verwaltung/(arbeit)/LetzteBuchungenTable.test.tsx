// @vitest-environment jsdom

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
] satisfies UebersichtJournalZeile[];

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

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
    expect(exists(".ant-pagination")).toBe(false);
    expect(query(".ant-table-content").getAttribute("style")).toContain("overflow-x: auto");
  });

  it("behaelt den bisherigen Leerzustand ohne leere Tabelle", async () => {
    await mount(<LetzteBuchungenTable zeilen={[]} />);
    expect(document.body.textContent).toContain("Noch keine Buchungen.");
    expect(exists("table")).toBe(false);
  });
});
