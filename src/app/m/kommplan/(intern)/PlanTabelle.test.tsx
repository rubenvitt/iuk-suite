// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { clickElement, exists, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
const aktion = vi.hoisted(() => ({ dupliziere: vi.fn(), vorlage: vi.fn(), archiviere: vi.fn(), wiederher: vi.fn() }));
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("../_actions/verwaltung", () => ({ dupliziereAction: aktion.dupliziere, speichereAlsVorlageAction: aktion.vorlage, archiviereAction: aktion.archiviere, stelleWiederHerAction: aktion.wiederher }));
vi.mock("../_actions/plan", () => ({ legePlanAnAction: vi.fn() }));
vi.mock("../_actions/austausch", () => ({ exportierePlanAction: vi.fn(), importierePlanAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import { PlanTabelle } from "./PlanTabelle";

const abwarten = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
/** Knopf oder Menüeintrag nach sichtbarem Text — auch in Portalen (Popconfirm, Dropdown hängen am body). */
const knopf = (text: string) => [...document.querySelectorAll<HTMLElement>("button, [role='menuitem']")].find((b) => b.textContent?.trim() === text)!;

afterEach(async () => { await unmount(); vi.clearAllMocks(); });

const ZEILEN = [
  { id: "p1", titel: "Einsatz", typ: "Kommunikationsplan", datum: "22.02.2026", stand: "16.02.2026, 10:00", vorlage: false, lesbar: true, archiviert: null, privat: false, darf: { bearbeiten: true, verwalten: true } },
  { id: "p2", titel: "Label", typ: "Kommunikationsplan", datum: null, stand: "01.09.2026, 10:00", vorlage: true, lesbar: false, archiviert: null, privat: false, darf: { bearbeiten: true, verwalten: true } },
];

/**
 * Kartentabelle rendert Tabelle UND Karten ins DOM (docs/design/README.md, „Mobil"): Tabellenzeilen
 * tragen `data-row-key`, Karten `data-karte-key`. Deshalb wird je Darstellung geprüft, nicht über alle `a`.
 */
describe("PlanTabelle", () => {
  it("verlinkt jeden Plan auf seine Ansicht unter /p/<id> — in der Tabelle und auf den Karten", async () => {
    await mount(<PlanTabelle zeilen={ZEILEN} liste="plaene" />);
    expect(queryAll<HTMLAnchorElement>("tr[data-row-key] a").map((a) => a.getAttribute("href"))).toEqual(["/p/p1", "/p/p2"]);
    expect(queryAll("li[data-karte-key]").map((li) => li.getAttribute("data-karte-key"))).toEqual(["p1", "p2"]);
    expect(queryAll<HTMLAnchorElement>("li[data-karte-key] a").map((a) => a.getAttribute("href"))).toEqual(["/p/p1", "/p/p2"]);
  });
  it("Kennzeichen als eigene Chips (Fläche und Text), nie als antd-Tag; fehlendes Datum als —", async () => {
    await mount(<PlanTabelle zeilen={ZEILEN} liste="plaene" />);
    expect(queryAll("tr[data-row-key] .ant-tag, li[data-karte-key] .ant-tag")).toEqual([]);
    const chips = queryAll("tr[data-row-key] .kp-chip").map((c) => c.textContent);
    expect(chips).toEqual(["nicht lesbar"]);
    expect(document.body.textContent).toContain("—");
  });
  it("ohne ein Kennzeichen in der Liste keine Spalte „Kennzeichen“ (Abnahme: sie stand im Normalbetrieb immer leer)", async () => {
    await mount(<PlanTabelle zeilen={ZEILEN.map((z) => ({ ...z, lesbar: true }))} liste="plaene" />);
    expect(queryAll("th").map((th) => th.textContent)).not.toContain("Kennzeichen");
    await unmount();
    await mount(<PlanTabelle zeilen={ZEILEN} liste="plaene" />);
    expect(queryAll("th").map((th) => th.textContent).join("|")).toContain("Kennzeichen");
  });
  it("ohne Pläne steht der Leertext, keine leere Tabelle", async () => {
    await mount(<PlanTabelle zeilen={[]} liste="plaene" />);
    expect(document.body.textContent).toContain("Noch keine Pläne.");
  });
  it("ein Menü je Zeile, Einträge je Liste; Archivieren nur, wer den Plan verwaltet (_lib/rechte.ts)", async () => {
    await mount(<PlanTabelle zeilen={ZEILEN.map((z) => ({ ...z, darf: { bearbeiten: false, verwalten: false } }))} liste="plaene" />);
    await clickElement(query('tr[data-row-key="p1"] button[aria-label="Aktionen für Einsatz"]'));
    expect([...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent)).toEqual(["Duplizieren", "Als Vorlage speichern", "Exportieren"]);
    await unmount();
    await mount(<PlanTabelle zeilen={ZEILEN} liste="plaene" />);
    await clickElement(query('tr[data-row-key="p1"] button[aria-label="Aktionen für Einsatz"]'));
    expect([...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent)).toEqual(["Duplizieren", "Als Vorlage speichern", "Exportieren", "Archivieren"]);
  });
  it("ein privater Plan trägt das Kennzeichen „Privat“", async () => {
    await mount(<PlanTabelle zeilen={[{ ...ZEILEN[0], privat: true }]} liste="plaene" />);
    expect(queryAll("tr[data-row-key] .kp-chip").map((c) => c.textContent)).toEqual(["Privat"]);
  });
  it("Duplizieren führt in den Editor der Kopie (mit Hinweis); solange es läuft, löst ein zweiter Klick nichts aus", async () => {
    let fertig!: (r: unknown) => void;
    aktion.dupliziere.mockReturnValue(new Promise((r) => { fertig = r; }));
    await mount(<PlanTabelle zeilen={ZEILEN} liste="plaene" />);
    const aktionen = query<HTMLButtonElement>('tr[data-row-key="p1"] button[aria-label="Aktionen für Einsatz"]');
    await clickElement(aktionen);
    await clickElement(knopf("Duplizieren"));
    // zweiter Versuch, solange der erste läuft: über das (evtl. noch im Portal stehende) Menü oder gar nicht
    await clickElement(aktionen);
    const nochmal = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((e) => e.textContent === "Duplizieren");
    if (nochmal) await clickElement(nochmal);
    expect(aktion.dupliziere).toHaveBeenCalledTimes(1);
    await act(async () => { fertig({ ok: true, id: "neu-1", titel: "zusatz" }); });
    await abwarten();
    expect(aktion.dupliziere).toHaveBeenCalledWith("p1");
    expect(router.push).toHaveBeenCalledWith("/p/neu-1?kopie=zusatz"); // was mit dem Titel geschah, geht an den Kopie-Hinweis
  });
  it("Archivieren meldet sich mit „Rückgängig“, das wiederherstellt", async () => {
    aktion.archiviere.mockResolvedValue({ ok: true });
    aktion.wiederher.mockResolvedValue({ ok: true });
    await mount(<PlanTabelle zeilen={ZEILEN} liste="plaene" />);
    await clickElement(query('tr[data-row-key="p1"] button[aria-label="Aktionen für Einsatz"]'));
    await clickElement(knopf("Archivieren"));
    await abwarten();
    expect(query('.kp-listenhinweis[role="status"]').textContent).toContain("„Einsatz“ archiviert.");
    expect(document.activeElement).toBe(knopf("Rückgängig")); // die Zeile ist weg: der Fokus steht im Hinweis, nicht auf body
    await clickElement(knopf("Rückgängig"));
    await abwarten();
    expect(aktion.wiederher).toHaveBeenCalledWith("p1");
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });
  it("Archivliste: Spalte „Archiviert“, nur „Wiederherstellen“", async () => {
    await mount(<PlanTabelle zeilen={[{ ...ZEILEN[0], archiviert: "01.10.2026" }]} liste="archiv" />);
    expect(query('table[aria-label="Archivierte Pläne"], [aria-label="Archivierte Pläne"]')).toBeTruthy();
    expect(document.body.textContent).toContain("01.10.2026");
    await clickElement(query('tr[data-row-key="p1"] button[aria-label="Aktionen für Einsatz"]'));
    expect([...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent)).toEqual(["Exportieren", "Wiederherstellen"]);
    // Der Eintrag ruft wirklich die Wiederherstellung (Review Phase 4: ein vertauschter Aufruf blieb unbemerkt).
    aktion.wiederher.mockResolvedValue({ ok: true });
    await clickElement(knopf("Wiederherstellen"));
    await abwarten();
    expect(aktion.wiederher).toHaveBeenCalledWith("p1");
    expect(aktion.archiviere).not.toHaveBeenCalled();
    expect(query('.kp-listenhinweis[role="status"]').textContent).toContain("„Einsatz“ wiederhergestellt.");
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
  it("„Als Vorlage speichern“ legt eine Kopie an, sagt, wo sie steht, und bietet „Vorlage öffnen“ — der Plan bleibt in der Liste", async () => {
    aktion.vorlage.mockResolvedValue({ ok: true, id: "v9" });
    await mount(<PlanTabelle zeilen={[ZEILEN[0]]} liste="plaene" />);
    await clickElement(query('button[aria-label="Aktionen für Einsatz"]'));
    await abwarten();
    await clickElement(knopf("Als Vorlage speichern"));
    await abwarten();
    expect(aktion.vorlage).toHaveBeenCalledWith("p1", false);
    expect(query(".kp-listenhinweis").textContent).toContain("Vorlage „Einsatz“ angelegt — sie steht unter „Vorlagen“.");
    const oeffnen = query<HTMLAnchorElement>(".kp-listenhinweis a");
    expect(oeffnen.textContent).toBe("Vorlage öffnen");
    expect(oeffnen.getAttribute("href")).toBe("/p/v9");
    expect(document.activeElement).toBe(oeffnen);
    expect(router.refresh).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
  it("gleicher Titel schon als Vorlage: nichts angelegt, „Vorlage öffnen“ führt zur vorhandenen, „Trotzdem anlegen“ legt die zweite an", async () => {
    aktion.vorlage
      .mockResolvedValueOnce({ ok: false, fehler: "Eine Vorlage „Einsatz“ gibt es schon — sie steht unter „Vorlagen“.", feldFehler: {}, vorhanden: "v1" })
      .mockResolvedValueOnce({ ok: true, id: "v2" });
    await mount(<PlanTabelle zeilen={[ZEILEN[0]]} liste="plaene" />);
    await clickElement(query('button[aria-label="Aktionen für Einsatz"]'));
    await abwarten();
    await clickElement(knopf("Als Vorlage speichern"));
    await abwarten();
    expect(query(".kp-listenhinweis").textContent).toContain("Eine Vorlage „Einsatz“ gibt es schon");
    const oeffnen = query<HTMLAnchorElement>(".kp-listenhinweis a");
    expect(oeffnen.getAttribute("href")).toBe("/p/v1");
    expect(document.activeElement).toBe(oeffnen);
    expect(router.refresh).not.toHaveBeenCalled();
    await clickElement(knopf("Trotzdem anlegen"));
    await abwarten();
    expect(aktion.vorlage).toHaveBeenLastCalledWith("p1", true);
    expect(query(".kp-listenhinweis").textContent).toContain("Vorlage „Einsatz“ angelegt");
    expect(query<HTMLAnchorElement>(".kp-listenhinweis a").getAttribute("href")).toBe("/p/v2");
    expect(exists(".kp-listenhinweis button")).toBe(false);
  });
  it("Vorlagenliste: „Neu aus Vorlage“ und „Vorlage archivieren“ (mit Rückgängig) — kein „Keine Vorlage mehr“, kein zweites „Archivieren“", async () => {
    aktion.archiviere.mockResolvedValue({ ok: true });
    await mount(<PlanTabelle zeilen={[ZEILEN[1]]} liste="vorlagen" />);
    await clickElement(query('button[aria-label="Aktionen für Label"]'));
    await abwarten();
    expect([...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent)).toEqual(["Neu aus Vorlage", "Exportieren", "Vorlage archivieren"]);
    await clickElement(knopf("Vorlage archivieren"));
    await abwarten();
    expect(aktion.archiviere).toHaveBeenCalledWith("p2");
    expect(query(".kp-listenhinweis").textContent).toContain("Vorlage „Label“ archiviert.");
    expect(knopf("Rückgängig")).toBeTruthy();
  });
  it("Archiv: eine Vorlage trägt das Kennzeichen „Vorlage“; Wiederherstellen sagt, wohin sie zurückkehrt", async () => {
    aktion.wiederher.mockResolvedValue({ ok: true });
    await mount(<PlanTabelle zeilen={[{ ...ZEILEN[1], lesbar: true, archiviert: "01.10.2026" }]} liste="archiv" />);
    expect(queryAll("tr[data-row-key] .kp-chip").map((c) => c.textContent)).toEqual(["Vorlage"]);
    await clickElement(query('button[aria-label="Aktionen für Label"]'));
    await abwarten();
    await clickElement(knopf("Wiederherstellen"));
    await abwarten();
    expect(query(".kp-listenhinweis").textContent).toBe("„Label“ wiederhergestellt — sie steht wieder unter „Vorlagen“.");
  });
  it("„Rückgängig“ nach dem Archivieren: ein Doppelklick schickt EINE Wiederherstellung (sonst „gibt es nicht mehr“ über dem Erfolg)", async () => {
    aktion.archiviere.mockResolvedValue({ ok: true });
    let fertig!: (r: unknown) => void;
    aktion.wiederher.mockReturnValue(new Promise((r) => { fertig = r; }));
    await mount(<PlanTabelle zeilen={ZEILEN} liste="plaene" />);
    await clickElement(query('tr[data-row-key="p1"] button[aria-label="Aktionen für Einsatz"]'));
    await clickElement(knopf("Archivieren"));
    await abwarten();
    await clickElement(knopf("Rückgängig"));
    await clickElement(knopf("Rückgängig"));
    await act(async () => { fertig({ ok: true }); });
    await abwarten();
    expect(aktion.wiederher).toHaveBeenCalledTimes(1);
    expect(query('.kp-listenhinweis[role="status"]').textContent).toContain("Wiederhergestellt.");
  });
});
