// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { clickElement, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
const aktion = vi.hoisted(() => ({ dupliziere: vi.fn(), vorlage: vi.fn(), archiviere: vi.fn(), wiederher: vi.fn() }));
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("../_actions/verwaltung", () => ({ dupliziereAction: aktion.dupliziere, setzeVorlageAction: aktion.vorlage, archiviereAction: aktion.archiviere, stelleWiederHerAction: aktion.wiederher }));
vi.mock("../_actions/plan", () => ({ legePlanAnAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import { PlanTabelle } from "./PlanTabelle";

const abwarten = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
/** Knopf oder Menüeintrag nach sichtbarem Text — auch in Portalen (Popconfirm, Dropdown hängen am body). */
const knopf = (text: string) => [...document.querySelectorAll<HTMLElement>("button, [role='menuitem']")].find((b) => b.textContent?.trim() === text)!;

afterEach(async () => { await unmount(); vi.clearAllMocks(); });

const ZEILEN = [
  { id: "p1", titel: "Einsatz", typ: "Kommunikationsplan", datum: "22.02.2026", stand: "16.02.2026, 10:00", vorlage: false, lesbar: true, archiviert: null },
  { id: "p2", titel: "Label", typ: "Kommunikationsplan", datum: null, stand: "01.09.2026, 10:00", vorlage: true, lesbar: false, archiviert: null },
];

/**
 * Kartentabelle rendert Tabelle UND Karten ins DOM (docs/design/README.md, „Mobil"): Tabellenzeilen
 * tragen `data-row-key`, Karten `data-karte-key`. Deshalb wird je Darstellung geprüft, nicht über alle `a`.
 */
describe("PlanTabelle", () => {
  it("verlinkt jeden Plan auf seine Ansicht unter /p/<id> — in der Tabelle und auf den Karten", async () => {
    await mount(<PlanTabelle zeilen={ZEILEN} liste="plaene" darfBearbeiten={false} />);
    expect(queryAll<HTMLAnchorElement>("tr[data-row-key] a").map((a) => a.getAttribute("href"))).toEqual(["/p/p1", "/p/p2"]);
    expect(queryAll("li[data-karte-key]").map((li) => li.getAttribute("data-karte-key"))).toEqual(["p1", "p2"]);
    expect(queryAll<HTMLAnchorElement>("li[data-karte-key] a").map((a) => a.getAttribute("href"))).toEqual(["/p/p1", "/p/p2"]);
  });
  it("Kennzeichen als eigene Chips (Fläche und Text), nie als antd-Tag; fehlendes Datum als —", async () => {
    await mount(<PlanTabelle zeilen={ZEILEN} liste="plaene" darfBearbeiten={false} />);
    expect(queryAll("tr[data-row-key] .ant-tag, li[data-karte-key] .ant-tag")).toEqual([]);
    const chips = queryAll("tr[data-row-key] .kp-chip").map((c) => c.textContent);
    expect(chips).toEqual(["nicht lesbar"]);
    expect(document.body.textContent).toContain("—");
  });
  it("ohne Pläne steht der Leertext, keine leere Tabelle", async () => {
    await mount(<PlanTabelle zeilen={[]} liste="plaene" darfBearbeiten={false} />);
    expect(document.body.textContent).toContain("Noch keine Pläne.");
  });
  it("ohne Bearbeitungsrecht keine Aktionen; mit: ein Menü je Zeile, Einträge je Liste", async () => {
    await mount(<PlanTabelle zeilen={ZEILEN} liste="plaene" darfBearbeiten={false} />);
    expect(queryAll('button[aria-label^="Aktionen für"]')).toHaveLength(0);
    await unmount();
    await mount(<PlanTabelle zeilen={ZEILEN} liste="plaene" darfBearbeiten />);
    await clickElement(query('tr[data-row-key="p1"] button[aria-label="Aktionen für Einsatz"]'));
    expect([...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent)).toEqual(["Duplizieren", "Als Vorlage speichern", "Archivieren"]);
  });
  it("Duplizieren führt in den Editor der Kopie (mit Hinweis); solange es läuft, löst ein zweiter Klick nichts aus", async () => {
    let fertig!: (r: unknown) => void;
    aktion.dupliziere.mockReturnValue(new Promise((r) => { fertig = r; }));
    await mount(<PlanTabelle zeilen={ZEILEN} liste="plaene" darfBearbeiten />);
    const aktionen = query<HTMLButtonElement>('tr[data-row-key="p1"] button[aria-label="Aktionen für Einsatz"]');
    await clickElement(aktionen);
    await clickElement(knopf("Duplizieren"));
    // zweiter Versuch, solange der erste läuft: über das (evtl. noch im Portal stehende) Menü oder gar nicht
    await clickElement(aktionen);
    const nochmal = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((e) => e.textContent === "Duplizieren");
    if (nochmal) await clickElement(nochmal);
    expect(aktion.dupliziere).toHaveBeenCalledTimes(1);
    await act(async () => { fertig({ ok: true, id: "neu-1" }); });
    await abwarten();
    expect(aktion.dupliziere).toHaveBeenCalledWith("p1");
    expect(router.push).toHaveBeenCalledWith("/p/neu-1?kopie=1");
  });
  it("Archivieren meldet sich mit „Rückgängig“, das wiederherstellt", async () => {
    aktion.archiviere.mockResolvedValue({ ok: true });
    aktion.wiederher.mockResolvedValue({ ok: true });
    await mount(<PlanTabelle zeilen={ZEILEN} liste="plaene" darfBearbeiten />);
    await clickElement(query('tr[data-row-key="p1"] button[aria-label="Aktionen für Einsatz"]'));
    await clickElement(knopf("Archivieren"));
    await abwarten();
    expect(query('.kp-listenhinweis[role="status"]').textContent).toContain("„Einsatz“ archiviert.");
    await clickElement(knopf("Rückgängig"));
    await abwarten();
    expect(aktion.wiederher).toHaveBeenCalledWith("p1");
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });
  it("Archivliste: Spalte „Archiviert“, nur „Wiederherstellen“", async () => {
    await mount(<PlanTabelle zeilen={[{ ...ZEILEN[0], archiviert: "01.10.2026" }]} liste="archiv" darfBearbeiten />);
    expect(query('table[aria-label="Archivierte Pläne"], [aria-label="Archivierte Pläne"]')).toBeTruthy();
    expect(document.body.textContent).toContain("01.10.2026");
    await clickElement(query('tr[data-row-key="p1"] button[aria-label="Aktionen für Einsatz"]'));
    expect([...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent)).toEqual(["Wiederherstellen"]);
  });
});
