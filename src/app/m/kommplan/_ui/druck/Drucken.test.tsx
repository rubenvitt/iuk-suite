// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { mount, unmount } from "@/app/m/qr/_lib/test-dom";
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
});
