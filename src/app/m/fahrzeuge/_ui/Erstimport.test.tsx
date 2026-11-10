// @vitest-environment jsdom
import { act } from "react";
import { App } from "antd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clickElement, mount, queryAll, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";
import type { Erstimportplan, Vorschlag } from "../_lib/erstimport/plan";

const anwenden = vi.hoisted(() => vi.fn());
vi.mock("../_actions/verwaltung", () => ({ erstimportAction: (...a: unknown[]) => anwenden(...a) }));

import { Erstimport } from "./Erstimport";

/** IDA-384 — der Knopf nennt, was er tut, steht oben und unten und fragt vor dem Anlegen nach. */
const neu = (s: string): Vorschlag => ({
  schluessel: s,
  kandidaten: [{ quelle: "einsatzbuch", quellId: s, anzeige: s, typ: "RTW", funkrufname: s, funkkenner: null, kennzeichen: null, standort: "Uelzen", aktiv: true, hinweis: null }],
  ziel: { art: "neu", fahrzeug: { art: "fahrzeug", typ: "RTW", funkrufname: s, funkkenner: "", kennzeichen: "", standort: "Uelzen", bemerkung: "", aktiv: true } },
});
const plan: Erstimportplan = {
  vorschlaege: [neu("Rotkreuz 1"), neu("Rotkreuz 2"), { ...neu("Rotkreuz 3"), ziel: { art: "bestand", stammId: "s1", anzeige: "Rotkreuz 3" } }],
  schonZugeordnet: { einsatzbuch: 0, lagerbuch: 0, funkgeraete: 0 },
};

beforeEach(() => anwenden.mockReset());
afterEach(async () => { await unmount(); });

const knoepfe = (text: string) => queryAll<HTMLButtonElement>("button").filter((b) => b.textContent?.startsWith(text));

describe("Erstimport", () => {
  it("nennt die Zahl oben und unten, fragt nach und legt erst nach Bestätigung an", async () => {
    anwenden.mockResolvedValue({ ok: true, wert: { neu: 2, zugeordnet: 3, keinFahrzeug: 0 } });
    await mount(<App><Erstimport plan={plan} bestand={[]} fehler={[]} /></App>);

    const uebernehmen = knoepfe("Übernehmen");
    expect(uebernehmen).toHaveLength(2);
    expect(uebernehmen.map((b) => b.textContent)).toEqual(["Übernehmen: 2 anlegen, 1 zuordnen", "Übernehmen: 2 anlegen, 1 zuordnen"]);

    await clickElement(uebernehmen[1]!);
    expect(queryPortal(".ant-modal-confirm-title").textContent).toBe("2 Fahrzeuge neu anlegen?");
    expect(anwenden).not.toHaveBeenCalled();

    await clickElement(queryPortal<HTMLButtonElement>(".ant-modal-confirm-btns .ant-btn-primary"));
    await act(async () => {});
    expect(anwenden).toHaveBeenCalledWith({ uebernehmen: ["Rotkreuz 1", "Rotkreuz 2", "Rotkreuz 3"], offen: {} });
  });

  it("„Alle neuen abwählen“ lässt nur die Zuordnung übrig", async () => {
    await mount(<App><Erstimport plan={plan} bestand={[]} fehler={[]} /></App>);
    await clickElement(knoepfe("Alle neuen abwählen")[0]!);
    expect(knoepfe("Übernehmen")[0]!.textContent).toBe("Übernehmen: 1 zuordnen");
    expect(knoepfe("Alle neuen auswählen")).toHaveLength(2);
  });
});
