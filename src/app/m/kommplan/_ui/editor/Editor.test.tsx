// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { clickElement, exists, existsPortal, mount, query, queryAll, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";

const aktionen = vi.hoisted(() => ({
  speichereInhaltAction: vi.fn(), speichereAngabenAction: vi.fn(), legePlanAnAction: vi.fn(), ladeStandAction: vi.fn(),
}));
vi.mock("../../_actions/plan", () => aktionen);
const zeichen = vi.hoisted(() => ({ ladeZeichenAction: vi.fn(async () => ({})) }));
vi.mock("../../_actions/zeichen", () => zeichen);
import { baue } from "../../_lib/beispiele/bau";
import { leererPlan } from "../../_lib/plan/operationen";
import type { PlanInhalt } from "../../_lib/plan/schema";
import { Editor, type EditorPlan } from "./Editor";

const INHALT = baue({ stellen: [{ id: "el", titel: "EL" }, { id: "a", titel: "EA 1", eltern: "el" }, { id: "s", titel: "KatSL", eltern: "el", lage: "links" }] });
const plan = (inhalt: PlanInhalt = INHALT): EditorPlan => ({
  id: "p1", version: 1, inhalt, aktualisiertAm: Date.UTC(2026, 8, 30, 8), aktualisiertVon: "Jana",
  angaben: { titel: "Übung", typ: "kommunikationsplan", anlass: null, datum: null },
});
const zeige = async (p = plan()) => { await mount(<Editor plan={p} symbole={{}} zeichenIndex={[]} schrift="Arimo" />); await act(async () => {}); };
const karten = () => queryAll("[data-karte]").map((k) => k.getAttribute("data-karte")!);
function zeiger(el: Element, typ: string, zeit: number) {
  const e = new MouseEvent(typ, { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
  Object.defineProperty(e, "pointerId", { value: 1 });
  Object.defineProperty(e, "timeStamp", { value: zeit });
  el.dispatchEvent(e);
}
let uhr = 0;
async function waehle(id: string) {
  uhr += 10_000; // weit auseinander: kein Doppelklick
  await act(async () => { const k = query(`[data-karte="${id}"] rect`); zeiger(k, "pointerdown", uhr); zeiger(k, "pointerup", uhr + 10); });
}
async function taste(key: string, mehr: KeyboardEventInit = {}, ziel?: Element) {
  await act(async () => { (ziel ?? document.activeElement ?? query(".kp-betrachter")).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mehr })); });
}
const knopf = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text)!;
const flaecheFokussiert = () => document.activeElement === query(".kp-betrachter");
/** Wie `fill` aus dem Harness, aber für ein Element im Portal (Flyin): `fill` sucht nur im Wirt. */
async function schreibe(el: HTMLInputElement, wert: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(el, wert); el.dispatchEvent(new Event("input", { bubbles: true })); });
}

beforeEach(() => {
  aktionen.speichereInhaltAction.mockImplementation(async (e: { version: number }) => ({ ok: true, version: e.version + 1, aktualisiertAm: Date.UTC(2026, 8, 30, 9) }));
  aktionen.speichereAngabenAction.mockImplementation(async (e: { version: number }) => ({ ok: true, version: e.version + 1, aktualisiertAm: Date.UTC(2026, 8, 30, 9) }));
  aktionen.ladeStandAction.mockResolvedValue(null);
});
afterEach(async () => { await unmount(); vi.useRealTimers(); vi.clearAllMocks(); vi.restoreAllMocks(); });

describe("Editor (Spec §6.2, §6.3)", () => {
  it("Klick wählt eine Karte und zeigt ihre Griffe; eine Seitenstelle hat nur „+ Einheit“ und „Bearbeiten“", async () => {
    await zeige();
    await waehle("a");
    expect(queryAll('[data-griffe="a"] [data-griff]').map((g) => g.getAttribute("data-griff"))).toEqual(["links", "rechts", "unter", "einheit", "bearbeiten"]);
    await waehle("s");
    expect(queryAll('[data-griffe="s"] [data-griff]').map((g) => g.getAttribute("data-griff"))).toEqual(["einheit", "bearbeiten"]);
  });
  it("„+ Unterstelle“: sofort gesetzt, ausgewählt, Flyin offen mit leerem Titel", async () => {
    await zeige();
    await waehle("a");
    await clickElement(query('[data-griff="unter"]'));
    const neu = karten().find((k) => !["el", "a", "s"].includes(k))!;
    expect(neu).toBeDefined();
    expect(exists(`[data-griffe="${neu}"]`)).toBe(true);
    expect(existsPortal(`[data-flyin-stelle="${neu}"]`)).toBe(true);
    expect(queryPortal<HTMLInputElement>('input[name="titel"]').value).toBe("");
  });
  it("Tastaturschleife ohne Maus: N → Titel → Enter → N (Entscheidung 17)", async () => {
    await zeige();
    await waehle("el");
    query<HTMLElement>(".kp-betrachter").focus();
    await taste("n");
    expect(karten()).toHaveLength(4);
    expect(document.activeElement).toBe(queryPortal('input[name="titel"]'));
    await schreibe(queryPortal<HTMLInputElement>('input[name="titel"]'), "EA 2");
    await taste("Enter", {}, queryPortal('input[name="titel"]'));
    expect(flaecheFokussiert()).toBe(true);
    expect(existsPortal("[data-flyin-stelle]")).toBe(false);
    await taste("ArrowUp");
    await taste("n");
    expect(karten()).toHaveLength(5);
  });
  it("Tastatur: ↓ wandert, Entf löscht mit Rückgängig statt Nachfrage; danach hat die Fläche den Fokus", async () => {
    await zeige();
    await waehle("el");
    query<HTMLElement>(".kp-betrachter").focus();
    await taste("ArrowDown");
    expect(exists('[data-griffe="a"]')).toBe(true);
    await taste("Delete");
    expect(karten()).toHaveLength(2);
    expect(query(".kp-betrachter [data-meldung]").textContent).toContain("„EA 1“ gelöscht.");
    expect(flaecheFokussiert()).toBe(true);
    await clickElement(knopf("Rückgängig"));
    expect(karten()).toHaveLength(3);
  });
  it("F2 öffnet wie Enter; andere Buchstaben tun nichts (Entscheidung 9)", async () => {
    await zeige();
    await waehle("a");
    query<HTMLElement>(".kp-betrachter").focus();
    await taste("x");
    expect(existsPortal("[data-flyin-stelle]")).toBe(false);
    await taste("F2");
    expect(existsPortal('[data-flyin-stelle="a"]')).toBe(true);
  });
  it("N an einer Seitenstelle: Hinweis, keine Änderung", async () => {
    await zeige();
    await waehle("s");
    query<HTMLElement>(".kp-betrachter").focus();
    await taste("n");
    expect(karten()).toHaveLength(3);
    expect(document.body.textContent).toContain("Eine Seitenstelle trägt keine Unterstellen.");
  });
  it("N unter einer eingeklappten Stelle klappt sie auf: die neue Karte steht da und hat Griffe", async () => {
    await zeige();
    await clickElement(query('[data-umschalter="el"]'));
    expect(karten()).not.toContain("a");
    await waehle("el");
    query<HTMLElement>(".kp-betrachter").focus();
    await taste("n");
    const neu = karten().find((k) => !["el", "a", "s"].includes(k))!;
    expect(neu).toBeDefined();
    expect(exists(`[data-griffe="${neu}"]`)).toBe(true);
  });
  it("Strg/Cmd+Z und Umschalt+Strg/Cmd+Z außerhalb von Textfeldern; im Titelfeld gehört Strg+Z dem Feld", async () => {
    await zeige();
    await waehle("a");
    await clickElement(query('[data-griff="unter"]'));
    expect(karten()).toHaveLength(4);
    await taste("z", { ctrlKey: true }, document.body);
    expect(karten()).toHaveLength(3);
    await taste("Z", { metaKey: true, shiftKey: true }, document.body);
    expect(karten()).toHaveLength(4);
    await taste("z", { ctrlKey: true }, queryPortal('input[name="titel"]'));
    expect(karten()).toHaveLength(4);
  });
  it("Autosave etwa 1 s nach der letzten Änderung, mit Version; Status kurz und in Worten", async () => {
    vi.useFakeTimers();
    await zeige();
    await waehle("a");
    await clickElement(query('[data-griff="unter"]'));
    expect(query(".kp-speicherstatus").textContent).toBe("Ungespeichert");
    await act(async () => { await vi.advanceTimersByTimeAsync(999); });
    expect(aktionen.speichereInhaltAction).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(aktionen.speichereInhaltAction).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", version: 1 }));
    expect(query(".kp-speicherstatus").textContent).toBe("Gespeichert 11:00");
  });
  it("Konflikt: Hinweis mit „Neu laden“ — danach steht der Serverstand da, Rückgängig ist leer", async () => {
    vi.useFakeTimers();
    const fremd = baue({ stellen: [{ id: "x", titel: "Fremd" }] });
    aktionen.speichereInhaltAction.mockResolvedValue({ ok: false, grund: "konflikt",
      stand: { version: 7, inhalt: fremd, angaben: plan().angaben, aktualisiertAm: Date.UTC(2026, 8, 30, 9), aktualisiertVon: "Ole" } });
    await zeige();
    await waehle("a");
    await clickElement(query('[data-griff="unter"]'));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(document.body.textContent).toContain("Jemand anderes hat diesen Plan inzwischen geändert.");
    expect(document.body.textContent).toContain("von Ole");
    await clickElement(knopf("Neu laden"));
    expect(karten()).toEqual(["x"]);
    expect(knopf("Rückgängig").disabled).toBe(true);
  });
  it("Konflikt: „Meine Fassung behalten“ sendet mit der Serverversion und übernimmt die Planangaben der anderen Fassung", async () => {
    vi.useFakeTimers();
    const fremdeAngaben = { ...plan().angaben, titel: "Fremdtitel" };
    aktionen.speichereInhaltAction
      .mockResolvedValueOnce({ ok: false, grund: "konflikt", stand: { version: 7, inhalt: INHALT, angaben: fremdeAngaben, aktualisiertAm: 0, aktualisiertVon: "Ole" } })
      .mockResolvedValueOnce({ ok: true, version: 8, aktualisiertAm: 0 });
    await zeige();
    await waehle("a");
    await clickElement(query('[data-griff="unter"]'));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await clickElement(knopf("Meine Fassung behalten"));
    await act(async () => {});
    expect(aktionen.speichereInhaltAction).toHaveBeenLastCalledWith(expect.objectContaining({ version: 7 }));
    expect(document.body.textContent).not.toContain("Jemand anderes hat diesen Plan inzwischen geändert.");
    expect(query("h1").textContent).toBe("Fremdtitel");
  });
  it("Browser-Zurück: ist der Serverstand beim Montieren neuer, gilt er still (Entscheidung 21)", async () => {
    const neuer = baue({ stellen: [{ id: "el", titel: "EL neu" }] });
    aktionen.ladeStandAction.mockResolvedValue({ version: 5, inhalt: neuer, angaben: { ...plan().angaben, titel: "Neuer Titel" }, aktualisiertAm: 0, aktualisiertVon: "Jana" });
    await zeige();
    expect(aktionen.ladeStandAction).toHaveBeenCalledWith("p1");
    expect(karten()).toEqual(["el"]);
    expect(query("h1").textContent).toBe("Neuer Titel");
    expect(document.body.textContent).not.toContain("Jemand anderes");
  });
  it("Planangaben: Titel ändern und das Flyin schließen — gesendet, bevor das Formular verschwindet (Entscheidung 3)", async () => {
    await zeige();
    await clickElement(knopf("Plan und Verbindungen"));
    const titel = queryPortal<HTMLInputElement>('fieldset[aria-label="Planangaben"] input[name="titel"]');
    await act(async () => { titel.focus(); });
    await schreibe(titel, "Übung Süd");
    // Schließen-Knopf der Schublade: Name je nach antd-Sprachpaket
    await clickElement(queryPortal('.kp-flyin button[aria-label="Close"], .kp-flyin button[aria-label="Schließen"]'));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(aktionen.speichereAngabenAction).toHaveBeenCalledWith(expect.objectContaining({ angaben: expect.objectContaining({ titel: "Übung Süd" }) }));
    expect(query("h1").textContent).toBe("Übung Süd");
    expect(flaecheFokussiert()).toBe(true);
  });
  it("leerer Plan: kein Absturz, „Erste Stelle anlegen“ führt in den Normalfall (Review Focus 1)", async () => {
    await zeige(plan(leererPlan()));
    expect(document.body.textContent).toContain("Dieser Plan hat noch keine Stellen.");
    expect(queryAll("[data-griff]")).toHaveLength(0);
    await taste("ArrowRight", {}, query(".kp-betrachter"));
    await clickElement(knopf("Erste Stelle anlegen"));
    expect(karten()).toHaveLength(1);
    expect(existsPortal("[data-flyin-stelle]")).toBe(true);
  });
  it("die letzte Stelle löschen: der Hinweis mit „Rückgängig“ steht auch im leeren Plan (Entscheidung 19)", async () => {
    await zeige(plan(leererPlan()));
    await clickElement(knopf("Erste Stelle anlegen"));
    await taste("Enter", {}, queryPortal('input[name="titel"]'));
    await taste("Delete", {}, query(".kp-betrachter"));
    expect(karten()).toHaveLength(0);
    expect(query(".kp-betrachter [data-meldung]").textContent).toContain("gelöscht");
    await clickElement(knopf("Rückgängig"));
    expect(karten()).toHaveLength(1);
  });
  it("Drucken öffnet das Fenster sofort und setzt die Druckroute erst nach dem Speichern", async () => {
    const fenster = { location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(fenster as unknown as Window);
    await zeige();
    await waehle("a");
    await clickElement(query('[data-griff="unter"]'));
    await clickElement(knopf("Drucken (A4 quer)"));
    // mehrere Mikroaufgaben (Warteschlange, Action, Auswertung): eine echte Runde der Ereignisschleife abwarten
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(window.open).toHaveBeenCalledWith("", "_blank");
    expect(aktionen.speichereInhaltAction).toHaveBeenCalledTimes(1);
    expect(fenster.location.href).toBe("/p/p1/druck/a4");
  });
  it("ein offenes Flyin hält seine Breite im Seitenfluss frei: Kopfleiste und Hinweise bleiben erreichbar", async () => {
    await zeige();
    expect(query(".kp-editor").hasAttribute("data-flyin")).toBe(false);
    await waehle("a");
    await clickElement(query('[data-griff="bearbeiten"]'));
    expect(query(".kp-editor").getAttribute("data-flyin")).toBe("stelle");
    expect(query(".kp-editor").style.getPropertyValue("--kp-flyin-breite")).toBe("min(520px, 92vw)");
    await clickElement(knopf("Plan und Verbindungen"));
    expect(query(".kp-editor").style.getPropertyValue("--kp-flyin-breite")).toBe("min(560px, 92vw)");
  });
});
