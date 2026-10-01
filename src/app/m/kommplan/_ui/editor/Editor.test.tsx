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
import type { EditorAnsicht } from "../../_lib/editorAnsicht";
import { leererPlan } from "../../_lib/plan/operationen";
import type { PlanInhalt } from "../../_lib/plan/schema";
import { Editor, type EditorPlan } from "./Editor";

const INHALT = baue({ stellen: [{ id: "el", titel: "EL" }, { id: "a", titel: "EA 1", eltern: "el" }, { id: "s", titel: "KatSL", eltern: "el", lage: "links" }] });
const plan = (inhalt: PlanInhalt = INHALT): EditorPlan => ({
  id: "p1", version: 1, inhalt, aktualisiertAm: Date.UTC(2026, 8, 30, 8), aktualisiertVon: "Jana",
  angaben: { titel: "Übung", typ: "kommunikationsplan", anlass: null, datum: null },
});
const zeige = async (p = plan(), ansicht: EditorAnsicht | null = null) => { await mount(<Editor plan={p} ansicht={ansicht} symbole={{}} zeichenIndex={[]} schrift="Arimo" />); await act(async () => {}); };
/** Das Titelfeld des Stellen-Flyins — nie ungefiltert `input[name="titel"]`: die Gliederung trägt denselben Namen (Phase 3). */
const flyinFeld = () => queryPortal<HTMLInputElement>('[data-flyin-stelle] input[name="titel"]');
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
const rueckImHinweis = () => queryAll<HTMLButtonElement>(".kp-betrachter [data-meldung] button").find((b) => b.textContent === "Rückgängig");
const flyinOffen = () => existsPortal("[data-flyin-stelle]");
const einheiten = () => queryAll("[data-einheit]").length;
/** Klick ins Leere der Zeichenfläche (kein Kartenrechteck). */
async function klickeLeer() {
  uhr += 10_000;
  await act(async () => { const f = query(".kp-betrachter svg[role=img]"); zeiger(f, "pointerdown", uhr); zeiger(f, "pointerup", uhr + 10); });
}
/** Esc im Flyin: die Schublade schließt über ihre eigene Tastenbehandlung. */
async function escImFlyin() {
  await taste("Escape", {}, flyinFeld());
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
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
    await waehle("a");
    expect(query('[data-griff="links"]').textContent).toBe("+ links");
    expect(query('[data-griff="rechts"]').textContent).toBe("+ rechts");
    expect(query('[data-griff="links"]').getAttribute("aria-label")).toBe("Seitenstelle links von EA 1 anlegen");
    expect(queryAll("[data-griff]").every((b) => b.tagName === "BUTTON" && b.getAttribute("type") === "button")).toBe(true);
  });
  it("„+ Unterstelle“: sofort gesetzt, ausgewählt, Flyin offen mit leerem Titel", async () => {
    await zeige();
    await waehle("a");
    await clickElement(query('[data-griff="unter"]'));
    const neu = karten().find((k) => !["el", "a", "s"].includes(k))!;
    expect(neu).toBeDefined();
    expect(exists(`[data-griffe="${neu}"]`)).toBe(true);
    expect(existsPortal(`[data-flyin-stelle="${neu}"]`)).toBe(true);
    expect(flyinFeld().value).toBe("");
  });
  it("Tastaturschleife ohne Maus: N → Titel → Enter → N (Entscheidung 17)", async () => {
    await zeige();
    await waehle("el");
    query<HTMLElement>(".kp-betrachter").focus();
    await taste("n");
    expect(karten()).toHaveLength(4);
    expect(document.activeElement).toBe(flyinFeld());
    await schreibe(flyinFeld(), "EA 2");
    await taste("Enter", {}, flyinFeld());
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
    const neu = karten().find((k) => !["el", "a", "s"].includes(k))!;
    await waehle(neu);
    await taste("F2", {}, query(".kp-betrachter"));
    await taste("z", { ctrlKey: true }, flyinFeld());
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
    await taste("Enter", {}, flyinFeld());
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
  it("Drucken, wenn das Speichern misslingt: Fenster wieder zu, Hinweis, kein Druck des alten Serverstands", async () => {
    const fenster = { location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(fenster as unknown as Window);
    aktionen.speichereInhaltAction.mockRejectedValue(new Error("offline"));
    await zeige();
    await waehle("a");
    await clickElement(query('[data-griff="unter"]'));
    await clickElement(knopf("Drucken (A4 quer)"));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(fenster.close).toHaveBeenCalled();
    expect(fenster.location.href).toBe("");
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(query(".kp-betrachter [data-meldung]").textContent).toContain("Vor dem Drucken ließ sich nicht speichern.");
  });
  it("Ungespeichertes hält das Schließen des Tabs auf (Entscheidung 11); ohne Änderung nicht", async () => {
    vi.useFakeTimers(); // sonst speichert der Autosave unter Last schon, bevor der Test fragt
    const schliessen = () => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };
    await zeige();
    expect(schliessen()).toBe(false);
    await waehle("a");
    await clickElement(query('[data-griff="unter"]'));
    expect(schliessen()).toBe(true);
  });
  it("wieder online nach einem Netzfehler: sofort erneut senden", async () => {
    vi.useFakeTimers();
    aktionen.speichereInhaltAction.mockRejectedValueOnce(new Error("offline"));
    await zeige();
    await waehle("a");
    await clickElement(query('[data-griff="unter"]'));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(query(".kp-speicherstatus").textContent).toBe("Nicht gespeichert");
    await act(async () => { window.dispatchEvent(new Event("online")); await vi.advanceTimersByTimeAsync(0); });
    expect(aktionen.speichereInhaltAction).toHaveBeenCalledTimes(2);
    expect(query(".kp-speicherstatus").textContent).toBe("Gespeichert 11:00");
  });
  it("Griffe „+ Einheit“ und „+“ rechts: legen an, was sie sagen", async () => {
    await zeige();
    await waehle("a");
    expect(einheiten()).toBe(0);
    await clickElement(query('[data-griff="einheit"]'));
    expect(einheiten()).toBe(1);
    expect(existsPortal('[data-flyin-stelle="a"]')).toBe(true);
    await escImFlyin();
    await waehle("a");
    await clickElement(query('[data-griff="rechts"]'));
    const neu = karten().find((k) => !["el", "a", "s"].includes(k))!;
    expect(neu).toBeDefined();
    expect(queryPortal<HTMLInputElement>('input[type="radio"][value="rechts"]').checked).toBe(true);
    expect(queryPortal("[data-flyin-stelle]").getAttribute("data-flyin-stelle")).toBe(neu);
  });
  it("Esc nach einem Griff ohne jede Eingabe: das leere Element verschwindet wieder, ohne Wiederholen-Schritt", async () => {
    await zeige();
    await waehle("a");
    await clickElement(query('[data-griff="einheit"]'));
    expect(einheiten()).toBe(1);
    await escImFlyin();
    expect(einheiten()).toBe(0);
    await waehle("a");
    await clickElement(query('[data-griff="unter"]'));
    expect(karten()).toHaveLength(4);
    await escImFlyin();
    expect(karten()).toHaveLength(3);
    expect(exists('[data-griffe="a"]')).toBe(true); // die Auswahl kehrt zur Elternstelle zurück
    expect(knopf("Wiederholen").disabled).toBe(true);
    expect(flyinOffen()).toBe(false);
  });
  it("… mit Eingabe bleibt es stehen; Enter („fertig“) behält auch ein leeres", async () => {
    await zeige();
    await waehle("a");
    await clickElement(query('[data-griff="unter"]'));
    await schreibe(flyinFeld(), "Trupp");
    await escImFlyin();
    expect(karten()).toHaveLength(4);
    await waehle("a");
    await clickElement(query('[data-griff="unter"]'));
    await taste("Enter", {}, flyinFeld());
    expect(karten()).toHaveLength(5);
  });
  it("Abwählen schließt das Flyin ganz: danach öffnet weder ein Pfeil noch ein Einfachklick es wieder (Review Phase 2)", async () => {
    await zeige();
    await waehle("a");
    query<HTMLElement>(".kp-betrachter").focus();
    await taste("F2");
    expect(flyinOffen()).toBe(true);
    await klickeLeer();
    expect(flyinOffen()).toBe(false);
    query<HTMLElement>(".kp-betrachter").focus();
    await taste("ArrowDown");
    expect(exists('[data-griffe="el"]')).toBe(true);
    expect(flyinOffen()).toBe(false);
  });
  it("… ebenso, wenn Rückgängig die gewählte Stelle entfernt", async () => {
    await zeige();
    await waehle("a");
    await clickElement(query('[data-griff="unter"]'));
    await schreibe(flyinFeld(), "Neu");
    expect(flyinOffen()).toBe(true);
    await clickElement(knopf("Rückgängig"));
    await clickElement(knopf("Rückgängig"));
    expect(karten()).toHaveLength(3);
    expect(flyinOffen()).toBe(false);
    await waehle("el");
    expect(flyinOffen()).toBe(false);
  });
  it("… ebenso, wenn der Serverstand beim Montieren still übernommen wird und die gewählte Stelle fehlt", async () => {
    let loese: (s: unknown) => void = () => {};
    aktionen.ladeStandAction.mockImplementation(() => new Promise((r) => { loese = r; }));
    await zeige();
    await waehle("a");
    query<HTMLElement>(".kp-betrachter").focus();
    await taste("F2");
    expect(flyinOffen()).toBe(true);
    await act(async () => { loese({ version: 5, inhalt: baue({ stellen: [{ id: "el", titel: "EL" }, { id: "b", titel: "EA 2", eltern: "el" }] }), angaben: plan().angaben, aktualisiertAm: 0, aktualisiertVon: "Jana" }); });
    expect(flyinOffen()).toBe(false);
    await waehle("b");
    expect(flyinOffen()).toBe(false);
  });
  it("Lösch-Hinweis: „Rückgängig“ nur, solange die Löschung der letzte Schritt ist (Review Phase 2)", async () => {
    await zeige();
    expect(rueckImHinweis()).toBeUndefined();
    await waehle("a");
    query<HTMLElement>(".kp-betrachter").focus();
    await taste("Delete");
    expect(query(".kp-betrachter [data-meldung]").textContent).toContain("„EA 1“ gelöscht.");
    expect(rueckImHinweis()).toBeDefined();
    await waehle("el");
    query<HTMLElement>(".kp-betrachter").focus();
    await taste("F2");
    await schreibe(flyinFeld(), "ELX");
    expect(query(".kp-betrachter [data-meldung]").textContent).toContain("„EA 1“ gelöscht.");
    expect(rueckImHinweis()).toBeUndefined();
    await clickElement(knopf("Rückgängig")); // der Kopfleiste: erst das Tippen, dann die Löschung
    expect(karten()).not.toContain("a");
    await clickElement(knopf("Rückgängig"));
    expect(karten()).toContain("a");
  });
  it("Umhängen unter eine eingeklappte Stelle klappt sie auf: die bearbeitete Stelle bleibt sichtbar", async () => {
    const mitTrupp = baue({ stellen: [{ id: "el", titel: "EL" }, { id: "a", titel: "EA 1", eltern: "el" }, { id: "b", titel: "EA 2", eltern: "el" }, { id: "b1", titel: "Trupp", eltern: "b" }] });
    await zeige(plan(mitTrupp));
    await clickElement(query('[data-umschalter="b"]'));
    expect(karten()).not.toContain("b1");
    await waehle("a");
    query<HTMLElement>(".kp-betrachter").focus();
    await taste("F2");
    const label = [...document.querySelectorAll("label")].find((l) => l.textContent === "Elternstelle")!;
    await act(async () => { document.getElementById(label.htmlFor)!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); });
    await clickElement([...document.querySelectorAll<HTMLElement>(".ant-select-item-option")].find((o) => o.textContent === "EA 2")!);
    expect(karten()).toEqual(expect.arrayContaining(["a", "b1"]));
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
  it("Verlassen des Editors (Abbau) sendet eine wartende Änderung sofort — kein Autosave-Timer überlebt den Editor", async () => {
    vi.useFakeTimers();
    await zeige();
    await waehle("a");
    await clickElement(query('[data-griff="unter"]'));
    expect(aktionen.speichereInhaltAction).not.toHaveBeenCalled();
    await unmount();
    expect(aktionen.speichereInhaltAction).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(aktionen.speichereInhaltAction).toHaveBeenCalledTimes(1);
  });
  it("Symbolvorrat genau einmal im Dokument, direkt unter dem Editor — nie in einer Ansicht (Phase 3, Entscheidung 17)", async () => {
    await zeige();
    const ids = [...document.querySelectorAll("symbol")].map((s) => s.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(query(".kp-symbolvorrat").parentElement!.classList.contains("kp-editor")).toBe(true);
  });
});

describe("Ansichten (Spec §6.2, §6.5; Phase 3, Entscheidungen 1, 2, 16)", () => {
  /** Ein Radio des Umschalters; `gruppe` ist die radiogroup selbst (Vorgabe: die erste — mit ausdrücklicher Ansicht gibt es nur eine). */
  const radio = (name: string, gruppe: ParentNode = query('[role="radiogroup"][aria-label="Ansicht"]')) =>
    [...gruppe.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((r) => r.closest("label")!.textContent === name)!;

  it("ohne Parameter: data-editoransicht=auto, zwei Umschalter (CSS wählt je Breakpoint), beide Ansichten im DOM", async () => {
    await zeige();
    expect(query(".kp-editor").getAttribute("data-editoransicht")).toBe("auto");
    expect(queryAll('[role="radiogroup"][aria-label="Ansicht"]')).toHaveLength(2);
    expect(radio("Diagramm", query(".kp-nur-breit")).checked).toBe(true);
    expect(radio("Gliederung", query(".kp-nur-schmal")).checked).toBe(true);
    expect(exists(".kp-ansicht-diagramm .kp-betrachter")).toBe(true);
    expect(exists(".kp-ansicht-gliederung [data-gliederung]")).toBe(true);
  });
  it("Umschalten: Adresse per replaceState, Auswahl, Rückgängig und Speicherstand bleiben, kein Speichern (Review Focus 5)", async () => {
    const ersetze = vi.spyOn(window.history, "replaceState");
    const warte = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
    await zeige(plan(), "diagramm");
    await waehle("a");
    query<HTMLElement>(".kp-betrachter").focus();
    await taste("n"); // neue Unterstelle, Flyin offen
    await schreibe(flyinFeld(), "Neu"); // berührt: Esc verwirft sie nicht
    await warte(1200); // Autosave erledigt
    aktionen.speichereInhaltAction.mockClear();
    await clickElement(radio("Gliederung"));
    expect(query(".kp-editor").getAttribute("data-editoransicht")).toBe("gliederung");
    expect(flyinFeld().value).toBe("Neu"); // das Flyin ist dasselbe geblieben
    expect(ersetze).toHaveBeenLastCalledWith(null, "", expect.stringMatching(/\?ansicht=gliederung$/));
    expect(query<HTMLInputElement>('[data-zeile][aria-current="true"] input[name="titel"]').value).toBe("Neu");
    expect(flyinOffen()).toBe(true);
    expect(knopf("Rückgängig").disabled).toBe(false);
    await clickElement(radio("Diagramm"));
    expect(exists("[data-griffe]")).toBe(true);
    await warte(1200);
    expect(aktionen.speichereInhaltAction).not.toHaveBeenCalled();
  });
  it("Gliederung: Tab auf der ersten Unterstelle — der Hinweis steht im Meldungsplatz der Gliederung", async () => {
    await zeige(plan(), "gliederung");
    const feld = query<HTMLInputElement>('[data-zeile="a"] input[name="titel"]');
    await act(async () => { feld.focus(); });
    await taste("Tab", {}, feld);
    expect(query(".kp-gliederung [data-meldung]").textContent).toContain("Die erste Stelle einer Ebene lässt sich nicht einrücken.");
    expect(document.activeElement).toBe(feld);
  });
  it("Details aus der Gliederung öffnet das Flyin; Schließen gibt den Fokus an die Zeile zurück", async () => {
    await zeige(plan(), "gliederung");
    const feld = query<HTMLInputElement>('[data-zeile="a"] input[name="titel"]');
    await act(async () => { feld.focus(); });
    await taste("F2", {}, feld);
    expect(flyinOffen()).toBe(true);
    await escImFlyin(); // Esc an `flyinFeld()` — nicht an die Gliederung
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    expect(flyinOffen()).toBe(false);
    expect(document.activeElement).toBe(query('[data-zeile="a"] input[name="titel"]')); // breit (jsdom kennt kein matchMedia): der Titel
  });
  it("Ansichtswechsel räumt eine unberührt per Enter angelegte Zeile weg — ohne Wiederholen-Schritt (Entscheidung 8)", async () => {
    await zeige(plan(), "gliederung");
    const feld = query<HTMLInputElement>('[data-zeile="a"] input[name="titel"]');
    await act(async () => { feld.focus(); });
    await taste("Enter", {}, feld);
    expect(queryAll("[data-zeile]")).toHaveLength(4);
    await clickElement(radio("Diagramm"));
    expect(queryAll("[data-zeile]")).toHaveLength(3);
    expect(knopf("Wiederholen").disabled).toBe(true);
  });
  it("Einfügen in der Gliederung ist EIN Schritt: „Rückgängig“ der Kopfleiste nimmt den ganzen Teilbaum zurück", async () => {
    await zeige(plan(), "gliederung");
    const feld = query<HTMLInputElement>('[data-zeile="a"] input[name="titel"]');
    await act(async () => { feld.focus(); });
    const e = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(e, "clipboardData", { value: { getData: () => "X\n\tY\n\tZ" } });
    await act(async () => { feld.dispatchEvent(e); });
    expect(queryAll("[data-zeile]")).toHaveLength(6);
    await clickElement(knopf("Rückgängig"));
    expect(queryAll("[data-zeile]")).toHaveLength(3);
  });
});

describe("Gliederung im Editor, Review Phase 3", () => {
  const radio = (name: string) =>
    [...query('[role="radiogroup"][aria-label="Ansicht"]').querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((r) => r.closest("label")!.textContent === name)!;
  const titelFeld = (id: string) => query<HTMLInputElement>(`.kp-gliederung [data-zeile="${id}"] input[name="titel"]`);
  const zeilen = () => queryAll(".kp-gliederung [data-zeile]").length;
  const warte = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

  it("F2 und Strg+Enter auf einer eben per Enter angelegten Zeile öffnen ihre Details — die Zeile bleibt", async () => {
    await zeige(plan(), "gliederung");
    await act(async () => { titelFeld("a").focus(); });
    await taste("Enter", {}, titelFeld("a"));
    expect(zeilen()).toBe(4);
    await taste("F2", {}, document.activeElement!);
    await warte(400);
    expect(zeilen()).toBe(4);
    expect(flyinOffen()).toBe(true);
    expect(document.activeElement).toBe(flyinFeld());
  });
  it("… ebenso Strg+Enter", async () => {
    await zeige(plan(), "gliederung");
    await act(async () => { titelFeld("a").focus(); });
    await taste("Enter", {}, titelFeld("a"));
    await taste("Enter", { ctrlKey: true }, document.activeElement!);
    await warte(400);
    expect(zeilen()).toBe(4);
    expect(flyinOffen()).toBe(true);
  });
  it("„Rückgängig“ der Kopfleiste direkt nach Enter nimmt genau EINEN Schritt zurück — wie Strg+Z im Titel", async () => {
    await zeige(plan(), "gliederung");
    await act(async () => { titelFeld("a").focus(); });
    await schreibe(titelFeld("a"), "EA 1 geändert");
    await taste("Enter", {}, titelFeld("a"));
    expect(zeilen()).toBe(4);
    await act(async () => { knopf("Rückgängig").focus(); }); // Chrome: der Knopf nimmt beim Klick den Fokus
    await clickElement(knopf("Rückgängig"));
    expect(zeilen()).toBe(3);
    expect(titelFeld("a").value).toBe("EA 1 geändert");
    // „Wiederholen“ holt die leere Zeile zurück — und das nächste Verlassen verwirft den wiederholten Schritt nicht still
    await clickElement(knopf("Wiederholen"));
    expect(zeilen()).toBe(4);
    const neu = queryAll<HTMLInputElement>(".kp-gliederung [data-zeile] input[name='titel']").find((i) => i.value === "")!;
    await act(async () => { neu.focus(); });
    await act(async () => { titelFeld("el").focus(); });
    expect(zeilen()).toBe(4);
  });
  it("… ebenso ohne Fokuswechsel auf den Knopf (Safari): EIN Schritt, und ein wiederholter Enter-Schritt bleibt beim Verlassen stehen", async () => {
    await zeige(plan(), "gliederung");
    await act(async () => { titelFeld("a").focus(); });
    await schreibe(titelFeld("a"), "EA 1 geändert");
    await taste("Enter", {}, titelFeld("a"));
    await clickElement(knopf("Rückgängig")); // der Titel behält den Fokus bis zum Klick
    expect(zeilen()).toBe(3);
    expect(titelFeld("a").value).toBe("EA 1 geändert");
    await clickElement(knopf("Wiederholen"));
    const neu = queryAll<HTMLInputElement>(".kp-gliederung [data-zeile] input[name='titel']").find((i) => i.value === "")!;
    await act(async () => { neu.focus(); });
    await act(async () => { titelFeld("el").focus(); });
    expect(zeilen()).toBe(4);
  });
  it("„Rückgängig“ und „Wiederholen“ nehmen dem Titel beim Zeigerdruck nicht den Fokus (Safari fokussiert Knöpfe beim Klick nicht)", async () => {
    await zeige(plan(), "gliederung");
    await act(async () => { titelFeld("a").focus(); });
    await schreibe(titelFeld("a"), "EA 1 neu"); // sonst ist „Rückgängig“ deaktiviert
    const e = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    await act(async () => { knopf("Rückgängig").dispatchEvent(e); });
    expect(e.defaultPrevented).toBe(true);
  });
  it("Ansichtswechsel verwirft einen reinen Bedienhinweis der Gliederung; ein Lösch-Hinweis mit „Rückgängig“ bleibt", async () => {
    await zeige(plan(), "gliederung");
    await act(async () => { titelFeld("a").focus(); });
    await taste("Tab", {}, titelFeld("a"));
    expect(query(".kp-gliederung [data-meldung]").textContent).toContain("nicht einrücken");
    await clickElement(radio("Diagramm"));
    expect(exists(".kp-betrachter [data-meldung]")).toBe(false);
    await waehle("a");
    query<HTMLElement>(".kp-betrachter").focus();
    await taste("Delete");
    expect(query(".kp-betrachter [data-meldung]").textContent).toContain("gelöscht");
    await clickElement(radio("Gliederung"));
    expect(query(".kp-gliederung [data-meldung]").textContent).toContain("gelöscht");
  });
  it("Strg/Cmd+Z mit Fokus auf body bei sichtbarer Gliederung holt den Fokus in die Zeile zurück (Entscheidung 10)", async () => {
    await zeige(plan(), "gliederung");
    await act(async () => { titelFeld("a").focus(); });
    await schreibe(titelFeld("a"), "EA 1 neu");
    await act(async () => { (document.activeElement as HTMLElement).blur(); });
    expect(document.activeElement).toBe(document.body);
    await taste("z", { ctrlKey: true }, document.body);
    expect(titelFeld("a").value).toBe("EA 1");
    expect(document.activeElement).toBe(titelFeld("a"));
  });
  it("Umschalten in die Gliederung holt die gewählte Zeile ins Bild (zeige)", async () => {
    const gerollt = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", { value: gerollt, configurable: true, writable: true });
    try {
      await zeige(plan(), "diagramm");
      await waehle("s");
      gerollt.mockClear();
      await clickElement(radio("Gliederung"));
      await warte(50);
      expect(gerollt.mock.contexts).toContain(query('.kp-gliederung [data-zeile="s"]'));
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });
  it("eine frische Kopie meldet sich einmal: Datum auf heute, „Angaben ändern“ öffnet die Angaben (Entscheidung 9)", async () => {
    await mount(<Editor plan={plan()} symbole={{}} zeichenIndex={[]} schrift="Arimo" kopieHinweis="Kopie angelegt — Titel und Datum stehen auf 01.10.2026." />);
    await act(async () => {});
    expect(document.body.textContent).toContain("Kopie angelegt — Titel und Datum stehen auf 01.10.2026.");
    await clickElement(knopf("Angaben ändern"));
    expect(existsPortal('.kp-flyin [data-abschnitt="verbindungen"]')).toBe(true); // das Flyin „Plan und Verbindungen" ist offen
  });
});
