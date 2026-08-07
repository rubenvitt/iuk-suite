// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickElement,
  fill,
  mount,
  query,
  queryAll,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import type { TemplatePositionZeile } from "../../../../_lib/lesepfade/fahrzeuge";
import {
  fachFilter,
  TemplatePosEditor,
  type ArtikelOption,
} from "./TemplatePosEditor";

const mocks = vi.hoisted(() => ({
  setzen: vi.fn(),
  entfernen: vi.fn(),
}));

vi.mock("../../../../_actions/templates", () => ({
  templatePositionSetzen: (...args: unknown[]) => mocks.setzen(...args),
  templatePositionEntfernen: (...args: unknown[]) => mocks.entfernen(...args),
}));

const POSITIONEN: TemplatePositionZeile[] = [
  {
    id: "pos-a",
    fachLabel: "Fach A",
    sort: 1,
    artikelId: "artikel-mull",
    artikelName: "Mullbinde",
    einheit: "Rol",
    handlagerFach: "C2",
    soll: 3,
  },
  {
    id: "pos-b",
    fachLabel: "Fach B",
    sort: 2,
    artikelId: "artikel-kompresse",
    artikelName: "Kompressen",
    einheit: "Pck",
    handlagerFach: "C3",
    soll: 2,
  },
];

const ARTIKEL = [
  { id: "artikel-pflaster", name: "Pflaster", fach: "C3" },
  { id: "artikel-schere", name: "Schere", fach: "A1" },
];

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

async function warte(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function knopf(text: string): HTMLButtonElement {
  const treffer = queryAll<HTMLButtonElement>("button")
    .find((button) => (button.textContent ?? "").includes(text));
  if (!treffer) throw new Error(`Knopf nicht gefunden: ${text}`);
  return treffer;
}

async function waehleOption(text: string): Promise<void> {
  await act(async () => {
    query("[aria-label='Artikel']")
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  await warte();
  const option = Array.from(document.body.querySelectorAll<HTMLElement>(
    ".ant-select-item-option",
  )).find((element) => (element.textContent ?? "").includes(text));
  if (!option) throw new Error(`Artikeloption nicht gefunden: ${text}`);
  await clickElement(option);
  await warte();
}

async function entfernenBestaetigen(): Promise<void> {
  await clickElement(query(
    "button[aria-label='Mullbinde aus Fach Fach A entfernen']",
  ));
  await warte();
  const bestaetigen = Array.from(document.body.querySelectorAll<HTMLButtonElement>(
    ".ant-popconfirm-buttons button",
  )).find((button) => (button.textContent ?? "").includes("Entfernen"));
  if (!bestaetigen) throw new Error("Entfernen-Bestätigung fehlt");
  await clickElement(bestaetigen);
  await warte();
}

async function editorMounten(): Promise<void> {
  await mount(
    <TemplatePosEditor
      templateId="template-1"
      positionen={POSITIONEN}
      artikel={ARTIKEL}
    />,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.spyOn(window, "getComputedStyle")
    .mockImplementation((element) => getComputedStyleOhnePseudo(element));
  mocks.setzen.mockResolvedValue({ ok: true, wert: { id: "pos-neu" } });
  mocks.entfernen.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("TemplatePosEditor — echte Vorlagenzeilen und Tabelle", () => {
  it("rendert vier Spalten, reale Metadaten und stabile Tabellenattribute", async () => {
    await editorMounten();

    expect(queryAll("thead th").map((spalte) => spalte.textContent))
      .toEqual(["Fach", "Artikel", "Soll", ""]);
    expect(query("table").getAttribute("aria-label")).toBe("Vorlagen-Positionen");
    expect(queryAll("tbody tr[data-row-key]").map((zeile) =>
      zeile.getAttribute("data-row-key"))).toEqual(["pos-a", "pos-b"]);
    expect(query("tr[data-row-key='pos-a']").textContent)
      .toContain("Mullbinde");
    expect(query("tr[data-row-key='pos-a']").textContent)
      .toContain("Handlager C2 · Rol");
    expect(queryAll("tbody .ant-input-number-sm")).toHaveLength(2);
    expect(document.body.querySelector(".ant-pagination")).toBeNull();
    expect(query(".ant-table-content").getAttribute("style"))
      .toContain("overflow-x: auto");
  });

  it("enthält kein Formular und öffnet zum Entfernen einen Popconfirm statt Modal", async () => {
    await editorMounten();
    expect(queryAll("form")).toHaveLength(0);
    expect(queryAll(".ant-form-item")).toHaveLength(0);

    await clickElement(query(
      "button[aria-label='Mullbinde aus Fach Fach A entfernen']",
    ));
    await warte();
    expect(document.body.querySelector(".ant-popconfirm")).not.toBeNull();
    expect(document.body.querySelector(".ant-modal")).toBeNull();
  });

  it("filtert den konkret typisierten Select über Name und Handlager-Fach", () => {
    const option: ArtikelOption = {
      value: "artikel-pflaster",
      label: "Pflaster",
      keywords: "C3",
    };
    expect(fachFilter("pflast", option)).toBe(true);
    expect(fachFilter("c3", option)).toBe(true);
    expect(fachFilter("z9", option)).toBe(false);
  });
});

describe("TemplatePosEditor — 400-ms-Auto-Commit", () => {
  it("committet erst bei 400 ms den vollständigen Edit-Payload", async () => {
    await editorMounten();
    await fill("input[aria-label='Soll für Mullbinde']", "5");

    await act(async () => { await vi.advanceTimersByTimeAsync(399); });
    expect(mocks.setzen).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    await warte();

    expect(mocks.setzen).toHaveBeenCalledTimes(1);
    expect(mocks.setzen).toHaveBeenCalledWith({
      id: "pos-a",
      templateId: "template-1",
      fachLabel: "Fach A",
      artikelId: "artikel-mull",
      soll: 5,
      sort: 1,
    });
  });

  it("ersetzt einen schnellen Entwurf und sendet nur den neuesten Wert", async () => {
    await editorMounten();
    await fill("input[aria-label='Soll für Mullbinde']", "5");
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    await fill("input[aria-label='Soll für Mullbinde']", "7");
    await act(async () => { await vi.advanceTimersByTimeAsync(399); });
    expect(mocks.setzen).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    await warte();

    expect(mocks.setzen).toHaveBeenCalledTimes(1);
    expect(mocks.setzen).toHaveBeenCalledWith(expect.objectContaining({
      id: "pos-a",
      soll: 7,
    }));
  });

  it("räumt beim Unmount alle ausstehenden Timer auf", async () => {
    await editorMounten();
    await fill("input[aria-label='Soll für Mullbinde']", "9");
    await unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(mocks.setzen).not.toHaveBeenCalled();
  });

  it("cancelt den Pending-Timer, bevor dieselbe Position entfernt wird", async () => {
    await editorMounten();
    await fill("input[aria-label='Soll für Mullbinde']", "8");
    await entfernenBestaetigen();
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });

    expect(mocks.entfernen).toHaveBeenCalledWith({ id: "pos-a" });
    expect(mocks.setzen).not.toHaveBeenCalled();
  });

  it.each([
    ["ok:false", async () => ({ ok: false as const, fehler: "interner Text" })],
    ["Reject", async () => { throw new Error("Framework-Text"); }],
  ])("behält bei Edit-%s den lokalen Wert und zeigt einen festen Fehler", async (
    _fall,
    antwort,
  ) => {
    mocks.setzen.mockImplementationOnce(antwort);
    await editorMounten();
    await fill("input[aria-label='Soll für Mullbinde']", "8");
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await warte();

    expect(query<HTMLInputElement>("input[aria-label='Soll für Mullbinde']").value)
      .toBe("8");
    expect(query(".ant-alert-warning").textContent)
      .toContain("Vorlagenposition konnte nicht gespeichert werden.");
    expect(document.body.textContent).not.toContain("Framework-Text");
  });
});

describe("TemplatePosEditor — Hinzufügen und Entfernen", () => {
  it("sendet beim Hinzufügen den exakten Payload und leert erst nach Erfolg", async () => {
    await editorMounten();
    await fill("input[aria-label='Fach']", " Fach Neu ");
    await waehleOption("Pflaster");
    await fill("input[aria-label='Soll']", "4");
    await clickElement(knopf("Position hinzufügen"));
    await warte();

    expect(mocks.setzen).toHaveBeenCalledWith({
      templateId: "template-1",
      fachLabel: "Fach Neu",
      artikelId: "artikel-pflaster",
      soll: 4,
    });
    expect(query<HTMLInputElement>("input[aria-label='Fach']").value)
      .toBe(" Fach Neu ");
    expect(query<HTMLInputElement>("input[aria-label='Soll']").value).toBe("1");
    expect(query(".ant-select").textContent).not.toContain("Pflaster");
  });

  it.each([
    ["ok:false", async () => ({ ok: false as const, fehler: "interner Text" })],
    ["Reject", async () => { throw new Error("Framework-Text"); }],
  ])("behält bei Add-%s alle Eingaben und zeigt einen festen Fehler", async (
    _fall,
    antwort,
  ) => {
    mocks.setzen.mockImplementationOnce(antwort);
    await editorMounten();
    await fill("input[aria-label='Fach']", "Fach X");
    await waehleOption("Pflaster");
    await fill("input[aria-label='Soll']", "6");
    await clickElement(knopf("Position hinzufügen"));
    await warte();

    expect(query<HTMLInputElement>("input[aria-label='Fach']").value).toBe("Fach X");
    expect(query<HTMLInputElement>("input[aria-label='Soll']").value).toBe("6");
    expect(query(".ant-select").textContent).toContain("Pflaster");
    expect(query(".ant-alert-warning").textContent)
      .toContain("Vorlagenposition konnte nicht gespeichert werden.");
    expect(document.body.textContent).not.toContain("Framework-Text");
  });

  it("entfernt mit der echten Positions-ID", async () => {
    await editorMounten();
    await entfernenBestaetigen();
    expect(mocks.entfernen).toHaveBeenCalledWith({ id: "pos-a" });
  });

  it.each([
    ["ok:false", async () => ({ ok: false as const, fehler: "interner Text" })],
    ["Reject", async () => { throw new Error("Framework-Text"); }],
  ])("hält die Tabelle bei Remove-%s und zeigt einen festen Fehler", async (
    _fall,
    antwort,
  ) => {
    mocks.entfernen.mockImplementationOnce(antwort);
    await editorMounten();
    await entfernenBestaetigen();

    expect(queryAll("tbody tr[data-row-key]")).toHaveLength(2);
    expect(query(".ant-alert-warning").textContent)
      .toContain("Vorlagenposition konnte nicht entfernt werden.");
    expect(document.body.textContent).not.toContain("Framework-Text");
  });
});
