// @vitest-environment jsdom

import { act } from "react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickElement,
  mount,
  query,
  queryAll,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import {
  VerfallEditor,
  type VerfallAnzeigeZeile,
} from "./VerfallEditor";

const mocks = vi.hoisted(() => ({ setzen: vi.fn() }));

vi.mock("../../../../_actions/lagerortVerfall", () => ({
  verfallSetzen: (...args: unknown[]) => mocks.setzen(...args),
}));

const ZEILEN: VerfallAnzeigeZeile[] = [
  {
    artikelId: "a1",
    artikelName: "Mullbinde",
    fachText: "Fach A · Fach C",
    verfall: "2027-03",
    ampel: "gelb",
    statusText: "läuft bald ab",
  },
  {
    artikelId: "a2",
    artikelName: "Kompressen",
    fachText: "Fach B",
    verfall: null,
    ampel: null,
    statusText: null,
  },
];

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

async function warte(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function monatWaehlen(ariaLabel: string, monat: string): Promise<void> {
  await clickElement(query(`[aria-label='${ariaLabel}']`));
  await warte();
  const zelle = Array.from(document.body.querySelectorAll<HTMLElement>(
    ".ant-picker-cell",
  )).find((element) => element.getAttribute("title") === monat);
  if (!zelle) throw new Error(`Monat nicht gefunden: ${monat}`);
  await clickElement(zelle);
  await warte();
}

async function monatLeeren(artikelId: string): Promise<void> {
  const zeile = query(`tr[data-row-key='${artikelId}']`);
  const clear = zeile.querySelector<HTMLElement>(".ant-picker-clear");
  if (!clear) throw new Error(`Clear-Knopf fehlt für ${artikelId}`);
  await clickElement(clear);
  await warte();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "getComputedStyle")
    .mockImplementation((element) => getComputedStyleOhnePseudo(element));
  mocks.setzen.mockResolvedValue({ ok: true, wert: { gesetzt: true } });
});

afterEach(async () => {
  await unmount();
  vi.restoreAllMocks();
});

describe("VerfallEditor — serverfertige Zeilen und Monatsfelder", () => {
  it("zeigt Artikel, zusammengefuehrte Faecher und den fertigen Status", async () => {
    await mount(<VerfallEditor lagerortId="fz-1" eintraege={ZEILEN} />);

    expect(queryAll("thead th").map((spalte) => spalte.textContent))
      .toEqual(["Artikel", "Fach", "Verfall", "Status"]);
    expect(query("table").getAttribute("aria-label")).toBe("Verfall im Fahrzeug");
    expect(queryAll("tbody tr[data-row-key]")).toHaveLength(2);
    const mull = query("tr[data-row-key='a1']");
    expect(mull.textContent).toContain("Mullbinde");
    expect(mull.textContent).toContain("Fach A · Fach C");
    expect(mull.textContent).toContain("läuft bald ab");
    expect(query("tr[data-row-key='a2']").textContent).toContain("nicht erfasst");
  });

  it("rendert pro Zeile einen kleinen MonthPicker ohne Form", async () => {
    await mount(<VerfallEditor lagerortId="fz-1" eintraege={ZEILEN} />);

    expect(queryAll(".ant-picker")).toHaveLength(2);
    expect(queryAll(".ant-picker-small")).toHaveLength(2);
    expect(query<HTMLInputElement>("[aria-label='Verfall Mullbinde']").value)
      .toBe("2027-03");
    expect(query<HTMLInputElement>("[aria-label='Verfall Kompressen']").value)
      .toBe("");
    expect(queryAll(".ant-form-item")).toHaveLength(0);

    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/fahrzeuge/[id]/VerfallEditor.tsx",
      "utf8",
    );
    expect(quelle).toContain('from "../../../../_ui/monat"');
    expect(quelle).not.toContain("ArtikelDrawer");
    expect(quelle).not.toMatch(/\bForm(?:\.Item)?\b/);
  });
});

describe("VerfallEditor — result-aware Auto-Commit", () => {
  it("setzt einen Monat sofort mit dem exakten Payload", async () => {
    await mount(<VerfallEditor lagerortId="fz-1" eintraege={ZEILEN} />);
    await monatWaehlen("Verfall Mullbinde", "2027-05");

    expect(mocks.setzen).toHaveBeenCalledTimes(1);
    expect(mocks.setzen).toHaveBeenCalledWith({
      lagerortId: "fz-1",
      artikelId: "a1",
      verfall: "2027-05",
    });
    expect(query<HTMLInputElement>("[aria-label='Verfall Mullbinde']").value)
      .toBe("2027-05");
  });

  it("sendet Clear als leeren String statt undefined", async () => {
    mocks.setzen.mockResolvedValueOnce({ ok: true, wert: { gesetzt: false } });
    await mount(<VerfallEditor lagerortId="fz-1" eintraege={ZEILEN} />);
    await monatLeeren("a1");

    expect(mocks.setzen).toHaveBeenCalledWith({
      lagerortId: "fz-1",
      artikelId: "a1",
      verfall: "",
    });
    expect(query<HTMLInputElement>("[aria-label='Verfall Mullbinde']").value).toBe("");
  });

  it.each([
    ["ok:false", async () => ({ ok: false as const, fehler: "interner Text" })],
    ["Reject", async () => { throw new Error("Framework-Text"); }],
  ])("behaelt bei %s den neuen Monat und zeigt einen festen Warning-Text", async (
    _fall,
    antwort,
  ) => {
    mocks.setzen.mockImplementationOnce(antwort);
    await mount(<VerfallEditor lagerortId="fz-1" eintraege={ZEILEN} />);
    await monatWaehlen("Verfall Mullbinde", "2027-06");

    expect(query<HTMLInputElement>("[aria-label='Verfall Mullbinde']").value)
      .toBe("2027-06");
    expect(query(".ant-alert-warning").textContent)
      .toContain("Verfall konnte nicht gespeichert werden.");
    expect(document.body.textContent).not.toContain("Framework-Text");
  });
});
