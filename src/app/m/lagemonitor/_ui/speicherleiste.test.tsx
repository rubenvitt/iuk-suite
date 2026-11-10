// @vitest-environment jsdom
import { App } from "antd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fillElement, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { vergissFluechtig } from "@/core/entwurf/ablage";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../_actions/verwaltung", () => ({
  meldungAnlegenAction: vi.fn(),
  meldungBeendenAction: vi.fn(),
  standortSetzenAction: vi.fn(),
  anzeigeSpeichernAction: vi.fn(),
}));

import { VORGABE } from "../_lib/konfiguration";
import { AnzeigeVerwaltung } from "./AnzeigeVerwaltung";

/** IDA-390 — Ungespeichertes ist ohne Scrollen sichtbar: klebende Speicherleiste und Entwurfsmarke der Vorschau. */
const props = {
  konfiguration: VORGABE, zugaenge: [], meldungen: [], kategorien: [], links: [], online: null,
  fahrzeuge: { liste: [], auswahl: { stamm: [], zeichen: [], zugaenge: [] } },
  standorte: { je: {}, auswahl: { fahrzeuge: [], zeichen: [] } },
  lagekarte: { liste: [], zeichen: [] },
};

beforeEach(() => { localStorage.clear(); vergissFluechtig(); });
afterEach(async () => { await unmount(); });

const leiste = () => query<HTMLElement>("[data-rolle='speicherleiste']");
const marke = () => document.querySelector("[data-rolle='vorschau-entwurf']");

describe("AnzeigeVerwaltung — Speicherleiste und Vorschau", () => {
  it("ohne Änderung steht die Leiste im Fluss und die Vorschau trägt keine Entwurfsmarke", async () => {
    await mount(<App><AnzeigeVerwaltung {...props} /></App>);
    expect(leiste().hasAttribute("data-klebt")).toBe(false);
    expect(leiste().hasAttribute("data-fussleiste")).toBe(false);
    expect(marke()).toBeNull();
  });

  it("eine Änderung lässt die Leiste kleben und kennzeichnet die Vorschau als Entwurf", async () => {
    await mount(<App><AnzeigeVerwaltung {...props} /></App>);
    await fillElement(query<HTMLInputElement>('input[id$="-regionName"]'), "Landkreis Lüneburg");
    expect(leiste().hasAttribute("data-klebt")).toBe(true);
    expect(leiste().getAttribute("data-fussleiste")).toBe("");
    expect(leiste().textContent).toContain("Ungespeicherte Änderungen");
    expect(marke()?.textContent).toBe("Entwurf – noch nicht am Monitor");
  });

  it("die Zoomstufe öffnet am Telefon die Zifferntastatur mit Komma", async () => {
    await mount(<App><AnzeigeVerwaltung {...props} /></App>);
    expect(query<HTMLInputElement>('input[id$="-kartenZoom"]').getAttribute("inputmode")).toBe("decimal");
  });
});
