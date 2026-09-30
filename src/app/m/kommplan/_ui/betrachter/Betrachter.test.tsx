// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { click, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { BEISPIELE } from "../../_lib/beispiele";
import { baue } from "../../_lib/beispiele/bau";
import { leererPlan } from "../../_lib/plan/operationen";
import { Betrachter } from "./Betrachter";
import { umschalterLage } from "./umschalter";

afterEach(() => unmount());
const einsatz = BEISPIELE[0];
const zeige = () => mount(<Betrachter inhalt={einsatz.inhalt} symbole={{}} titel={einsatz.titel} schrift="Arimo" />);

/** transform="translate(x y) scale(m)" der Ansicht. */
function ansicht(): { x: number; y: number; m: number } {
  const t = query("[data-ansicht]").getAttribute("transform")!;
  const [, x, y, m] = /translate\(([-\d.e]+) ([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(t)!.map(Number);
  return { x, y, m };
}
/** jsdom kennt kein PointerEvent: ein MouseEvent mit pointerId reicht Reacts onPointer*. */
function zeiger(el: Element, typ: string, id: number, x: number, y: number): void {
  const e = new MouseEvent(typ, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(e, "pointerId", { value: id });
  el.dispatchEvent(e);
}
const flaeche = () => query(".kp-betrachter");

describe("Betrachter", () => {
  it("zeigt alle Karten; Einklappen der EL lässt nur Leitstelle und EL stehen, mit Abzeichen", async () => {
    await zeige();
    expect(queryAll("[data-karte]")).toHaveLength(6);
    await click('[data-umschalter="el"]');
    expect(queryAll("[data-karte]").map((k) => k.getAttribute("data-karte"))).toEqual(["lts", "el"]);
    expect(query("[data-abzeichen]").textContent).toBe("+4 Stellen");
    expect(query('[data-umschalter="el"]').getAttribute("aria-expanded")).toBe("false");
    await click('[data-umschalter="el"]');
    expect(queryAll("[data-karte]")).toHaveLength(6);
  });
  it("der Umschalter sitzt unten rechts auf der Kartenecke, nicht mitten auf der Unterkante", async () => {
    await zeige();
    const kreis = queryAll('[data-umschalter="el"] circle').at(-1)!;
    const karte = query('[data-karte="el"] rect');
    const soll = umschalterLage({ breite: Number(karte.getAttribute("width")), hoehe: Number(karte.getAttribute("height")) });
    expect([Number(kreis.getAttribute("cx")), Number(kreis.getAttribute("cy"))]).toEqual([soll.cx, soll.cy]);
    expect(soll.cx).toBe(Number(karte.getAttribute("width")));
  });
  it("Tastatur: + vergrößert, − verkleinert, 0 passt wieder ein", async () => {
    await zeige();
    const vorher = ansicht();
    const taste = (key: string) => act(async () => { flaeche().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); });
    await taste("+");
    expect(ansicht().m).toBeCloseTo(vorher.m * 1.25, 9);
    await taste("-");
    await taste("-");
    expect(ansicht().m).toBeCloseTo(vorher.m / 1.25, 9);
    await taste("0");
    expect(ansicht()).toEqual(vorher);
  });
  it("Ziehen mit Maus oder Finger verschiebt um genau die Zeigerbewegung", async () => {
    await zeige();
    const vorher = ansicht();
    await act(async () => {
      zeiger(flaeche(), "pointerdown", 1, 100, 100);
      zeiger(flaeche(), "pointermove", 1, 130, 90);
      zeiger(flaeche(), "pointermove", 1, 140, 80);
      zeiger(flaeche(), "pointerup", 1, 140, 80);
    });
    expect(ansicht()).toEqual({ x: vorher.x + 40, y: vorher.y - 20, m: vorher.m });
    await act(async () => { zeiger(flaeche(), "pointermove", 1, 200, 200); }); // nach dem Loslassen: nichts
    expect(ansicht()).toEqual({ x: vorher.x + 40, y: vorher.y - 20, m: vorher.m });
  });
  it("zwei Finger auseinander zoomen um das Verhältnis der Abstände", async () => {
    await zeige();
    const vorher = ansicht();
    await act(async () => {
      zeiger(flaeche(), "pointerdown", 1, 100, 100);
      zeiger(flaeche(), "pointerdown", 2, 200, 100);
      zeiger(flaeche(), "pointermove", 2, 300, 100);
    });
    expect(ansicht().m).toBeCloseTo(vorher.m * 2, 9);
  });
  it("ein Druck auf den Umschalter beginnt kein Ziehen", async () => {
    await zeige();
    const vorher = ansicht();
    await act(async () => {
      zeiger(query('[data-umschalter="el"]'), "pointerdown", 1, 100, 100);
      zeiger(flaeche(), "pointermove", 1, 150, 150);
    });
    expect(ansicht()).toEqual(vorher);
  });
  it("Rad verschiebt, Rad mit Strg zoomt", async () => {
    await zeige();
    const vorher = ansicht();
    await act(async () => { flaeche().dispatchEvent(new WheelEvent("wheel", { deltaX: 10, deltaY: 30, bubbles: true, cancelable: true })); });
    expect(ansicht()).toEqual({ x: vorher.x - 10, y: vorher.y - 30, m: vorher.m });
    await act(async () => { flaeche().dispatchEvent(new WheelEvent("wheel", { deltaY: -300, ctrlKey: true, bubbles: true, cancelable: true })); });
    expect(ansicht().m).toBeCloseTo(vorher.m * Math.E, 6);
  });
  it("Legende unter der Zeichnung: verwendete Arten und Reservekanäle, auch eingeklappt vollständig", async () => {
    await zeige();
    const texte = () => queryAll(".kp-legende li").map((li) => li.textContent);
    const alle = texte();
    expect(alle).toContain("Reserve K_UE_2");
    expect(alle).toContain("Digitalfunk TMO");
    await click('[data-umschalter="el"]');
    expect(texte()).toEqual(alle);
  });
  it("leerer Plan: ein Hinweis statt einer leeren Fläche", async () => {
    await mount(<Betrachter inhalt={leererPlan()} symbole={{}} titel="leer" schrift="Arimo" />);
    expect(document.body.textContent).toContain("Dieser Plan hat noch keine Stellen.");
    expect(queryAll(".kp-legende")).toHaveLength(0);
  });
  it("Plan nur mit Reservekanälen: Legende samt Symbolen, obwohl keine Zeichnung da ist", async () => {
    const inhalt = { ...leererPlan(), verbindungen: [{ id: "k", art: "tmo" as const, bezeichnung: "K_UE_2" }] };
    await mount(<Betrachter inhalt={inhalt} symbole={{}} titel="nur Reserve" schrift="Arimo" />);
    expect(queryAll(".kp-legende li").map((li) => li.textContent)).toEqual(["Reserve K_UE_2"]);
    expect(queryAll("symbol#kp-comms-voice-radio-tmo")).toHaveLength(1);
  });
  it("eine Verbindung an einer Wurzel steht als Reserve da", async () => {
    const inhalt = baue({ verbindungen: [{ id: "d", art: "draht", bezeichnung: "Standleitung" }], stellen: [{ id: "a", titel: "A", verbindung: "d" }] });
    await mount(<Betrachter inhalt={inhalt} symbole={{}} titel="x" schrift="Arimo" />);
    expect(queryAll(".kp-legende li").map((li) => li.textContent)).toEqual(["Reserve Standleitung"]);
  });
});
