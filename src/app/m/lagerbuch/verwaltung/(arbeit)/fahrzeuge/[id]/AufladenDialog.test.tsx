// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clickElement, mount, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";
import { HANDLAGER_ID } from "../../../../_lib/konstanten";
import { AufladenDialog } from "./AufladenDialog";

/**
 * DER DIALOG „MATERIAL AUFLADEN" — DRK-485.
 *
 * Geprueft wird, was nur die Insel entscheidet: welche Orte unter „Woher"
 * stehen (nie die Einheit selbst), welche Chargen je Herkunft angeboten werden,
 * und welche Nutzlast daraus an die Action geht. Die Buchung selbst pruefen
 * die Tests der Action gegen eine echte Datenbank.
 */

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

const mocks = vi.hoisted(() => ({ getDetail: vi.fn(), aufladen: vi.fn() }));

vi.mock("../../../../_actions/detail", () => ({
  getDetail: (...args: unknown[]) => mocks.getDetail(...args),
}));

vi.mock("../../../../_actions/aufladen", () => ({
  bucheAufladen: (...args: unknown[]) => mocks.aufladen(...args),
}));

const ort = (id: string, name: string, menge: number, typ: "lager" | "fahrzeug" = "lager") => ({
  id, name, menge, zugangshinweis: null, typ, kennung: null,
  einheitenart: typ === "fahrzeug" ? ("fahrzeug" as const) : null,
});

const DETAIL = {
  artikel: {
    id: "a1", name: "Mullbinde", einheit: "Pkg.", fach: "A1",
    mindestbestand: 1, aktiv: true, bestand: 7, kategorie: null,
  },
  chargen: [
    {
      id: "c1", chargenNr: "L-ALT", verfall: "2027-01", rest: 4, restGesamt: 7,
      // Liegt auch auf DIESER Einheit — die darf unter „Woher" nicht stehen.
      orte: [ort("sch-1", "Schrank 1", 4), ort("fz-1", "RTW 1", 3, "fahrzeug")],
      ampel: "gruen" as const, text: "ok",
    },
    {
      id: "c2", chargenNr: "L-NEU", verfall: "2029-06", rest: 3, restGesamt: 5,
      orte: [ort(HANDLAGER_ID, "Handlager", 3), ort("fz-2", "KTW 2", 2, "fahrzeug")],
      ampel: "gruen" as const, text: "ok",
    },
  ],
  historie: [],
  mehrVorhanden: false,
  zielOrte: [],
  handlagerOrtIds: [HANDLAGER_ID, "sch-1"],
};

async function warte(): Promise<void> {
  await act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 0));
  });
}

async function oeffneAuswahl(ariaLabel: string): Promise<HTMLElement> {
  const input = queryPortal<HTMLInputElement>(`[aria-label='${ariaLabel}']`);
  const select = input.closest<HTMLElement>(".ant-select");
  if (!select) throw new Error(`Select nicht gefunden: ${ariaLabel}`);
  await act(async () => {
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  await warte();
  const listen = Array.from(document.body.querySelectorAll<HTMLElement>(".ant-select-dropdown"))
    .filter((l) => !l.classList.contains("ant-select-dropdown-hidden"));
  const liste = listen.at(-1);
  if (!liste) throw new Error(`Keine offene Liste: ${ariaLabel}`);
  return liste;
}

async function optionenVon(ariaLabel: string): Promise<string[]> {
  const liste = await oeffneAuswahl(ariaLabel);
  return Array.from(liste.querySelectorAll<HTMLElement>(".ant-select-item-option"))
    .map((o) => o.textContent ?? "");
}

async function waehle(ariaLabel: string, text: string): Promise<void> {
  const liste = await oeffneAuswahl(ariaLabel);
  const option = Array.from(liste.querySelectorAll<HTMLElement>(".ant-select-item-option"))
    .find((o) => (o.textContent ?? "").includes(text));
  if (!option) throw new Error(`Option nicht gefunden: ${text}`);
  await clickElement(option);
  await warte();
}

async function tippe(ariaLabel: string, wert: string): Promise<void> {
  const feld = queryPortal<HTMLInputElement>(`input[aria-label='${ariaLabel}']`);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(feld), "value")?.set;
  await act(async () => {
    setter!.call(feld, wert);
    feld.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function absenden(): Promise<void> {
  await act(async () => {
    queryPortal<HTMLFormElement>("[data-rolle='aufladen']")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await warte();
  await warte();
}

async function oeffnen(): Promise<void> {
  await mount(
    <AufladenDialog
      fahrzeugId="fz-1"
      einheitenart="fahrzeug"
      artikel={[{ id: "a1", name: "Mullbinde", fach: "A1" }]}
    />,
  );
  const knopf = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button"))
    .find((b) => (b.textContent ?? "").includes("Material aufladen"));
  if (!knopf) throw new Error("Knopf fehlt");
  await clickElement(knopf);
  await warte();
  await waehle("Artikel", "Mullbinde");
  await warte();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "getComputedStyle")
    .mockImplementation((element) => getComputedStyleOhnePseudo(element));
  mocks.getDetail.mockResolvedValue({ ok: true, wert: DETAIL });
  mocks.aufladen.mockResolvedValue({ ok: true, wert: { gebucht: 2, ziel: "RTW 1 · Fahrzeug" } });
});

afterEach(async () => {
  await unmount();
  vi.restoreAllMocks();
});

describe("AufladenDialog", () => {
  it("bietet unter „Woher“ „neu“ und jeden Ort an, an dem der Artikel liegt — nie die Einheit selbst", async () => {
    await oeffnen();

    expect(mocks.getDetail).toHaveBeenCalledWith("a1");
    const optionen = await optionenVon("Woher");
    expect(optionen[0]).toBe("Neu angeliefert (Wareneingang)");
    expect(optionen.some((o) => o.startsWith("Schrank 1 · 4 Pkg."))).toBe(true);
    expect(optionen.some((o) => o.startsWith("Handlager · 3 Pkg."))).toBe(true);
    expect(optionen.some((o) => o.startsWith("KTW 2"))).toBe(true);
    expect(optionen.some((o) => o.startsWith("RTW 1"))).toBe(false);
  });

  it("packt von einem anderen Fahrzeug um: nur die dort liegende Charge, vorbelegt", async () => {
    await oeffnen();
    await waehle("Woher", "KTW 2");

    expect(await optionenVon("Charge")).toEqual(["L-NEU · 06/29 · 2 Pkg."]);
    await tippe("Menge", "2");
    await absenden();

    expect(mocks.aufladen).toHaveBeenCalledWith({
      fahrzeugId: "fz-1", artikelId: "a1", menge: 2,
      herkunft: { art: "ort", vonLagerortId: "fz-2", chargeId: "c2" },
    });
    expect(queryPortal("[data-rolle='aufladen-beleg']").textContent)
      .toBe("Aufgeladen: 2 × Mullbinde → RTW 1 · Fahrzeug");
  });

  it("bucht neu angeliefertes Material auf eine vorhandene Charge", async () => {
    await oeffnen();
    await waehle("Woher", "Neu angeliefert");
    expect(await optionenVon("Charge")).toEqual([
      "+ Neue Charge", "L-ALT · 01/27", "L-NEU · 06/29",
    ]);
    await waehle("Charge", "L-ALT");
    await tippe("Menge", "3");
    await absenden();

    expect(mocks.aufladen).toHaveBeenCalledWith({
      fahrzeugId: "fz-1", artikelId: "a1", menge: 3,
      herkunft: { art: "neu", charge: { art: "vorhanden", chargeId: "c1" } },
    });
  });

  it("zeigt den Satz der Action, wenn sie abweist", async () => {
    mocks.aufladen.mockResolvedValue({ ok: false, fehler: "In „Schrank 1“ liegen von dieser Charge nur 4 Pkg." });
    await oeffnen();
    await waehle("Woher", "Schrank 1");
    await absenden();

    expect(document.body.textContent).toContain("In „Schrank 1“ liegen von dieser Charge nur 4 Pkg.");
  });
});
