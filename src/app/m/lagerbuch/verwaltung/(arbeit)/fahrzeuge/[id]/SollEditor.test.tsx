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
import type { SollZeile } from "../../../../_lib/lesepfade/fahrzeuge";
import s from "../../../../_ui/verwaltung.module.css";
import {
  fachFilter,
  sollGruppieren,
  SollEditor,
} from "./SollEditor";

const mocks = vi.hoisted(() => ({
  setzen: vi.fn(),
  entfernen: vi.fn(),
  wiederherstellen: vi.fn(),
}));

vi.mock("../../../../_actions/fahrzeuge", () => ({
  sollPositionSetzen: (...args: unknown[]) => mocks.setzen(...args),
  sollPositionEntfernen: (...args: unknown[]) => mocks.entfernen(...args),
  sollPositionWiederherstellen: (...args: unknown[]) => mocks.wiederherstellen(...args),
}));

const POSITIONEN: SollZeile[] = [
  {
    id: "p-b1",
    fachLabel: "Fach B",
    sort: 1,
    artikelId: "a-b1",
    artikelName: "Beatmungsbeutel",
    einheit: "Stk",
    handlagerFach: "H2",
    soll: 1,
    fahrzeugBestand: 1,
    handlagerBestand: 4,
    herkunft: "manuell",
    entfernt: false,
  },
  {
    id: "p-a2",
    fachLabel: "Fach A",
    sort: 2,
    artikelId: "a-a2",
    artikelName: "Kompressen",
    einheit: "Pck",
    handlagerFach: "C3",
    soll: 2,
    fahrzeugBestand: 0,
    handlagerBestand: 7,
    herkunft: "vorlage",
    entfernt: true,
  },
  {
    id: "p-c1",
    fachLabel: "Fach C",
    sort: 0,
    artikelId: "a-c1",
    artikelName: "Dreiecktuch",
    einheit: "Stk",
    handlagerFach: "D1",
    soll: 3,
    fahrzeugBestand: 2,
    handlagerBestand: 8,
    herkunft: "ueberschrieben",
    entfernt: false,
  },
  {
    id: "p-a1",
    fachLabel: "Fach A",
    sort: 1,
    artikelId: "a-a1",
    artikelName: "Mullbinde",
    einheit: "Rol",
    handlagerFach: "C2",
    soll: 3,
    fahrzeugBestand: 2,
    handlagerBestand: 9,
    herkunft: "vorlage",
    entfernt: false,
  },
];

const ARTIKEL = [
  { id: "a-neu", name: "Pflaster", fach: "C3" },
  { id: "a-anderer", name: "Schere", fach: "A1" },
];

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

async function warte(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function waehleOption(label: string, text: string): Promise<void> {
  const input = query<HTMLInputElement>(`[aria-label='${label}']`);
  await act(async () => {
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  await warte();
  const option = Array.from(document.body.querySelectorAll<HTMLElement>(
    ".ant-select-item-option",
  )).find((element) => (element.textContent ?? "").includes(text));
  if (!option) throw new Error(`Option nicht gefunden: ${text}`);
  await clickElement(option);
  await warte();
}

function knopf(text: string): HTMLButtonElement {
  const treffer = queryAll<HTMLButtonElement>("button")
    .find((button) => (button.textContent ?? "").includes(text));
  if (!treffer) throw new Error(`Knopf nicht gefunden: ${text}`);
  return treffer;
}

async function entfernenBestaetigen(
  ariaLabel = "Beatmungsbeutel aus Fach Fach B entfernen",
): Promise<void> {
  await clickElement(query<HTMLButtonElement>(
    `button[aria-label='${ariaLabel}']`,
  ));
  await warte();
  const bestaetigen = Array.from(document.body.querySelectorAll<HTMLButtonElement>(
    ".ant-popconfirm-buttons button",
  )).find((button) => (button.textContent ?? "").includes("Entfernen"));
  if (!bestaetigen) throw new Error("Entfernen-Bestaetigung fehlt");
  await clickElement(bestaetigen);
  await warte();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.spyOn(window, "getComputedStyle")
    .mockImplementation((element) => getComputedStyleOhnePseudo(element));
  mocks.setzen.mockResolvedValue({ ok: true, wert: { id: "p-neu" } });
  mocks.entfernen.mockResolvedValue({ ok: true });
  mocks.wiederherstellen.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SollEditor — Tabelle und Fachgruppen", () => {
  it("sortiert eine Kopie und berechnet echte rowSpan-Gruppen", () => {
    const gruppiert = sollGruppieren(POSITIONEN);
    expect(gruppiert.map(({ id, rowSpan }) => ({ id, rowSpan }))).toEqual([
      { id: "p-a1", rowSpan: 2 },
      { id: "p-a2", rowSpan: 0 },
      { id: "p-b1", rowSpan: 1 },
      { id: "p-c1", rowSpan: 1 },
    ]);
    expect(POSITIONEN.map((position) => position.id)).toEqual([
      "p-b1",
      "p-a2",
      "p-c1",
      "p-a1",
    ]);
  });

  it("rendert die fuenf Spalten und gruppiert Fachzellen im DOM", async () => {
    await mount(<SollEditor fahrzeugId="fz-1" positionen={POSITIONEN} artikel={ARTIKEL} />);

    expect(queryAll("thead th").map((th) => th.textContent))
      .toEqual(["Fach", "Artikel", "Soll", "Herkunft", ""]);
    expect(query("table").getAttribute("aria-label")).toBe("Soll-Bestückung");
    expect(queryAll("tbody tr[data-row-key]")).toHaveLength(4);
    expect(queryAll("tbody tr[data-row-key]").map((zeile) =>
      zeile.textContent?.includes("Mullbinde")))
      .toEqual([true, false, false, false]);
    expect(queryAll("td[rowspan]").map((zelle) => zelle.getAttribute("rowspan")))
      .toEqual(["2"]);
    expect(queryAll(`tbody td .${s.fach}`).map((zelle) => zelle.textContent))
      .toEqual(["Fach A", "Fach B", "Fach C"]);
    expect(queryAll("tbody .ant-input-number-sm")).toHaveLength(4);
  });

  it("zeigt Grabsteine durchgestrichen mit Chip und Restore-Weg", async () => {
    await mount(<SollEditor fahrzeugId="fz-1" positionen={POSITIONEN} artikel={ARTIKEL} />);

    expect(queryAll("tbody tr[data-row-key]")).toHaveLength(4);
    const grabstein = query("[data-rolle='grabstein']");
    expect(grabstein.textContent).toContain("Kompressen");
    expect(grabstein.textContent).toContain("entfernt");
    expect(grabstein.getAttribute("style")).toContain("line-through");
    expect(query("[data-rolle='wiederherstellen']").textContent).toContain("zurücksetzen");
  });

  it("filtert den typed Artikel-Select ueber Name und Handlager-Fach", () => {
    expect(fachFilter("pflast", { value: "a-neu", label: "Pflaster", keywords: "C3" }))
      .toBe(true);
    expect(fachFilter("c3", { value: "a-neu", label: "Pflaster", keywords: "C3" }))
      .toBe(true);
    expect(fachFilter("z9", { value: "a-neu", label: "Pflaster", keywords: "C3" }))
      .toBe(false);
  });
});

describe("SollEditor — auto-committende Sollmenge", () => {
  it("committet bei 399 ms noch nicht und bei 400 ms den vollstaendigen Payload", async () => {
    await mount(<SollEditor fahrzeugId="fz-1" positionen={POSITIONEN} artikel={ARTIKEL} />);
    await fill("input[aria-label='Soll für Mullbinde']", "5");

    await act(async () => { await vi.advanceTimersByTimeAsync(399); });
    expect(mocks.setzen).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    await warte();

    expect(mocks.setzen).toHaveBeenCalledTimes(1);
    expect(mocks.setzen).toHaveBeenCalledWith({
      id: "p-a1",
      fahrzeugId: "fz-1",
      fachLabel: "Fach A",
      artikelId: "a-a1",
      soll: 5,
      sort: 1,
    });
  });

  it("ersetzt einen schnellen Entwurf und sendet nur den neuesten Wert", async () => {
    await mount(<SollEditor fahrzeugId="fz-1" positionen={POSITIONEN} artikel={ARTIKEL} />);
    await fill("input[aria-label='Soll für Mullbinde']", "5");
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    await fill("input[aria-label='Soll für Mullbinde']", "7");
    await act(async () => { await vi.advanceTimersByTimeAsync(399); });
    expect(mocks.setzen).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    await warte();

    expect(mocks.setzen).toHaveBeenCalledTimes(1);
    expect(mocks.setzen).toHaveBeenCalledWith(expect.objectContaining({
      id: "p-a1",
      soll: 7,
    }));
  });

  it("raeumt beim Unmount alle ausstehenden Timer auf", async () => {
    await mount(<SollEditor fahrzeugId="fz-1" positionen={POSITIONEN} artikel={ARTIKEL} />);
    await fill("input[aria-label='Soll für Mullbinde']", "9");
    await unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(mocks.setzen).not.toHaveBeenCalled();
  });

  it("cancelt ein ausstehendes Soll-Edit, bevor dieselbe Vorlagenposition entfernt wird", async () => {
    await mount(<SollEditor fahrzeugId="fz-1" positionen={POSITIONEN} artikel={ARTIKEL} />);
    await fill("input[aria-label='Soll für Mullbinde']", "9");
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });

    await entfernenBestaetigen("Mullbinde aus Fach Fach A entfernen");
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    await warte();

    expect(mocks.entfernen).toHaveBeenCalledWith({ id: "p-a1" });
    expect(mocks.setzen).not.toHaveBeenCalled();
  });

  /**
   * ZWEI GETRENNTE ZUSAGEN: der lokale Wert bleibt in BEIDEN Faellen stehen,
   * der TEXT unterscheidet sich. Bei `ok:false` steht der Satz aus der Action
   * da — `sollPositionSetzen` unterscheidet „Fahrzeug nicht gefunden." von
   * „Soll-Position nicht gefunden." von einem Schreibfehler, und nur dieser
   * Satz sagt der Person, ob neu laden oder etwas anderes eintragen hilft. Im
   * Wurf bleibt die Modulkonstante: dort ist `e.message` in Produktion
   * Framework-Englisch (siehe `_lib/actionErgebnis`).
   */
  it.each([
    [
      "ok:false",
      async () => ({ ok: false as const, fehler: "Soll-Position nicht gefunden." }),
      "Soll-Position nicht gefunden.",
    ],
    [
      "Reject",
      async () => { throw new Error("Framework-Text"); },
      "Soll-Position konnte nicht gespeichert werden.",
    ],
  ] as const)("behaelt bei Edit-%s den lokalen Wert und zeigt eine Warning", async (
    _fall,
    antwort,
    text,
  ) => {
    mocks.setzen.mockImplementationOnce(antwort);
    await mount(<SollEditor fahrzeugId="fz-1" positionen={POSITIONEN} artikel={ARTIKEL} />);
    await fill("input[aria-label='Soll für Mullbinde']", "8");
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await warte();

    expect(query<HTMLInputElement>("input[aria-label='Soll für Mullbinde']").value).toBe("8");
    expect(query(".ant-alert-warning").textContent).toContain(text);
    expect(document.body.textContent).not.toContain("Framework-Text");
  });
});

describe("SollEditor — Hinzufuegen, Entfernen und Wiederherstellen", () => {
  it("sendet beim Hinzufuegen den exakten Payload und leert nur nach Erfolg", async () => {
    await mount(<SollEditor fahrzeugId="fz-1" positionen={POSITIONEN} artikel={ARTIKEL} />);
    await fill("input[aria-label='Fach']", " Fach Neu ");
    await waehleOption("Artikel", "Pflaster");
    await fill("input[aria-label='Soll']", "4");
    await clickElement(knopf("Position hinzufügen"));
    await warte();

    expect(mocks.setzen).toHaveBeenCalledWith({
      fahrzeugId: "fz-1",
      fachLabel: "Fach Neu",
      artikelId: "a-neu",
      soll: 4,
    });
    expect(query<HTMLInputElement>("input[aria-label='Fach']").value).toBe(" Fach Neu ");
    expect(query<HTMLInputElement>("input[aria-label='Soll']").value).toBe("1");
    expect(query("[aria-label='Artikel']").getAttribute("value") ?? "").toBe("");
  });

  it.each([
    [
      "ok:false",
      async () => ({ ok: false as const, fehler: "Fahrzeug nicht gefunden." }),
      "Fahrzeug nicht gefunden.",
    ],
    [
      "Reject",
      async () => { throw new Error("Framework-Text"); },
      "Soll-Position konnte nicht gespeichert werden.",
    ],
  ] as const)("behaelt Add-Felder bei %s und zeigt den Fehler", async (
    _fall,
    antwort,
    text,
  ) => {
    mocks.setzen.mockImplementationOnce(antwort);
    await mount(<SollEditor fahrzeugId="fz-1" positionen={POSITIONEN} artikel={ARTIKEL} />);
    await fill("input[aria-label='Fach']", "Fach X");
    await waehleOption("Artikel", "Pflaster");
    await fill("input[aria-label='Soll']", "6");
    await clickElement(knopf("Position hinzufügen"));
    await warte();

    expect(query<HTMLInputElement>("input[aria-label='Fach']").value).toBe("Fach X");
    expect(query<HTMLInputElement>("input[aria-label='Soll']").value).toBe("6");
    expect(query(".ant-select").textContent).toContain("Pflaster");
    expect(query(".ant-alert-warning").textContent).toContain(text);
    expect(document.body.textContent).not.toContain("Framework-Text");
  });

  it("wertet Entfernen und Wiederherstellen mit ihren echten IDs aus", async () => {
    await mount(<SollEditor fahrzeugId="fz-1" positionen={POSITIONEN} artikel={ARTIKEL} />);
    await entfernenBestaetigen();
    await clickElement(query("[data-rolle='wiederherstellen']"));
    await warte();

    expect(mocks.entfernen).toHaveBeenCalledWith({ id: "p-b1" });
    expect(mocks.wiederherstellen).toHaveBeenCalledWith({ id: "p-a2" });
  });

  it.each([
    [
      "Entfernen",
      "entfernen",
      "ok:false",
      async () => ({ ok: false as const, fehler: "Soll-Position nicht gefunden." }),
      "Soll-Position nicht gefunden.",
    ],
    [
      "Entfernen",
      "entfernen",
      "Reject",
      async () => { throw new Error("Framework-Text"); },
      "Soll-Position konnte nicht entfernt werden.",
    ],
    [
      "Wiederherstellen",
      "wiederherstellen",
      "ok:false",
      async () => ({ ok: false as const, fehler: "Soll-Position nicht gefunden." }),
      "Soll-Position nicht gefunden.",
    ],
    [
      "Wiederherstellen",
      "wiederherstellen",
      "Reject",
      async () => { throw new Error("Framework-Text"); },
      "Soll-Position konnte nicht wiederhergestellt werden.",
    ],
    // Bei `ok:false` der Satz aus der Action, im Wurf die Modulkonstante.
  ] as const)("zeigt bei fehlgeschlagenem %s (%s) den passenden Warning-Text", async (
    _name,
    aktion,
    _fall,
    antwort,
    text,
  ) => {
    mocks[aktion].mockImplementationOnce(antwort);
    await mount(<SollEditor fahrzeugId="fz-1" positionen={POSITIONEN} artikel={ARTIKEL} />);
    if (aktion === "entfernen") await entfernenBestaetigen();
    else {
      await clickElement(query("[data-rolle='wiederherstellen']"));
      await warte();
    }
    expect(query(".ant-alert-warning").textContent).toContain(text);
    expect(queryAll("tbody tr[data-row-key]")).toHaveLength(4);
  });
});
