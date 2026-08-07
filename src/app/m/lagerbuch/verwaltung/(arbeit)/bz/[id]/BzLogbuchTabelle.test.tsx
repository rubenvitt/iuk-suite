// @vitest-environment jsdom

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  exists,
  mount,
  query,
  queryAll,
  rerender,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import {
  BzLogbuchTabelle,
  type BzLogbuchAnzeigeZeile,
} from "./BzLogbuchTabelle";

const ZEILE = {
  id: "kontrolle-1",
  zeitpunktText: "06.08. 14:00",
  ergebnisText: "nicht bestanden",
  ergebnisTon: "rot",
  level1Wert: 50,
  level1Ton: "ok",
  level1MinDamals: 30,
  level1MaxDamals: 70,
  level2Wert: 410,
  level2Ton: "rot",
  level2MinDamals: 200,
  level2MaxDamals: 400,
  verbrauchText: "12 Sticks / 8 Lanzetten · Kompresse 2027-01",
  akkuText: "gewechselt",
  akkuTon: "gelb",
  werText: "E2E Helfer",
  kommentarText: "Kontrolle wiederholen",
} satisfies BzLogbuchAnzeigeZeile;

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

describe("BzLogbuchTabelle", () => {
  it("rendert eine gefüllte DTO-Zeile mit allen acht Spalten und stabiler Semantik", async () => {
    await mount(<BzLogbuchTabelle zeilen={[ZEILE]} />);

    expect(queryAll("thead th").map((th) => th.textContent)).toEqual([
      "Zeitpunkt",
      "Ergebnis",
      "Level 1",
      "Level 2",
      "Verbrauch",
      "Akku",
      "Wer",
      "Kommentar",
    ]);
    expect(query("table").getAttribute("aria-label")).toBe("Logbuch der Kontrollen");
    expect(query("tbody tr[data-row-key]").getAttribute("data-row-key")).toBe("kontrolle-1");
    expect(query("tbody tr[data-row-key]").textContent).toBe(
      "06.08. 14:00nicht bestandenL1 50(damals 30–70)L2 410(damals 200–400)"
      + "12 Sticks / 8 Lanzetten · Kompresse 2027-01gewechseltE2E Helfer"
      + "Kontrolle wiederholen",
    );
    expect(queryAll("tbody .ant-table-cell")).toHaveLength(8);
    expect(exists(".ant-pagination")).toBe(false);
  });

  it("erhält Leertext, Gedankenstriche und horizontalen Scrollvertrag", async () => {
    await mount(<BzLogbuchTabelle zeilen={[]} />);

    expect(query(".ant-table-placeholder").textContent).toBe(
      "Für dieses Gerät wurde noch keine Kontrolle erfasst.",
    );
    expect(exists(".ant-pagination")).toBe(false);
    expect(query(".ant-table-content").getAttribute("style")).toContain("overflow-x: auto");

    const leerwerte = {
      ...ZEILE,
      id: "kontrolle-leerwerte",
      level1Wert: null,
      level1Ton: null,
      level2Wert: null,
      level2Ton: null,
      akkuText: "—",
      akkuTon: null,
      kommentarText: null,
    } satisfies BzLogbuchAnzeigeZeile;
    await rerender(<BzLogbuchTabelle zeilen={[leerwerte]} />);
    expect(query("tbody tr[data-row-key]").textContent?.match(/—/g)).toHaveLength(4);
  });
});
