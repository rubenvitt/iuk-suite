// @vitest-environment jsdom
import { App } from "antd";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fillElement, mount, query, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";
import { entwurfSchluessel, ladeEntwurf, vergissFluechtig } from "@/core/entwurf/ablage";

const a = vi.hoisted(() => ({ meldung: vi.fn(), standort: vi.fn(), anzeige: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../_actions/verwaltung", () => ({
  meldungAnlegenAction: (...x: unknown[]) => a.meldung(...x),
  meldungBeendenAction: vi.fn(),
  standortSetzenAction: (...x: unknown[]) => a.standort(...x),
  anzeigeSpeichernAction: (...x: unknown[]) => a.anzeige(...x),
}));

import { VORGABE } from "../_lib/konfiguration";
import { AnzeigeVerwaltung } from "./AnzeigeVerwaltung";
import { Meldungen } from "./Meldungen";
import { StandortFormular } from "./StandortFormular";

/** IDA-358: der Schluessel eines Bearbeiten-Entwurfs traegt den Fingerabdruck des Serverstands. */
const entwurfZu = (anfang: string) => {
  const k = entwurfSchluessel().find((x) => x.startsWith(anfang) && !x.endsWith(":wahl"));
  return k ? ladeEntwurf(k) : null;
};

/** IDA-358 — die Verwaltungsformulare des Lagemonitors behalten ihre Eingaben auf dem Gerät. */
beforeEach(() => {
  localStorage.clear();
  vergissFluechtig();
  a.meldung.mockReset(); a.standort.mockReset(); a.anzeige.mockReset();
});
afterEach(async () => { await unmount(); });

const hinweis = () => query("[data-rolle='entwurf-hinweis']").textContent;

describe("Meldungen — neue Meldung (Modus 2)", () => {
  const ansicht = () => mount(<App><Meldungen liste={[]} kategorien={[]} jetzt={Date.UTC(2026, 10, 4, 12)} onEntwurf={() => {}} /></App>);
  const textfeld = () => query<HTMLInputElement>('form[aria-label="Neue Meldung"] input[maxlength]');

  it("ein angefangener Text übersteht das Neuladen; das Anlegen räumt den Entwurf", async () => {
    await ansicht();
    expect(ladeEntwurf("lagemonitor:meldung:neu")).toBeNull();
    await fillElement(textfeld(), "Lagebesprechung im Stab");
    await unmount();

    await ansicht();
    expect(textfeld().value).toBe("Lagebesprechung im Stab");
    expect(hinweis()).toContain("Eingaben wiederhergestellt.");

    a.meldung.mockResolvedValue({ ok: true, wert: { meldung: { anzeigenAb: null }, wartet: false } });
    await submitForm('form[aria-label="Neue Meldung"]');
    await act(async () => {});
    expect(textfeld().value).toBe("");
    expect(ladeEntwurf("lagemonitor:meldung:neu")).toBeNull();
  });
});

describe("StandortFormular (Modus 2)", () => {
  const ansicht = () => mount(<StandortFormular zugangId="z1" bezeichnung="Monitor Stab" standort={undefined} auswahl={{ fahrzeuge: [], zeichen: [] }} onFertig={() => {}} />);
  const name = () => query<HTMLInputElement>("input.ant-input");

  it("stellt den Namen je Zugang wieder her; Erfolg räumt", async () => {
    await ansicht();
    await fillElement(name(), "Unterkunft Uelzen");
    await unmount();
    await ansicht();
    expect(name().value).toBe("Unterkunft Uelzen");
    a.standort.mockResolvedValue({ ok: true });
    await submitForm();
    await act(async () => {});
    expect(entwurfZu("lagemonitor:standort:z1")).toBeNull();
  });
});

describe("AnzeigeVerwaltung — Einstellungen (Modus 2)", () => {
  const props = (konfiguration = VORGABE) => ({
    konfiguration, zugaenge: [], meldungen: [], kategorien: [], links: [], online: null,
    fahrzeuge: { liste: [], auswahl: { stamm: [], zeichen: [], zugaenge: [] } },
    standorte: { je: {}, auswahl: { fahrzeuge: [], zeichen: [] } },
    lagekarte: { liste: [], zeichen: [] },
  });
  const region = () => query<HTMLInputElement>('input[id$="-regionName"]');

  it("eine ungespeicherte Änderung übersteht das Neuladen, aber nicht einen neueren Serverstand", async () => {
    await mount(<App><AnzeigeVerwaltung {...props()} /></App>);
    expect(entwurfZu("lagemonitor:anzeige")).toBeNull();
    await fillElement(region(), "Landkreis Lüneburg");
    expect(JSON.stringify(entwurfZu("lagemonitor:anzeige")?.stand)).not.toContain("tomtomSchluessel");
    await unmount();

    await mount(<App><AnzeigeVerwaltung {...props()} /></App>);
    expect(region().value).toBe("Landkreis Lüneburg");
    await unmount();

    // Inzwischen hat jemand anderes gespeichert: ein Entwurf gegen den aelteren Serverstand kommt
    // nicht wieder hoch und ueberschreibt die neueren Werte nicht.
    await mount(<App><AnzeigeVerwaltung {...props({ ...VORGABE, regionName: "Region Hannover" })} /></App>);
    await act(async () => {});
    expect(region().value).toBe("Region Hannover");
    expect(document.querySelector("[data-rolle='entwurf-hinweis']")).toBeNull();
  });
});
