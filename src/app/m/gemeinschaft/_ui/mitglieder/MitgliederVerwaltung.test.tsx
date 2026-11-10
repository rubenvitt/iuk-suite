// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { App } from "antd";
import { clickElement, fillElement, mount, unmount } from "@/app/m/qr/_lib/test-dom";
import type { MitgliedZeile } from "../../_lib/mitgliederAnzeige";

const aktion = vi.hoisted(() => ({ anlegen: vi.fn(), speichern: vi.fn(), neuerLink: vi.fn(), entfernen: vi.fn() }));
vi.mock("../../_actions/mitglieder", () => ({
  mitgliedAnlegenAction: aktion.anlegen, mitgliedSpeichernAction: aktion.speichern,
  mitgliedNeuerLinkAction: aktion.neuerLink, mitgliedEntfernenAction: aktion.entfernen,
}));
import { MitgliederVerwaltung } from "./MitgliederVerwaltung";

const ZEILEN: MitgliedZeile[] = [
  { id: "m1", name: "Jonas Albers", telefon: "0151 1000002", link: "AbCdEfGhIjKlMnOpQrStUv", verantwortlich: [{ id: "v1", titel: "Weihnachtsmarkt-Stand" }], offeneAufgaben: 3 },
  { id: "m2", name: "Lea Kaminski", telefon: "", link: "ZyXwVuTsRqPoNmLkJiHgFe", verantwortlich: [], offeneAufgaben: 0 },
];
const BASIS = "https://gemeinschaft.example";

const abwarten = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const knoepfe = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].filter((b) => b.textContent?.trim() === text);
const menue = async (name: string) => {
  await clickElement(document.querySelector<HTMLButtonElement>(`button[aria-label="Aktionen für ${name}"]`)!);
};
const eintrag = (text: string) => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((e) => e.textContent?.trim() === text)!;
const ansicht = () => mount(<App><MitgliederVerwaltung zeilen={ZEILEN} basis={BASIS} /></App>);

beforeEach(() => { for (const f of Object.values(aktion)) f.mockReset().mockResolvedValue({ ok: true }); });
afterEach(async () => { await unmount(); vi.unstubAllGlobals(); });

describe("MitgliederVerwaltung", () => {
  it("zeigt Name mit Kennzeichen und Telefon, Verantwortung als Link, offene Aufgaben und gekürzten Link", async () => {
    await ansicht();
    const tabelle = document.querySelector("table")!;
    const text = tabelle.textContent ?? "";
    expect(text).toContain("Jonas Albersverantwortlich");
    expect(text).toContain("0151 1000002");
    expect(tabelle.querySelector<HTMLAnchorElement>('a[href="tel:01511000002"]')?.textContent).toBe("0151 1000002");
    expect(tabelle.querySelector<HTMLAnchorElement>('a[href="/v/v1"]')?.textContent).toBe("Weihnachtsmarkt-Stand");
    expect(text).toContain("…/mein/AbCdEf…");
    expect(text).not.toContain("AbCdEfGhIjKlMnOpQrStUv");
    expect(tabelle.querySelector<HTMLAnchorElement>('a[href="https://gemeinschaft.example/mein/AbCdEfGhIjKlMnOpQrStUv"]')).not.toBeNull();
  });

  it("„Link kopieren“ kopiert die volle Adresse über den Modul-Host", async () => {
    const schreibe = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: schreibe } });
    await ansicht();
    await clickElement(document.querySelector<HTMLButtonElement>('button[aria-label="Link kopieren"]')!);
    await abwarten();
    expect(schreibe).toHaveBeenCalledWith("https://gemeinschaft.example/mein/AbCdEfGhIjKlMnOpQrStUv");
    expect(document.body.textContent).toContain("Link kopiert. Schick ihn nur an Jonas.");
  });

  it("„Neuer Link“ und „Entfernen“ liegen im Zeilenmenü, fragen nach und rufen erst dann die Action", async () => {
    await ansicht();
    await menue("Jonas Albers");
    await clickElement(eintrag("Neuer Link"));
    expect(aktion.neuerLink).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Der bisherige Link geht dann sofort nicht mehr.");
    await clickElement(knoepfe("Neu erzeugen")[0]);
    await abwarten();
    expect(aktion.neuerLink).toHaveBeenCalledWith("m1");

    await menue("Jonas Albers");
    await clickElement(eintrag("Entfernen"));
    expect(document.body.textContent).toContain("Jonas Albers entfernen?");
    expect(aktion.entfernen).not.toHaveBeenCalled();
    const ok = [...document.querySelectorAll<HTMLButtonElement>(".ant-modal button")].find((b) => b.textContent?.trim() === "Entfernen")!;
    await clickElement(ok);
    await abwarten();
    expect(aktion.entfernen).toHaveBeenCalledWith("m1");
  });

  it("„Mitglied anlegen“ schickt Name und Telefon; Feldfehler stehen am Feld", async () => {
    aktion.anlegen.mockResolvedValueOnce({ ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: { telefon: "Nur Ziffern, Leerzeichen und + ( ) / -." } });
    await ansicht();
    await clickElement(knoepfe("Mitglied anlegen")[0]);
    const felder = [...document.querySelectorAll<HTMLInputElement>(".ant-modal input")];
    await fillElement(felder[0], "Paul Engel");
    await fillElement(felder[1], "abc");
    await clickElement(knoepfe("Anlegen")[0]);
    await abwarten();
    expect(aktion.anlegen).toHaveBeenCalledWith({ name: "Paul Engel", telefon: "abc" });
    expect(document.querySelector(".ant-modal")?.textContent).toContain("Nur Ziffern, Leerzeichen und + ( ) / -.");
  });
});
