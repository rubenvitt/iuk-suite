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
import s from "../../../../_ui/verwaltung.module.css";

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

function zellen(): HTMLTableCellElement[] {
  return queryAll<HTMLTableCellElement>("tbody tr[data-row-key] td");
}

function chipMitText(zelle: HTMLTableCellElement, text: string): HTMLSpanElement {
  const chip = Array.from(zelle.querySelectorAll<HTMLSpanElement>("span"))
    .find((element) => element.classList.contains(s.chip) && element.textContent === text);
  if (!chip) throw new Error(`Chip fehlt: ${text}`);
  return chip;
}

function nebenText(zelle: HTMLTableCellElement, text: string): HTMLSpanElement {
  const span = Array.from(zelle.querySelectorAll<HTMLSpanElement>("span"))
    .find((element) => element.textContent === text);
  if (!span) throw new Error(`Nebentext fehlt: ${text}`);
  return span;
}

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

  it("bindet Ergebnis, beide Level, Akku und Person an ihre konkreten Tonklassen", async () => {
    await mount(<BzLogbuchTabelle zeilen={[ZEILE]} />);
    const daten = zellen();

    expect(chipMitText(daten[1]!, "nicht bestanden").classList).toContain(s.rot);
    expect(chipMitText(daten[2]!, "L1 50").classList).toContain(s.ok);
    expect(chipMitText(daten[3]!, "L2 410").classList).toContain(s.rot);
    expect(chipMitText(daten[5]!, "gewechselt").classList).toContain(s.gelb);
    expect(chipMitText(daten[6]!, "E2E Helfer").classList).toContain(s.grau);
  });

  it("erhält Zeitklasse, Nebentext-Rollen und das konkrete Akku-Zeichen", async () => {
    await mount(<BzLogbuchTabelle zeilen={[ZEILE]} />);
    const daten = zellen();

    const zeit = daten[0]!.querySelector<HTMLSpanElement>(`span.${s.jts}`);
    expect(zeit?.textContent).toBe("06.08. 14:00");

    for (const [index, text] of [
      [2, "(damals 30–70)"],
      [3, "(damals 200–400)"],
    ] as const) {
      const snapshot = nebenText(daten[index]!, text);
      expect(snapshot.style.fontSize).toBe("12px");
      expect(snapshot.style.marginInlineStart).toBe("6px");
    }
    expect(nebenText(
      daten[4]!,
      "12 Sticks / 8 Lanzetten · Kompresse 2027-01",
    ).style.fontSize).toBe("12px");

    const akku = daten[5]!.querySelector<SVGElement>("svg");
    expect(akku).not.toBeNull();
    expect(akku?.getAttribute("aria-hidden")).toBe("true");
    expect(akku?.getAttribute("width")).toBe("12");
    expect(akku?.getAttribute("height")).toBe("12");
    expect(akku?.getAttribute("data-zeichen")).toBe("akku");
  });

  it("erhält Leertext, Gedankenstriche und horizontalen Scrollvertrag", async () => {
    await mount(<BzLogbuchTabelle zeilen={[]} />);

    expect(query(".ant-table-placeholder").textContent).toBe(
      "Für dieses Gerät wurde noch keine Kontrolle erfasst.",
    );
    expect(exists(".ant-pagination")).toBe(false);
    expect(query<HTMLElement>(".ant-table-content").style.overflowX).toBe("auto");
    expect(query<HTMLTableElement>("table").style.width).toBe("max-content");
    expect(query<HTMLTableElement>("table").style.minWidth).toBe("100%");

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
    const daten = zellen();
    expect(daten.map((zelle) => zelle.textContent)).toEqual([
      "06.08. 14:00",
      "nicht bestanden",
      "—",
      "—",
      "12 Sticks / 8 Lanzetten · Kompresse 2027-01",
      "—",
      "E2E Helfer",
      "—",
    ]);
    for (const index of [2, 3, 5, 7]) {
      expect(nebenText(daten[index]!, "—").style.fontSize).toBe("12px");
    }
  });
});
