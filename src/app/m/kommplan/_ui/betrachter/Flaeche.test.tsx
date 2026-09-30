// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createRef } from "react";
import { exists, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { BEISPIELE } from "../../_lib/beispiele";
import { layout } from "../../_lib/layout/layout";
import { leererPlan } from "../../_lib/plan/operationen";
import { Flaeche, type FlaecheGriff } from "./Flaeche";

afterEach(async () => { await unmount(); });
const daten = layout(BEISPIELE[0].inhalt, "bildschirm");
/** jsdom kennt kein PointerEvent: ein MouseEvent mit pointerId reicht Reacts onPointer*. */
function zeiger(el: Element, typ: string, x: number, y: number, zeit = 0): void {
  const e = new MouseEvent(typ, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(e, "pointerId", { value: 1 });
  Object.defineProperty(e, "timeStamp", { value: zeit });
  el.dispatchEvent(e);
}
const zeige = (mehr: Partial<Parameters<typeof Flaeche>[0]> = {}) =>
  mount(<Flaeche daten={daten} symbole={{}} titel="T" schrift="Arimo" bedienhinweis="Hinweis" leer={<p>leer</p>} {...mehr} />);

describe("Fläche", () => {
  it("ein Druck ohne Bewegung auf eine Karte ist ein Klick auf diese Karte; zweimal kurz hintereinander ein Doppelklick", async () => {
    const klick = vi.fn();
    await zeige({ onKarteKlick: klick });
    const karte = query('[data-karte="el"] rect');
    await act(async () => { zeiger(karte, "pointerdown", 50, 50, 1000); zeiger(karte, "pointerup", 51, 50, 1050); });
    await act(async () => { zeiger(karte, "pointerdown", 50, 50, 1200); zeiger(karte, "pointerup", 50, 50, 1250); });
    expect(klick.mock.calls).toEqual([["el", false], ["el", true]]);
  });
  it("Ziehen ist kein Klick; ein Klick daneben meldet null", async () => {
    const klick = vi.fn();
    await zeige({ onKarteKlick: klick });
    const flaeche = query(".kp-betrachter");
    await act(async () => { zeiger(query('[data-karte="el"] rect'), "pointerdown", 50, 50); zeiger(flaeche, "pointermove", 90, 50); zeiger(flaeche, "pointerup", 90, 50); });
    expect(klick).not.toHaveBeenCalled();
    await act(async () => { zeiger(flaeche, "pointerdown", 5, 5, 5000); zeiger(flaeche, "pointerup", 5, 5, 5010); });
    expect(klick).toHaveBeenCalledWith(null, false);
  });
  it("onTaste geht vor: wer true meldet, bekommt die Taste allein (keine Verschiebung)", async () => {
    await zeige({ onTaste: (e) => e.key === "ArrowLeft" });
    const vorher = query("[data-ansicht]").getAttribute("transform");
    await act(async () => { query(".kp-betrachter").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })); });
    expect(query("[data-ansicht]").getAttribute("transform")).toBe(vorher);
    await act(async () => { query(".kp-betrachter").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    expect(query("[data-ansicht]").getAttribute("transform")).not.toBe(vorher);
  });
  it("die Überlagerung bekommt die aktuelle Ansicht und liegt in der Fläche", async () => {
    await zeige({ ueberlagerung: (a) => <span data-test-ansicht={`${a.x},${a.y},${a.massstab}`} /> });
    expect(query(".kp-betrachter .kp-ueberlagerung [data-test-ansicht]").getAttribute("data-test-ansicht")).toBe("16,16,4");
  });
  it("die Meldung steht in der Fläche — auch wenn der Plan leer ist (Entscheidung 19)", async () => {
    await mount(<Flaeche daten={layout(leererPlan(), "bildschirm")} symbole={{}} titel="T" schrift="Arimo" bedienhinweis="Hinweis"
      leer={<p>leer</p>} meldung={<span data-test-meldung="" />} />);
    expect(exists(".kp-betrachter [data-test-meldung]")).toBe(true);
  });
  it("fokus() setzt den Fokus auf die Fläche (Entscheidung 17)", async () => {
    const griff = createRef<FlaecheGriff>();
    await zeige({ griff });
    (document.activeElement as HTMLElement | null)?.blur();
    await act(async () => { griff.current!.fokus(); });
    expect(document.activeElement).toBe(query(".kp-betrachter"));
  });
  it("gleitend: die Ansicht trägt zusätzlich einen CSS-Transform; das Attribut bleibt (Phase-1-Tests lesen es)", async () => {
    await zeige({ gleitend: true });
    const g = query("[data-ansicht]");
    expect(g.getAttribute("transform")).toBe("translate(16 16) scale(4)");
    expect(g.style.transform).toBe("translate(16px, 16px) scale(4)");
    expect(g.getAttribute("class")).toBe("kp-gleitet"); // eingepasst = automatisch → gleitet
    // Normalisiert jsdom (cssstyle) den Wert anders, auf toContain("translate(16px") ausweichen — nie die Zusage streichen.
  });
  it("ein Druck auf einen Knopf in der Fläche fängt den Zeiger nicht — sonst ginge der Klick an die Fläche statt an den Knopf", async () => {
    const leer = layout(leererPlan(), "bildschirm");
    await mount(<Flaeche daten={leer} symbole={{}} titel="T" schrift="Arimo" bedienhinweis="Hinweis" leer={<button type="button" data-test-leer="">Erste Stelle anlegen</button>} />);
    const fang = vi.fn();
    Object.defineProperty(query(".kp-betrachter"), "setPointerCapture", { value: fang });
    await act(async () => { zeiger(query("[data-test-leer]"), "pointerdown", 5, 5); zeiger(query("[data-test-leer]"), "pointerup", 5, 5); });
    expect(fang).not.toHaveBeenCalled();
    await act(async () => { zeiger(query(".kp-betrachter"), "pointerdown", 5, 5); });
    expect(fang).toHaveBeenCalledTimes(1);
  });
  it("defs={false}: die Fläche bringt keinen eigenen Symbolvorrat mit (der Editor hält ihn, Phase 3, Entscheidung 17)", async () => {
    await zeige({ defs: false });
    expect(exists("symbol")).toBe(false);
    await unmount();
    await zeige();
    expect(exists("symbol")).toBe(true);
  });
});
