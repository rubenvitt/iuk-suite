// @vitest-environment jsdom

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  clickElement,
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

const mocks = vi.hoisted(() => ({ kontrolleStornieren: vi.fn() }));

vi.mock("../../../../_actions/bz", () => ({
  kontrolleStornieren: (...args: unknown[]) => mocks.kontrolleStornieren(...args),
}));

const ZEILE = {
  id: "kontrolle-1",
  zeitpunktText: "06.08. 14:00",
  zeitpunktIso: "2026-08-06T12:00:00.000Z",
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
  storniertText: null,
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
    .find((element) => element.hasAttribute("data-statuschip") && element.textContent === text);
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
  it("rendert eine gefüllte DTO-Zeile mit allen sieben Spalten und stabiler Semantik", async () => {
    await mount(<BzLogbuchTabelle zeilen={[ZEILE]} />);

    expect(queryAll("thead th").map((th) => th.textContent)).toEqual([
      "Zeitpunkt",
      "Ergebnis",
      "Level 1",
      "Level 2",
      // IDA-393: „Wer" steht unter dem Zeitpunkt, „Akku" unter dem Verbrauch.
      "Verbrauch",
      "Kommentar",
      "Aktion",
    ]);
    expect(query("table").getAttribute("aria-label")).toBe("Logbuch der Kontrollen");
    expect(query("tbody tr[data-row-key]").getAttribute("data-row-key")).toBe("kontrolle-1");
    expect(query("tbody tr[data-row-key]").textContent).toBe(
      "06.08. 14:00E2E Helfernicht bestandenL1 50(damals 30–70)L2 410(damals 200–400)"
      + "12 Sticks / 8 LanzettenKompresse 2027-01Akku gewechselt"
      + "Kontrolle wiederholenStornieren",
    );
    expect(queryAll("tbody .ant-table-cell")).toHaveLength(7);
    expect(exists(".ant-pagination")).toBe(false);
  });

  it("bindet Ergebnis, beide Level, Akku und Person an ihre konkreten Tonklassen", async () => {
    await mount(<BzLogbuchTabelle zeilen={[ZEILE]} />);
    const daten = zellen();

    expect(chipMitText(daten[1]!, "nicht bestanden").dataset.statuschip).toBe("fehler");
    expect(chipMitText(daten[2]!, "L1 50").dataset.statuschip).toBe("ok");
    expect(chipMitText(daten[3]!, "L2 410").dataset.statuschip).toBe("fehler");
    expect(chipMitText(daten[4]!, "Akku gewechselt").dataset.statuschip).toBe("warnung");
    expect(chipMitText(daten[0]!, "E2E Helfer").dataset.statuschip).toBe("neutral");
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
    }
    for (const teil of ["12 Sticks / 8 Lanzetten", "Kompresse 2027-01"]) {
      expect(nebenText(daten[4]!, teil).style.fontSize).toBe("12px");
    }

    const akku = daten[4]!.querySelector<SVGElement>("svg");
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
      "06.08. 14:00E2E Helfer",
      "nicht bestanden",
      "—",
      "—",
      "12 Sticks / 8 LanzettenKompresse 2027-01",
      "—",
      "Stornieren",
    ]);
    for (const index of [2, 3, 5]) {
      expect(nebenText(daten[index]!, "—").style.fontSize).toBe("12px");
    }
  });

  /**
   * ⛔ KEIN SORTIERER — UND DIESER TEST STAND VORHER AUF DEM KOPF.
   *
   * Er prueft heute das Gegenteil dessen, was er bis DRK-331 (fuenfte
   * Reviewrunde) pruefte. Der Grund steht ueber der Spaltenliste: der Lesepfad
   * deckelt auf `BZ_LOGBUCH_GRENZE`, und ein Vergleicher verspraeche ein
   * Extrem, das eine gedeckelte Liste nicht halten kann.
   *
   * Die beiden Zeitpunkte sind so gewaehlt, dass eine versehentlich wieder
   * eingebaute Ordnung — ueber den Rohwert wie ueber den Anzeigetext — eine
   * andere Reihenfolge ergaebe als die Eingabe.
   */
  it("ordnet nicht selbst und bietet an keiner Spalte einen Sortierer", async () => {
    const september = {
      ...ZEILE,
      id: "kontrolle-september",
      zeitpunktText: "14.09. 08:00",
      zeitpunktIso: "2026-09-14T06:00:00.000Z",
    } satisfies BzLogbuchAnzeigeZeile;
    const oktober = {
      ...ZEILE,
      id: "kontrolle-oktober",
      zeitpunktText: "02.10. 08:00",
      zeitpunktIso: "2026-10-02T06:00:00.000Z",
    } satisfies BzLogbuchAnzeigeZeile;

    await mount(<BzLogbuchTabelle zeilen={[september, oktober]} />);

    const schluessel = () => queryAll("tbody tr[data-row-key]")
      .map((tr) => tr.getAttribute("data-row-key"));
    expect(schluessel()).toEqual(["kontrolle-september", "kontrolle-oktober"]);
    expect(queryAll(".ant-table-column-sorter")).toHaveLength(0);
  });

  /**
   * Der Ergebnisfilter sitzt im Spaltenkopf — die Tabelle hatte vorher gar
   * keinen, und „nur die nicht bestandenen" ist die Frage, mit der man ein
   * Logbuch aufschlaegt.
   */
  it("filtert das Ergebnis über den Spaltenkopf", async () => {
    const bestanden = {
      ...ZEILE,
      id: "kontrolle-bestanden",
      ergebnisText: "bestanden",
      ergebnisTon: "ok",
    } satisfies BzLogbuchAnzeigeZeile;

    await mount(<BzLogbuchTabelle zeilen={[ZEILE, bestanden]} />);

    const kopf = queryAll<HTMLElement>("thead th")
      .find((th) => (th.textContent ?? "").includes("Ergebnis"));
    await clickElement(kopf!.querySelector<HTMLElement>(".ant-table-filter-trigger")!);

    const offen = () => document.body.querySelector<HTMLElement>(
      ".ant-dropdown:not(.ant-dropdown-hidden) .ant-table-filter-dropdown",
    );
    const eintrag = Array.from(offen()?.querySelectorAll<HTMLElement>("li") ?? [])
      .find((li) => li.textContent === "bestanden");
    await clickElement(eintrag!);
    // Ohne `ConfigProvider`-Locale heisst der Knopf englisch; „OK" gilt in
    // beiden Sprachen.
    const ok = Array.from(offen()?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((knopf) => knopf.textContent === "OK");
    await clickElement(ok!);

    expect(queryAll("tbody tr[data-row-key]").map((tr) => tr.getAttribute("data-row-key")))
      .toEqual(["kontrolle-bestanden"]);
  });
});

/**
 * IDA-379 — DER STORNO. Die Zeile bleibt stehen, wird durchgestrichen und
 * traegt keinen Knopf mehr; die Rueckfrage nennt die Folge.
 */
describe("BzLogbuchTabelle — Storno", () => {
  const STORNIERT = {
    ...ZEILE,
    id: "kontrolle-storniert",
    storniertText: "storniert 07.08. 10:00 · A. Verwaltung",
  } satisfies BzLogbuchAnzeigeZeile;

  function offeneRueckfrage(): HTMLElement | null {
    return document.body.querySelector<HTMLElement>(".ant-popover:not(.ant-popover-hidden)");
  }

  it("zeigt eine stornierte Zeile durchgestrichen, mit Vermerk und ohne Knopf", async () => {
    await mount(<BzLogbuchTabelle zeilen={[STORNIERT]} />);
    const daten = zellen();

    expect(chipMitText(daten[1]!, "storniert").dataset.statuschip).toBe("neutral");
    expect(nebenText(daten[1]!, "nicht bestanden").style.textDecoration).toBe("line-through");
    expect(daten[3]!.querySelector<HTMLElement>("span")?.style.textDecoration).toBe("line-through");
    expect(daten[0]!.textContent).toBe("06.08. 14:00E2E Helferstorniert 07.08. 10:00 · A. Verwaltung");
    expect(daten[6]!.textContent).toBe("—");
    expect(daten[6]!.querySelector("button")).toBeNull();
  });

  it("fragt mit der Folge nach und storniert erst nach der Bestätigung", async () => {
    mocks.kontrolleStornieren.mockResolvedValueOnce({ ok: true });
    await mount(<BzLogbuchTabelle zeilen={[ZEILE]} />);

    await clickElement(query<HTMLButtonElement>("button[aria-label='Kontrolle vom 06.08. 14:00 stornieren']"));
    expect(mocks.kontrolleStornieren).not.toHaveBeenCalled();
    expect(offeneRueckfrage()?.textContent).toContain("Kontrolle stornieren?");
    expect(offeneRueckfrage()?.textContent).toContain("Sie zählt danach nicht mehr für die Fälligkeit.");

    const ok = Array.from(offeneRueckfrage()!.querySelectorAll<HTMLButtonElement>("button"))
      .find((knopf) => knopf.textContent === "Stornieren");
    await clickElement(ok!);

    expect(mocks.kontrolleStornieren).toHaveBeenCalledWith({ kontrolleId: "kontrolle-1" });
  });

  it("zeigt den Satz der Action, wenn der Storno abgelehnt wird", async () => {
    mocks.kontrolleStornieren.mockResolvedValueOnce({ ok: false, fehler: "Kontrolle ist bereits storniert." });
    await mount(<BzLogbuchTabelle zeilen={[ZEILE]} />);

    await clickElement(query<HTMLButtonElement>("button[aria-label='Kontrolle vom 06.08. 14:00 stornieren']"));
    const ok = Array.from(offeneRueckfrage()!.querySelectorAll<HTMLButtonElement>("button"))
      .find((knopf) => knopf.textContent === "Stornieren");
    await clickElement(ok!);

    for (let versuch = 0; versuch < 20 && !exists("[role='alert']"); versuch += 1) {
      await new Promise((fertig) => setTimeout(fertig, 0));
    }
    expect(query("[role='alert']").textContent).toBe("Kontrolle ist bereits storniert.");
  });

  it("filtert stornierte Zeilen getrennt von bestanden/nicht bestanden", async () => {
    await mount(<BzLogbuchTabelle zeilen={[ZEILE, STORNIERT]} />);

    const kopf = queryAll<HTMLElement>("thead th")
      .find((th) => (th.textContent ?? "").includes("Ergebnis"));
    await clickElement(kopf!.querySelector<HTMLElement>(".ant-table-filter-trigger")!);
    const offen = () => document.body.querySelector<HTMLElement>(
      ".ant-dropdown:not(.ant-dropdown-hidden) .ant-table-filter-dropdown",
    );
    const eintrag = Array.from(offen()?.querySelectorAll<HTMLElement>("li") ?? [])
      .find((li) => li.textContent === "nicht bestanden");
    await clickElement(eintrag!);
    const ok = Array.from(offen()?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((knopf) => knopf.textContent === "OK");
    await clickElement(ok!);

    expect(queryAll("tbody tr[data-row-key]").map((tr) => tr.getAttribute("data-row-key")))
      .toEqual(["kontrolle-1"]);
  });
});
