// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { clickElement, fill, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { Planangaben } from "../../_lib/angaben";
import { baue } from "../../_lib/beispiele/bau";
import { PlanFehler } from "../../_lib/plan/operationen";
import type { PlanInhalt } from "../../_lib/plan/schema";
import type { Aendere } from "./aendere";
import { PlanFormular } from "./PlanFlyin";

const START = baue({
  verbindungen: [
    { id: "v1", art: "tmo", bezeichnung: "R_UE_2" }, { id: "v2", art: "dmo", bezeichnung: "DMO 608" }, { id: "v3", art: "tmo", bezeichnung: "K_UE_2" },
  ],
  stellen: [{ id: "el", titel: "EL" }, { id: "a", titel: "EA", eltern: "el", verbindung: "v1", kanaele: ["v2"] }],
});
const ANGABEN: Planangaben = { titel: "Übung", typ: "kommunikationsplan", anlass: null, datum: "2026-09-30" };
let stand: PlanInhalt = START;
const speichere = vi.fn();
const entwurf = vi.fn();
function Rahmen() {
  const [inhalt, setInhalt] = useState(START);
  const aendere: Aendere = (op) => {
    try { const neu = op(inhalt); setInhalt(neu); stand = neu; return null; }
    catch (e) { if (e instanceof PlanFehler) return e.message; throw e; }
  };
  return <PlanFormular angaben={ANGABEN} inhalt={inhalt} aendere={aendere} speichereAngaben={speichere} onEntwurf={entwurf} />;
}
const knopf = (text: string) => queryAll<HTMLButtonElement>("button").find((b) => b.textContent === text)!;
const zeile = (id: string) => query(`[data-verbindung-zeile="${id}"]`);
/** Feld betreten, Wert setzen, Feld verlassen — so, wie der Browser es tut. */
async function tippeUndVerlasse(selector: string, wert: string) {
  const el = query<HTMLInputElement>(selector);
  await act(async () => { el.focus(); });
  await fill(selector, wert);
  await act(async () => { el.blur(); });
  await act(async () => {});
}
async function druecke(el: Element, key: string) {
  await act(async () => { el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); });
  await act(async () => {});
}
afterEach(async () => { await unmount(); stand = START; speichere.mockReset(); entwurf.mockReset(); });
const OK = { ok: true, version: 2, aktualisiertAm: 1 } as const;
/** Ein Aufruf, der hängt, bis der Test ihn auflöst — wie eine langsame Action oder eine volle Warteschlange. */
function haengend() {
  let loese: (r: unknown) => void = () => {};
  speichere.mockImplementationOnce(() => new Promise((r) => { loese = r; }));
  return (r: unknown = OK) => act(async () => { loese(r); });
}
/** antds Select öffnet auf `mousedown`; die Liste hängt im Portal (Vorbild JournalFilter.test.tsx). */
async function waehleOption(eingabe: HTMLElement, text: string) {
  await act(async () => { eingabe.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); });
  const option = [...document.querySelectorAll<HTMLElement>(".ant-select-item-option")].filter((o) => o.offsetParent !== undefined)
    .reverse().find((o) => o.textContent === text);
  if (!option) throw new Error(`Option fehlt: ${text}`);
  await clickElement(option);
  await act(async () => {});
}
const feldZu = (name: string) => document.getElementById([...document.querySelectorAll("label")].find((l) => l.textContent === name)!.htmlFor)!;

describe("Plan-Flyin", () => {
  it("Planangaben speichern sich beim Verlassen des Felds — kein „Übernehmen“ (Entscheidung 3)", async () => {
    speichere.mockResolvedValue({ ok: true, version: 2, aktualisiertAm: 1 });
    await mount(<Rahmen />);
    expect(queryAll("button").some((b) => b.textContent === "Übernehmen")).toBe(false);
    await tippeUndVerlasse('input[name="anlass"]', "Probe");
    expect(speichere).toHaveBeenCalledWith({ titel: "Übung", typ: "kommunikationsplan", anlass: "Probe", datum: "2026-09-30" });
    expect(entwurf).toHaveBeenCalledWith(true);
    expect(entwurf).toHaveBeenLastCalledWith(false);
  });
  it("Enter im Textfeld speichert ebenfalls", async () => {
    speichere.mockResolvedValue({ ok: true, version: 2, aktualisiertAm: 1 });
    await mount(<Rahmen />);
    await fill('input[name="titel"]', "Übung Nord");
    await druecke(query('input[name="titel"]'), "Enter");
    expect(speichere).toHaveBeenCalledWith(expect.objectContaining({ titel: "Übung Nord" }));
  });
  it("Unverändertes wird nie gesendet — auch nicht beim Verlassen (Review Focus 6: Seed-Pläne bleiben unberührt)", async () => {
    await mount(<Rahmen />);
    await tippeUndVerlasse('input[name="titel"]', "Übung");
    await tippeUndVerlasse('input[name="anlass"]', "  ");
    expect(speichere).not.toHaveBeenCalled();
  });
  it("Feldfehler stehen am Feld: aria-invalid und aria-describedby zeigen auf den Text", async () => {
    speichere.mockResolvedValue({ ok: false, grund: "ungueltig", fehler: "Bitte die markierten Felder prüfen.", feldFehler: { titel: "Bitte einen Titel eintragen." } });
    await mount(<Rahmen />);
    await tippeUndVerlasse('input[name="titel"]', "  ");
    const titel = query('input[name="titel"]');
    expect(titel.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(titel.getAttribute("aria-describedby")!)?.textContent).toBe("Bitte einen Titel eintragen.");
    expect(entwurf).not.toHaveBeenLastCalledWith(false); // der Entwurf ist nicht gespeichert
  });
  it("zurück auf den alten Wert, während das erste Speichern noch läuft: auch das wird gesendet (Review Phase 2)", async () => {
    const los = haengend();
    speichere.mockResolvedValue(OK);
    await mount(<Rahmen />);
    await tippeUndVerlasse('input[name="anlass"]', "Probe");
    await tippeUndVerlasse('input[name="anlass"]', "");
    await los();
    await act(async () => {});
    expect(speichere.mock.calls.map((c) => c[0].anlass)).toEqual(["Probe", ""]);
    expect(entwurf).toHaveBeenLastCalledWith(false);
  });
  it("die Antwort auf einen älteren Stand meldet keinen gespeicherten Entwurf, solange Neueres getippt ist", async () => {
    const los = haengend();
    await mount(<Rahmen />);
    await tippeUndVerlasse('input[name="anlass"]', "Probe");
    await fill('input[name="anlass"]', "Probe 2"); // getippt, Feld nicht verlassen
    await los();
    expect(entwurf).toHaveBeenLastCalledWith(true);
  });
  it("ein misslungenes Speichern gilt nicht als gesendet: dasselbe Feld noch einmal verlassen sendet erneut", async () => {
    speichere.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(OK);
    await mount(<Rahmen />);
    await tippeUndVerlasse('input[name="anlass"]', "Probe");
    expect(document.body.textContent).toContain("Nicht gespeichert — prüfe die Verbindung");
    await tippeUndVerlasse('input[name="anlass"]', "Probe");
    expect(speichere).toHaveBeenCalledTimes(2);
    expect(entwurf).toHaveBeenLastCalledWith(false);
  });
  it("Art: die Wahl speichert sofort; zwei schnelle Wahlen zurück zum alten Wert senden beide", async () => {
    const los = haengend();
    speichere.mockResolvedValue(OK);
    await mount(<Rahmen />);
    await waehleOption(feldZu("Art"), "Fernmeldeskizze");
    expect(speichere).toHaveBeenLastCalledWith(expect.objectContaining({ typ: "fernmeldeskizze" }));
    await waehleOption(feldZu("Art"), "Kommunikationsplan");
    await los();
    await act(async () => {});
    expect(speichere.mock.calls.map((c) => c[0].typ)).toEqual(["fernmeldeskizze", "kommunikationsplan"]);
  });
  it("Datum: die Wahl speichert sofort", async () => {
    speichere.mockResolvedValue(OK);
    await mount(<Rahmen />);
    await clickElement(feldZu("Datum"));
    const tag = [...document.querySelectorAll<HTMLElement>(".ant-picker-cell")].find((z) => z.getAttribute("title") === "2026-09-15");
    await clickElement(tag!);
    await act(async () => {});
    expect(speichere).toHaveBeenLastCalledWith(expect.objectContaining({ datum: "2026-09-15" }));
  });
  it("Verbindung: Art ändern wirkt sofort im Dokument", async () => {
    await mount(<Rahmen />);
    await waehleOption(query('[data-verbindung-zeile="v3"] input[aria-label="Verbindung 3: Art"]'), "Digitalfunk DMO");
    expect(stand.verbindungen.find((v) => v.id === "v3")?.art).toBe("dmo");
  });
  it("Optionen: Leerzeilen und VS-NfD-Vermerk schalten im Dokument", async () => {
    await mount(<Rahmen />);
    await clickElement(query('[data-option="leerzeilen"]'));
    await clickElement(query('[data-option="vermerkVsNfD"]'));
    expect(stand.optionen).toMatchObject({ leerzeilen: true, vermerkVsNfD: false });
  });
  it("Verbindungen: Nutzung ablesbar, Reserve als Chip, löschen nur unbenutzt — ein reiner Kanal ist benutzt (Review Focus 4)", async () => {
    await mount(<Rahmen />);
    expect(zeile("v1").textContent).toContain("Weg zu 1 Stelle");
    expect(zeile("v2").textContent).toContain("Kanal an 1 Stelle");
    expect(zeile("v3").querySelector(".kp-chip")?.textContent).toBe("Reserve");
    expect(zeile("v1").querySelector<HTMLButtonElement>('button[aria-label="Verbindung 1 (R_UE_2) löschen"]')!.disabled).toBe(true);
    expect(zeile("v2").querySelector<HTMLButtonElement>('button[aria-label="Verbindung 2 (DMO 608) löschen"]')!.disabled).toBe(true);
    await clickElement(zeile("v3").querySelector<HTMLButtonElement>('button[aria-label="Verbindung 3 (K_UE_2) löschen"]')!);
    expect(stand.verbindungen.map((v) => v.id)).toEqual(["v1", "v2"]);
  });
  it("umbenennen wirkt sofort; ein geleertes Feld ändert nichts und sagt warum", async () => {
    await mount(<Rahmen />);
    await fill('[data-verbindung-zeile="v1"] input[aria-label="Verbindung 1: Bezeichnung"]', "R_UE_9");
    expect(stand.verbindungen[0].bezeichnung).toBe("R_UE_9");
    await fill('[data-verbindung-zeile="v1"] input[aria-label="Verbindung 1: Bezeichnung"]', "  ");
    expect(stand.verbindungen[0].bezeichnung).toBe("R_UE_9");
    expect(zeile("v1").textContent).toContain("Die Verbindung braucht eine Bezeichnung.");
  });
  it("neue Verbindung anlegen — per Knopf oder Enter; sie ist zunächst Reserve", async () => {
    await mount(<Rahmen />);
    await fill('input[aria-label="Bezeichnung der neuen Verbindung"]', "Standleitung");
    await clickElement(knopf("Verbindung anlegen"));
    expect(stand.verbindungen.at(-1)).toMatchObject({ bezeichnung: "Standleitung", art: "tmo" });
    await fill('input[aria-label="Bezeichnung der neuen Verbindung"]', "Reserve 2");
    await druecke(query('input[aria-label="Bezeichnung der neuen Verbindung"]'), "Enter");
    expect(stand.verbindungen.at(-1)).toMatchObject({ bezeichnung: "Reserve 2" });
    expect(queryAll(".kp-chip").map((c) => c.textContent)).toEqual(["Reserve", "Reserve", "Reserve"]);
  });
});
