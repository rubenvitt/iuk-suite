// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { clickElement, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { DruckMenue } from "./DruckMenue";

afterEach(async () => { await unmount(); });
const punkte = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
const pfeil = () => query<HTMLButtonElement>('button[aria-label="Weitere Druckformate"]');
async function oeffne() {
  await clickElement(pfeil());
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
// rc-menu aktiviert einen Punkt per Enter nur bei `e.which === 13` (@rc-component/menu, MenuItem); React leitet
// `which` aus `keyCode` ab, und jsdom setzt keyCode bei `{ key: "Enter" }` allein auf 0 — also beides angeben.
const enter = () => new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true, cancelable: true });

describe("DruckMenue (Entscheidung 12)", () => {
  it("„Drucken“ druckt A4 quer mit EINEM Klick; der Pfeil öffnet die zwei Formate in fester Reihenfolge", async () => {
    const wahl = vi.fn();
    await mount(<DruckMenue onWahl={wahl} />);
    expect(queryAll<HTMLButtonElement>("button").map((b) => b.textContent || b.getAttribute("aria-label"))).toEqual(["Drucken", "Weitere Druckformate"]);
    await clickElement(queryAll<HTMLButtonElement>("button")[0]);
    expect(wahl).toHaveBeenLastCalledWith({ format: "a4", svg: false });
    expect(pfeil().getAttribute("aria-haspopup")).toBe("menu");
    await oeffne();
    expect(punkte().map((p) => p.textContent)).toEqual(["A4 quer", "A3 quer"]);
  });
  it("mit basis: …/druck/a4 bzw. …/druck/a3 in einem neuen Tab — Hauptknopf, Klick und Enter im Menü", async () => {
    const auf = vi.spyOn(window, "open").mockReturnValue(null);
    await mount(<DruckMenue basis="/t/TOKEN" />);
    await clickElement(queryAll<HTMLButtonElement>("button")[0]);
    expect(auf).toHaveBeenLastCalledWith("/t/TOKEN/druck/a4", "_blank", "noopener");
    await oeffne();
    expect(punkte().some((p) => p.querySelector("a"))).toBe(false); // keine Anker: antd aktiviert per Enter nur onClick
    await clickElement(punkte()[1]);
    expect(auf).toHaveBeenLastCalledWith("/t/TOKEN/druck/a3", "_blank", "noopener");
    auf.mockClear();
    await oeffne();
    await act(async () => { punkte()[0].dispatchEvent(enter()); });
    await act(async () => {});
    expect(auf).toHaveBeenLastCalledWith("/t/TOKEN/druck/a4", "_blank", "noopener");
    auf.mockRestore();
  });
  it("mit onWahl: der Aufrufer entscheidet (Editor speichert vorher)", async () => {
    const wahl = vi.fn();
    await mount(<DruckMenue onWahl={wahl} />);
    await oeffne();
    await clickElement(punkte()[1]);
    expect(wahl).toHaveBeenCalledWith({ format: "a3", svg: false });
  });
  it("mitSvg (intern): Gruppe „SVG-Dateien“ öffnet die Druckroute mit ?export=svg — ohne Druckdialog", async () => {
    const auf = vi.spyOn(window, "open").mockReturnValue(null);
    await mount(<DruckMenue basis="/p/x" mitSvg />);
    await oeffne();
    expect(punkte().map((p) => p.textContent)).toEqual(["A4 quer", "A3 quer", "SVG – A4 quer", "SVG – A3 quer"]);
    await clickElement(punkte()[3]);
    expect(auf).toHaveBeenLastCalledWith("/p/x/druck/a3?export=svg", "_blank", "noopener");
    auf.mockRestore();
  });
});
