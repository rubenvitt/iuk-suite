// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { clickElement, exists, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { Organisation } from "./Organisation";
import { Teilen } from "./Teilen";

const aktion = vi.hoisted(() => ({ teilen: vi.fn(), ein: vi.fn(), weg: vi.fn(), suche: vi.fn() }));
vi.mock("../../_actions/freigabe", () => ({ stelleFreigabeAusAction: vi.fn(), widerrufeFreigabeAction: vi.fn() }));
vi.mock("../../_actions/teilen", () => ({
  teileInOrganisationAction: aktion.teilen, ladeEinAction: aktion.ein, entferneMitgliedAction: aktion.weg, suchePersonenAction: aktion.suche,
}));
const abwarten = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
/** Knopf nach sichtbarem Text — auch im Portal (Popconfirm hängt am body). */
const knopf = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === text)!;
const sichtbarkeit = vi.fn();
const mitglieder = vi.fn();
afterEach(async () => { await unmount(); vi.clearAllMocks(); });

describe("Organisation im Flyin „Teilen“", () => {
  it("privat: Hinweis und „In der Organisation teilen“ mit Rückfrage; erst nach Bestätigen geteilt", async () => {
    aktion.teilen.mockResolvedValue({ ok: true, mitglieder: [] });
    await mount(<Organisation planId="p1" sichtbarkeit="privat" mitglieder={[]} onSichtbarkeit={sichtbarkeit} onMitglieder={mitglieder} />);
    expect(query('[data-sichtbarkeit="privat"]').textContent).toContain("nur du siehst");
    expect(exists('[data-sichtbarkeit="organisation"]')).toBe(false);
    await clickElement(knopf("In der Organisation teilen"));
    expect(aktion.teilen).not.toHaveBeenCalled();
    await clickElement(knopf("Teilen"));
    await abwarten();
    expect(aktion.teilen).toHaveBeenCalledWith("p1");
    expect(sichtbarkeit).toHaveBeenCalledWith("organisation");
  });
  it("geteilt: Eingeladene mit „Entfernen“, Suche erst ab zwei Zeichen", async () => {
    aktion.suche.mockResolvedValue([{ nutzer: "u-carla", name: "Carla", email: null }]);
    aktion.weg.mockResolvedValue({ ok: true, mitglieder: [] });
    await mount(<Organisation planId="p1" sichtbarkeit="organisation" mitglieder={[{ nutzer: "u-bodo", name: "Bodo", eingeladenAm: 1 }]} onSichtbarkeit={sichtbarkeit} onMitglieder={mitglieder} />);
    expect(queryAll("[data-mitglied]").map((e) => e.getAttribute("data-mitglied"))).toEqual(["u-bodo"]);
    const feld = query<HTMLInputElement>('[data-sichtbarkeit="organisation"] input');
    await act(async () => {
      const setze = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setze.call(feld, "c"); feld.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await abwarten(250);
    expect(aktion.suche).not.toHaveBeenCalled();
    await act(async () => {
      const setze = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setze.call(feld, "ca"); feld.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await abwarten(250);
    expect(aktion.suche).toHaveBeenCalledWith("p1", "ca");
    await clickElement(knopf("Entfernen"));
    await clickElement([...document.querySelectorAll<HTMLButtonElement>(".ant-popconfirm button")].find((b) => b.textContent?.trim() === "Entfernen")!);
    await abwarten();
    expect(aktion.weg).toHaveBeenCalledWith({ planId: "p1", nutzer: "u-bodo" });
    expect(mitglieder).toHaveBeenCalledWith([]);
  });
  it("im Flyin „Teilen“ steht genau EIN role=status — die Meldungen des Abschnitts gehen dorthin", async () => {
    aktion.teilen.mockResolvedValue({ ok: true, mitglieder: [] });
    await mount(<Teilen planId="p1" basis="http://kommplan.localtest.me:3000" freigaben={[]} onFreigaben={() => {}}
      organisation={{ sichtbarkeit: "privat", mitglieder: [], onSichtbarkeit: sichtbarkeit, onMitglieder: mitglieder }} />);
    expect(queryAll('[role="status"]')).toHaveLength(1);
    await clickElement(knopf("In der Organisation teilen"));
    await clickElement(knopf("Teilen"));
    await abwarten();
    expect(query('[role="status"]').textContent).toContain("Geteilt.");
  });
});
