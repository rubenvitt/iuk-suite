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
  VerlaufTabelle,
  type VerlaufAnzeigeZeile,
} from "./VerlaufTabelle";
import s from "../../../../_ui/verwaltung.module.css";

const CHECK_ZEILE = {
  id: "messung-check",
  zeitpunktText: "07.08. 14:00",
  druckBar: 42,
  herkunft: "check",
  werText: "Token RTW 1",
  kommentarText: "Fahrzeug-Check",
} satisfies VerlaufAnzeigeZeile;

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

describe("VerlaufTabelle", () => {
  it("rendert eine gefüllte DTO-Zeile mit fünf Spalten und Herkunft", async () => {
    await mount(<VerlaufTabelle zeilen={[CHECK_ZEILE]} />);

    expect(queryAll("thead th").map((th) => th.textContent)).toEqual([
      "Zeitpunkt",
      "Druck",
      "Herkunft",
      "Wer",
      "Kommentar",
    ]);
    expect(query("table").getAttribute("aria-label")).toBe("Messungsverlauf");
    expect(query("tbody tr[data-row-key]").getAttribute("data-row-key"))
      .toBe("messung-check");
    expect(queryAll("tbody .ant-table-cell").map((td) => td.textContent)).toEqual([
      "07.08. 14:00",
      "42 bar",
      "aus Check",
      "Token RTW 1",
      "Fahrzeug-Check",
    ]);
    expect(query(`tbody .${s.grau}`).textContent).toBe("aus Check");
    expect(exists(".ant-pagination")).toBe(false);
  });

  it("rendert manuelle Herkunft und leeren Kommentar ohne zu raten", async () => {
    await mount(<VerlaufTabelle zeilen={[{
      ...CHECK_ZEILE,
      id: "messung-manuell",
      herkunft: "manuell",
      kommentarText: null,
    }]} />);

    expect(queryAll("tbody .ant-table-cell").map((td) => td.textContent)).toEqual([
      "07.08. 14:00",
      "42 bar",
      "manuell",
      "Token RTW 1",
      "—",
    ]);
  });

  it("erhält Leertext und horizontalen Scrollvertrag", async () => {
    await mount(<VerlaufTabelle zeilen={[CHECK_ZEILE]} />);
    await rerender(<VerlaufTabelle zeilen={[]} />);

    expect(query(".ant-table-placeholder").textContent).toBe(
      "Für diese Flasche wurde noch keine Messung erfasst.",
    );
    expect(exists(".ant-pagination")).toBe(false);
    expect(query<HTMLElement>(".ant-table-content").style.overflowX).toBe("auto");
    expect(query<HTMLTableElement>("table").style.width).toBe("max-content");
    expect(query<HTMLTableElement>("table").style.minWidth).toBe("100%");
  });
});
