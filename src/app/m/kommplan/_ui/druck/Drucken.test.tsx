// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { clickElement, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { Drucken } from "./Drucken";

afterEach(() => { unmount(); vi.restoreAllMocks(); });

describe("Drucken", () => {
  it("ruft print() erst, wenn die Schriften geladen sind", async () => {
    let freigeben: () => void = () => {};
    const bereit = new Promise<void>((r) => { freigeben = r; });
    Object.defineProperty(document, "fonts", { value: { ready: bereit }, configurable: true });
    const druck = vi.spyOn(window, "print").mockImplementation(() => {});
    await mount(<Drucken />);
    expect(druck).not.toHaveBeenCalled();
    await act(async () => { freigeben(); await bereit; });
    expect(druck).toHaveBeenCalledTimes(1);
  });
  it("automatisch={false} (SVG-Weg): kein Druckdialog beim Laden, der Knopf druckt weiter", async () => {
    Object.defineProperty(document, "fonts", { value: { ready: Promise.resolve() }, configurable: true });
    const drucke = vi.spyOn(window, "print").mockImplementation(() => {});
    await mount(<Drucken automatisch={false} />);
    await act(async () => { await document.fonts?.ready; });
    expect(drucke).not.toHaveBeenCalled();
    await clickElement(query("button"));
    expect(drucke).toHaveBeenCalledTimes(1);
    drucke.mockRestore();
  });
});
