// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clickElement, mount, queryAll, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";
import { vergissFluechtig } from "@/core/entwurf/ablage";
import { NeuArtikel } from "./artikel/NeuArtikel";
import { NeuBzGeraet } from "./bz/NeuBzGeraet";
import { NeuFahrzeug } from "./fahrzeuge/NeuFahrzeug";
import { NeuGeraet } from "./geraete/NeuGeraet";
import { NeuSchrank } from "./lagerorte/NeuSchrank";
import { NeuFlasche } from "./sauerstoff/NeuFlasche";

/*
 * IDA-358 — die Anlegen-Dialoge der Verwaltung halten ihre Eingaben über ein
 * Neuladen (Modus 2: gesendet wird wie bisher, nur der Entwurf liegt auf dem
 * Gerät). Weil der Dialog nach dem Neuladen geschlossen wäre, öffnet ein
 * liegender Entwurf ihn selbst — sonst sähe niemand, dass etwas zurückkam.
 */

const ok = vi.fn(async () => ({ ok: true, wert: { id: "neu" } }));
vi.mock("../../_actions/lagerorte", () => ({ createSchrank: () => ok() }));
vi.mock("../../_actions/geraete", () => ({ geraetSpeichern: () => ok() }));
vi.mock("../../_actions/bz", () => ({ geraetSpeichern: () => ok() }));
vi.mock("../../_actions/artikel", () => ({ createArtikel: () => ok() }));
vi.mock("../../_actions/sauerstoff", () => ({ flascheSpeichern: () => ok() }));
vi.mock("../../_actions/fahrzeuge", () => ({ createFahrzeug: () => ok() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

beforeEach(() => {
  localStorage.clear();
  vergissFluechtig();
  vi.spyOn(window, "getComputedStyle")
    .mockImplementation((element) => getComputedStyleOhnePseudo(element));
});

afterEach(async () => {
  await unmount();
  vi.restoreAllMocks();
});

async function warteAuf(pruefen: () => boolean, was: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    if (pruefen()) return;
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }
  throw new Error(`Nicht rechtzeitig sichtbar: ${was}`);
}

async function tippe(selektor: string, wert: string): Promise<void> {
  const feld = queryPortal<HTMLInputElement>(selektor);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(feld), "value")!.set!;
  await act(async () => {
    setter.call(feld, wert);
    feld.dispatchEvent(new Event("input", { bubbles: true }));
    feld.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const FAELLE: { name: string; knopf: string; feld: string; element: () => ReactElement }[] = [
  { name: "NeuSchrank", knopf: "Neuer Schrank", feld: "[aria-label='Name']", element: () => <NeuSchrank /> },
  { name: "NeuGeraet", knopf: "Neues Gerät", feld: "input[placeholder='z. B. Corpuls C3']", element: () => <NeuGeraet lagerorte={[]} /> },
  { name: "NeuBzGeraet", knopf: "Neues BZ-Gerät", feld: "[aria-label='Name des BZ-Geräts']", element: () => <NeuBzGeraet lagerorte={[]} /> },
  { name: "NeuArtikel", knopf: "Neuer Artikel", feld: "[aria-label='Name']", element: () => <NeuArtikel /> },
  { name: "NeuFlasche", knopf: "Neue Sauerstoffflasche", feld: "[aria-label='Name der Sauerstoffflasche']", element: () => <NeuFlasche lagerorte={[]} /> },
  { name: "NeuFahrzeug", knopf: "Neue", feld: "[aria-label='Name']", element: () => <NeuFahrzeug /> },
];

describe("Anlegen-Dialoge — IDA-358", () => {
  it.each(FAELLE)("$name: nach dem Neuladen steht der Dialog mit der Eingabe wieder offen", async (fall) => {
    await mount(fall.element());
    const knopf = queryAll<HTMLElement>("button").find((b) => (b.textContent ?? "").includes(fall.knopf));
    await clickElement(knopf!);
    await warteAuf(() => document.body.querySelector(fall.feld) !== null, "Feld im Dialog");
    await tippe(fall.feld, "Entwurf 1");
    await unmount();

    await mount(fall.element());
    await warteAuf(() => document.body.querySelector(fall.feld) !== null, "Dialog nach dem Neuladen");
    expect(queryPortal<HTMLInputElement>(fall.feld).value).toBe("Entwurf 1");
    expect(queryPortal("[data-rolle='entwurf-hinweis']").dataset.art).toBe("wiederhergestellt");
  });
});
