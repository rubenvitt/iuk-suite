// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { App } from "antd";
import { clickElement, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import type { DokumentDTO } from "../../_lib/vermietungTypen";
import { zeitpunkt } from "../../_lib/zeit";
import { Dokumentfueller } from "./Dokumentfueller";

const aktion = vi.hoisted(() => ({ werte: vi.fn(), freigeben: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock("../../_actions/vermietung", () => ({
  dokumentWerteAction: aktion.werte, dokumentFreigebenAction: aktion.freigeben, dokumentFreigabeZurueckAction: vi.fn(),
  dokumentLeitungUnterschriftAction: vi.fn(), dokumentVerwerfenAction: vi.fn(), dokumentVorOrtAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: aktion.refresh, push: aktion.push }) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia;
});
afterEach(async () => { await unmount(); Object.values(aktion).forEach((f) => f.mockReset()); });

const feld = { quelle: "gezogen" as const, seite: 0, x: 10, y: 10, b: 100, h: 30 };
const D: DokumentDTO = {
  anfrageId: "a1", art: "uebergabe", version: 3, freigegebenAm: null, werte: { "g:t": "alt" }, unterschriften: [], datei: null, zeichnen: true,
  felder: [{ ...feld, id: "g:t", art: "text", name: "Zählerstand" }, { ...feld, id: "g:k", art: "ankreuz", name: "Schlüssel" }],
  anfrage: { person: "Erika Sommer", anlass: "Geburtstag", von: zeitpunkt("2026-11-07", "18:00"), bis: zeitpunkt("2026-11-07", "23:00") },
};
const knopf = (text: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === text);

describe("Ausfüllseite", () => {
  it("ohne Leitungsfeld: Freigeben speichert vorher geänderte Werte und nimmt deren Version", async () => {
    aktion.werte.mockResolvedValue({ ok: true, wert: 4 });
    aktion.freigeben.mockResolvedValue({ ok: true });
    await mount(<App><Dokumentfueller d={D} /></App>);
    expect(document.body.textContent).toContain("Zählerstand");
    expect(knopf("Speichern")).toBeUndefined();
    const t = query<HTMLTextAreaElement>('textarea[data-feld="g:t"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(t, "12345");
      t.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(knopf("Speichern")).toBeTruthy();
    await clickElement(query('[data-testid="freigeben"]'));
    await act(async () => {});
    expect(aktion.werte).toHaveBeenCalledWith("a1", "uebergabe", { "g:t": "12345" }, 3);
    expect(aktion.freigeben).toHaveBeenCalledWith("a1", "uebergabe", 4);
    expect(aktion.refresh).toHaveBeenCalled();
  });

  it("mit Leitungsfeld ohne Unterschrift: Freigeben gesperrt; freigegeben: Werte gesperrt, vor Ort mit Name vorbelegt", async () => {
    const mitLeitung: DokumentDTO = { ...D, felder: [...D.felder, { ...feld, id: "g:l", art: "unterschrift", name: "Leitung", rolle: "leitung" }] };
    await mount(<App><Dokumentfueller d={mitLeitung} /></App>);
    expect(query<HTMLButtonElement>('[data-testid="freigeben"]').disabled).toBe(true);
    expect(query('[data-testid="zeichnen-leitung"]')).toBeTruthy();
    await unmount();
    await mount(<App><Dokumentfueller d={{ ...mitLeitung, freigegebenAm: zeitpunkt("2026-11-05", "10:00"), unterschriften: [{ feldId: "g:l", rolle: "leitung", name: "Leitung Bar", am: zeitpunkt("2026-11-05", "09:00") }] }} /></App>);
    expect(query<HTMLTextAreaElement>('textarea[data-feld="g:t"]').disabled).toBe(true);
    expect(query('[data-testid="leitung-unterschrieben"]').textContent).toContain("Leitung Bar");
    expect(document.querySelector('[data-testid="zeichnen-leitung"]')).toBeNull();
    expect(query<HTMLInputElement>('[data-testid="mieter-name"]').value).toBe("Erika Sommer");
    expect(query('[data-testid="freigabe-zurueck"]')).toBeTruthy();
  });
});
