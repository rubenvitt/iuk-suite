// @vitest-environment jsdom

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
  },
  {
    id: "journal-positiv",
    zeitText: "07.08. 15:00",
    artikelName: "Kompressen",
    vorgangText: "Wareneingang",
    deltaText: "+2",
    deltaTon: "positiv",
    quelleName: "Helfer",
  },
] satisfies JournalAnzeigeZeile[];

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

describe("JournalTable", () => {
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
