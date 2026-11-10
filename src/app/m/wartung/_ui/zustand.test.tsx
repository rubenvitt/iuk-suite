// @vitest-environment jsdom
import { App } from "antd";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clickElement, mount, unmount } from "@/app/m/qr/_lib/test-dom";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/geraete",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../_actions/verwaltung", () => ({ geraetAnlegenAction: vi.fn() }));

import { ZUSTAND_TEXT, type FristStand, type Stufe, type Zustand } from "../_lib/fristen";
import type { GeraetZeile, MangelDTO } from "../_lib/typen";
import { GeraeteListe } from "./GeraeteListe";
import { MangelEintrag } from "./MangelEintrag";
import { ZUSTAND_FARBE } from "./teile";

afterEach(async () => {
  await unmount();
  window.history.replaceState(null, "", "/");
});

function geraet(id: string, name: string, stufe: Stufe | null, zustand: Zustand): GeraetZeile {
  const naechste = stufe
    ? ({ vorlage: { id: "v", name: "Wartung", wer: "intern", monate: 12, stunden: null, anlass: null }, letzte: null, faelligAm: null, faelligBeiStunden: null, reststunden: null, stufe, text: "" } satisfies FristStand)
    : null;
  return {
    id, name, hersteller: "", typ: "", seriennr: "", gruppeId: "g1", gruppeName: "IuK", artId: "a1", artEinzahl: "Stromerzeuger",
    ikone: "", stundenPflicht: false, kiste: false, ortArt: "lager", ort: "Lager", fahrzeugId: null, stunden: null, hinweise: "",
    pruefanleitung: "", aktiv: true, zustand, plan: [], staende: naechste ? [naechste] : [], naechste, offeneMaengel: 0, fehlend: 0,
  } as unknown as GeraetZeile;
}

const ZEILEN = [
  geraet("a", "Aggregat", "ueberfaellig", "ok"),
  geraet("b", "Beleuchtung", "bald", "mangel"),
  geraet("c", "Pumpe", null, "defekt"),
];

const liste = (filter: { frist: "ueberfaellig" | "bald" | null; zustand: Zustand | null }) => mount(
  <App>
    <GeraeteListe
      zeilen={ZEILEN} arten={[{ id: "a1", name: "Stromerzeuger", einzahl: "Stromerzeuger" }]} gruppen={[]}
      orte={{ lager: [], fahrzeug: [] }} fahrzeuge={[]} verwalter gruppenWahl={[]} gewaehlt={null} filter={filter}
    />
  </App>,
);

const namen = () => [...new Set(Array.from(document.querySelectorAll("[data-row-key]")).map((z) => z.getAttribute("data-row-key")))];
const chip = (gruppe: string, wert: string) => document.querySelector<HTMLElement>(`[role="radiogroup"][aria-label="${gruppe}"] [data-wert="${wert}"]`)!;

describe("Geräteliste mit Filter aus der Adresse (IDA-381)", () => {
  it("`?frist=ueberfaellig` zeigt genau die Geräte mit überfälliger Frist", async () => {
    await liste({ frist: "ueberfaellig", zustand: null });
    expect(namen()).toEqual(["a"]);
    expect(chip("Frist", "ueberfaellig").getAttribute("aria-checked")).toBe("true");
  });

  it("`?zustand=defekt` zeigt genau die nicht einsatzbereiten", async () => {
    await liste({ frist: null, zustand: "defekt" });
    expect(namen()).toEqual(["c"]);
  });

  it("ein Klick auf „Alle“ hebt den Filter auf und nimmt ihn aus der Adresse, `gruppe` bleibt", async () => {
    window.history.replaceState(null, "", "/geraete?gruppe=g1&frist=bald");
    await liste({ frist: "bald", zustand: null });
    expect(namen()).toEqual(["b"]);
    await clickElement(chip("Frist", "alle"));
    expect(namen().sort()).toEqual(["a", "b", "c"]);
    expect(window.location.search).toBe("?gruppe=g1");
    await clickElement(chip("Zustand", "mangel"));
    expect(namen()).toEqual(["b"]);
    expect(window.location.search).toBe("?gruppe=g1&zustand=mangel");
  });

  it("der Zustand heißt in der Liste wie überall", async () => {
    await liste({ frist: null, zustand: null });
    const text = document.body.textContent ?? "";
    for (const z of ["ok", "mangel", "defekt"] as const) expect(text).toContain(ZUSTAND_TEXT[z]);
    expect(text).not.toContain("Mit Mangel");
  });
});

describe("Etikett am Mangel (IDA-381)", () => {
  const mangel = (einsatzbereit: boolean): MangelDTO => ({
    id: "m", geraetId: "a", geraetName: "Aggregat", ort: "Lager", gruppeName: "IuK", text: "Riss", foto: false,
    einsatzbereit, gemeldetAm: Date.UTC(2026, 10, 1), gemeldetVon: "Helfer A", behobenAm: null, behobenVon: null,
  });

  it("trägt Wort und Farbe des Zustands, den er dem Gerät gibt", async () => {
    await mount(<App><MangelEintrag m={mangel(true)} /></App>);
    expect(document.body.textContent).toContain(ZUSTAND_TEXT.mangel);
    expect(document.querySelector("[data-statuschip]")?.textContent).toBe("Einsatzbereit mit Mangel");
    expect(document.querySelector("[data-statuschip]")?.getAttribute("data-statuschip")).toBe("warnung");
    await unmount();
    await mount(<App><MangelEintrag m={mangel(false)} /></App>);
    expect(document.body.textContent).toContain(ZUSTAND_TEXT.defekt);
  });

  it("die Farben: einsatzbereit grün, mit Mangel gelb, nicht einsatzbereit rot", () => {
    expect(ZUSTAND_FARBE).toEqual({ ok: "ok", mangel: "gelb", defekt: "rot" });
  });
});
