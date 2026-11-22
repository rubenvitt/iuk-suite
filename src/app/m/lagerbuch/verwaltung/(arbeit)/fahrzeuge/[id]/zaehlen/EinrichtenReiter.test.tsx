// @vitest-environment jsdom

/**
 * DIE REITER „Plomben", „Geräte", „Sauerstoff" (Spec 6.5–6.7, 6.12.3).
 *
 * Zwei Arten von Eingriff, und der Test hält sie auseinander: was ins
 * Ergebnis gehört (Nummer, Zustand, Druck), landet im Zählstand und geht erst
 * mit dem Abschluss — geprüft an `baueNutzlast`. Was Stammdaten sind
 * (Plombe anlegen, Gerät/Flasche verknüpfen oder umsetzen), wirkt sofort über
 * die Action und frischt die Seite auf (`router.refresh`).
 */

import { act, useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clickElement, mount, query, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";
import type { VerwaltungscheckDaten } from "../../../../../_lib/lesepfade/verwaltungscheck";
import { baueNutzlast, leererZustand, type ZaehlZustand } from "../../../../../_lib/verwaltungscheck";

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  plombeAnlegen: vi.fn(),
  geraetUmsetzen: vi.fn(),
  flascheUmsetzen: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }) }));
vi.mock("../../../../../_actions/plomben", () => ({ plombeAnlegen: mocks.plombeAnlegen }));
vi.mock("../../../../../_actions/geraete", () => ({
  geraetUmsetzen: mocks.geraetUmsetzen, geraetZuBarcode: vi.fn(), geraetSpeichern: vi.fn(),
}));
vi.mock("../../../../../_actions/sauerstoff", () => ({
  flascheUmsetzen: mocks.flascheUmsetzen, flascheSpeichern: vi.fn(),
}));
// Die Kamera gibt es in jsdom nicht: der Ersatz meldet auf Knopfdruck einen Treffer.
vi.mock("../../../../../_ui/BarcodeScanner", () => ({
  BarcodeScanner: ({ onTreffer }: { onTreffer?: (id: string) => void }) => (
    <button type="button" data-rolle="scan-ersatz" onClick={() => onTreffer?.("g-scan")}>Scan</button>
  ),
}));

const { PlombenReiter } = await import("./PlombenReiter");
const { GeraeteReiter } = await import("./GeraeteReiter");
const { SauerstoffReiter } = await import("./SauerstoffReiter");

const DATEN: VerwaltungscheckDaten = {
  fahrzeug: { id: "fz-1", name: "RTW 1", kennung: "MS-1", einheitenart: "fahrzeug", aktiv: true },
  positionen: [
    { id: "p1", fachLabel: "1", artikelId: "a1", artikelName: "Mullbinde", einheit: "Stk", soll: 4, sollMax: null },
    { id: "p2", fachLabel: "1", artikelId: "a2", artikelName: "Kompresse", einheit: "Stk", soll: 2, sollMax: null },
    { id: "p3", fachLabel: "2", artikelId: "a3", artikelName: "Pflaster", einheit: "Stk", soll: 1, sollMax: null },
  ],
  buchstand: {},
  verfallFach: {},
  verfallArtikel: {},
  chargenAnEinheit: {},
  plomben: [
    { id: "pl1", bezeichnung: "Medikamente", fachLabel: "1", nummer: "A-1", gesetzt: "A-1 · gesetzt 01.11.2026, 10:00" },
    { id: "pl2", bezeichnung: "Koffer", fachLabel: null, nummer: null, gesetzt: null },
  ],
  geraete: [
    { id: "g1", name: "Defi", typ: "medizin", barcode: null, selbsttest: true },
    { id: "g2", name: "Absaugung", typ: "medizin", barcode: null, selbsttest: false },
  ],
  flaschen: [{ id: "f1", name: "O2 Nr. 7", nennfuelldruckBar: 200, wechselAbProzent: 25 }],
  geraeteWoanders: [{ id: "g9", name: "Pulsoxy", ortLabel: "KTW 2 · Fahrzeug" }],
  flaschenWoanders: [{ id: "f9", name: "O2 Nr. 9", ortLabel: "Lager" }],
  ruecklaufZiele: [],
  entnahmeboxAktiv: false,
  lagerorte: [
    { id: "fz-1", name: "RTW 1", typ: "fahrzeug", kennung: "MS-1", einheitenart: "fahrzeug" },
    { id: "sch-1", name: "Schrank 1", typ: "lager", kennung: null, einheitenart: null },
  ],
  aufladenArtikel: [],
  schwellen: { rotTage: 30, gelbTage: 90 },
};

let stand: ZaehlZustand;

/** Außerhalb der Komponente: die Regel `react-hooks/globals` verbietet das Zuweisen im Rendern. */
function merke(z: ZaehlZustand): void {
  stand = z;
}

type Reiter = typeof PlombenReiter;

function Huelle({ Reiter, start }: { Reiter: Reiter; start?: ZaehlZustand }) {
  const [zustand, setZustand] = useState(start ?? leererZustand());
  useEffect(() => { merke(zustand); }, [zustand]);
  return <Reiter daten={DATEN} zustand={zustand} aendere={setZustand} gesperrt={false} />;
}

async function warte(): Promise<void> {
  await act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 0));
  });
}

async function klicke(el: Element | null | undefined): Promise<void> {
  if (!(el instanceof HTMLElement)) throw new Error("Nichts zum Klicken");
  await clickElement(el);
  for (let i = 0; i < 3; i += 1) await warte();
}

function knopf(text: string, wurzel: ParentNode = document.body): HTMLButtonElement {
  const k = Array.from(wurzel.querySelectorAll<HTMLButtonElement>("button"))
    .find((b) => (b.textContent ?? "").trim() === text);
  if (!k) throw new Error(`Knopf fehlt: ${text}`);
  return k;
}

function dialog(): HTMLElement {
  const offen = Array.from(document.body.querySelectorAll<HTMLElement>(".ant-modal-wrap"))
    .filter((m) => m.style.display !== "none");
  const d = offen.at(-1);
  if (!d) throw new Error("Kein Dialog offen");
  return d;
}

async function tippe(feld: HTMLInputElement, wert: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(feld), "value")?.set;
  await act(async () => {
    setter!.call(feld, wert);
    feld.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await warte();
}

async function waehle(ariaLabel: string, text: string): Promise<void> {
  const input = queryPortal<HTMLInputElement>(`[aria-label='${ariaLabel}']`);
  await act(async () => {
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  await warte();
  const liste = Array.from(document.body.querySelectorAll<HTMLElement>(".ant-select-dropdown"))
    .filter((l) => !l.classList.contains("ant-select-dropdown-hidden")).at(-1);
  const option = Array.from(liste?.querySelectorAll<HTMLElement>(".ant-select-item-option") ?? [])
    .find((o) => (o.textContent ?? "").includes(text));
  await klicke(option);
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.plombeAnlegen.mockResolvedValue({ ok: true, wert: { id: "pl-neu" } });
  mocks.geraetUmsetzen.mockResolvedValue({ ok: true, wert: { id: "g9" } });
  mocks.flascheUmsetzen.mockResolvedValue({ ok: true, wert: { id: "f9" } });
  vi.spyOn(window, "getComputedStyle")
    .mockImplementation((element) => getComputedStyleOhnePseudo(element));
});

afterEach(async () => {
  await unmount();
  vi.restoreAllMocks();
});

describe("PlombenReiter", () => {
  const nummer = (bezeichnung: string) => query<HTMLInputElement>(`input[aria-label="Neue Nummer ${bezeichnung}"]`);

  it("sperrt die neue Nummer, solange das Fach der Plombe nicht ganz gezählt ist", async () => {
    await mount(<Huelle Reiter={PlombenReiter} start={{ ...leererZustand(), ist: { p1: 4 } }} />);
    expect(nummer("Medikamente").disabled).toBe(true);
    expect(query('[data-plombe="pl1"]').textContent).toContain("Erst Fach 1 ganz zählen.");
    expect(query('[data-plombe="pl1"]').textContent).toContain("A-1 · gesetzt 01.11.2026, 10:00");
    // Ohne Fach deckt die Plombe nichts ab und ist frei (Spec 6.12.3).
    expect(nummer("Koffer").disabled).toBe(false);
  });

  it("nimmt die Nummer auf ganz gezähltem Fach in den Zählstand", async () => {
    await mount(<Huelle Reiter={PlombenReiter} start={{ ...leererZustand(), ist: { p1: 4, p2: 2 } }} />);
    expect(nummer("Medikamente").disabled).toBe(false);
    await tippe(nummer("Medikamente"), "B-7");
    expect(baueNutzlast(DATEN, stand, "s").plomben).toEqual([{ plombeId: "pl1", nummer: "B-7" }]);
  });

  it("„Plombe anlegen“ legt sofort an und frischt die Seite auf", async () => {
    await mount(<Huelle Reiter={PlombenReiter} />);
    await klicke(knopf("Plombe anlegen"));
    await tippe(queryPortal<HTMLInputElement>("input[aria-label='Bezeichnung']"), "Notfallrucksack");
    await waehle("Fach", "Fach 2");
    await klicke(knopf("Anlegen", dialog()));

    expect(mocks.plombeAnlegen).toHaveBeenCalledWith({
      lagerortId: "fz-1", bezeichnung: "Notfallrucksack", fachLabel: "2",
    });
    expect(mocks.refresh).toHaveBeenCalled();
  });
});

describe("GeraeteReiter", () => {
  const geraet = (id: string) => query(`[data-rolle="geraet"][data-geraet="${id}"]`);
  const wahl = (id: string, wert: string) => geraet(id).querySelector(`button[data-wert="${wert}"]`);

  it("„Fehlt“ landet in der Nutzlast als vorhanden: false — ohne Selbsttest", async () => {
    await mount(<Huelle Reiter={GeraeteReiter} />);
    await klicke(wahl("g1", "fehlt"));
    expect(geraet("g1").querySelector('[data-rolle="selbsttest"]')).toBeNull();
    expect(baueNutzlast(DATEN, stand, "s").geraete).toEqual([{ geraetId: "g1", vorhanden: false }]);
  });

  it("Zustand, Selbsttest und Bemerkung gehen zusammen in die Nutzlast", async () => {
    await mount(<Huelle Reiter={GeraeteReiter} />);
    await klicke(wahl("g1", "Defekt"));
    // Ohne Selbsttest-Antwort ist ein Gerät mit dieser Frage noch nicht beantwortet.
    expect(baueNutzlast(DATEN, stand, "s").geraete).toEqual([]);
    await klicke(geraet("g1").querySelector('[data-rolle="selbsttest"] button[data-wert="nein"]'));
    await tippe(geraet("g1").querySelector<HTMLInputElement>('input[aria-label="Bemerkung Defi"]')!, "Akku schwach");
    expect(baueNutzlast(DATEN, stand, "s").geraete).toEqual([{
      geraetId: "g1", vorhanden: true, zustand: "Defekt", bemerkung: "Akku schwach", selbsttest: false,
    }]);
  });

  it("„Gerät verknüpfen“ per Scan setzt das Gerät auf diese Einheit und frischt auf", async () => {
    await mount(<Huelle Reiter={GeraeteReiter} />);
    await klicke(knopf("Gerät verknüpfen"));
    await klicke(queryPortal('[data-rolle="scan-ersatz"]'));
    expect(mocks.geraetUmsetzen).toHaveBeenCalledWith({ geraetId: "g-scan", lagerortId: "fz-1" });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("„Gerät verknüpfen“ aus der Auswahl der Geräte an anderen Orten", async () => {
    await mount(<Huelle Reiter={GeraeteReiter} />);
    await klicke(knopf("Gerät verknüpfen"));
    await waehle("Gerät an anderem Ort", "Pulsoxy");
    await klicke(knopf("Verknüpfen", dialog()));
    expect(mocks.geraetUmsetzen).toHaveBeenCalledWith({ geraetId: "g9", lagerortId: "fz-1" });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("„An anderen Ort“ setzt das Gerät um und meldet eine Absage", async () => {
    mocks.geraetUmsetzen.mockResolvedValue({ ok: false, fehler: "Standort nicht gefunden." });
    await mount(<Huelle Reiter={GeraeteReiter} />);
    await klicke(geraet("g2").querySelector('button[data-rolle="umsetzen"]'));
    await waehle("Neuer Standort", "Schrank 1");
    await klicke(knopf("Umsetzen", dialog()));
    expect(mocks.geraetUmsetzen).toHaveBeenCalledWith({ geraetId: "g2", lagerortId: "sch-1" });
    expect(dialog().textContent).toContain("Standort nicht gefunden.");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("SauerstoffReiter", () => {
  it("nimmt den Druck in den Zählstand und zeigt den Füllstand", async () => {
    await mount(<Huelle Reiter={SauerstoffReiter} />);
    await tippe(query<HTMLInputElement>('input[aria-label="Druck O2 Nr. 7"]'), "40");
    expect(baueNutzlast(DATEN, stand, "s").flaschen).toEqual([{ flascheId: "f1", druckBar: 40 }]);
    const zeile = query('[data-flasche="f1"]').textContent ?? "";
    expect(zeile).toContain("20 %");
    expect(zeile).toContain("wechseln");
  });

  it("„Flasche verknüpfen“ setzt die gewählte Flasche auf diese Einheit und frischt auf", async () => {
    await mount(<Huelle Reiter={SauerstoffReiter} />);
    await klicke(knopf("Flasche verknüpfen"));
    await waehle("Flasche an anderem Ort", "O2 Nr. 9");
    await klicke(knopf("Verknüpfen", dialog()));
    expect(mocks.flascheUmsetzen).toHaveBeenCalledWith({ flascheId: "f9", lagerortId: "fz-1" });
    expect(mocks.refresh).toHaveBeenCalled();
  });
});
