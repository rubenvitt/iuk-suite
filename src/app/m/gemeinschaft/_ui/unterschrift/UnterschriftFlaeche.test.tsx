// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createRef } from "react";
import { clickElement, exists, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { UnterschriftFlaeche, type Unterschriftflaeche } from "./UnterschriftFlaeche";

afterEach(unmount);

function zieh(c: HTMLCanvasElement) {
  for (const [typ, x] of [["pointerdown", 10], ["pointermove", 40], ["pointerup", 40]] as const) {
    c.dispatchEvent(new MouseEvent(typ, { bubbles: true, clientX: x, clientY: 20 }));
  }
}

describe("Unterschriftfläche", () => {
  it("zeichnet erst nach „Hier unterschreiben“", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    const ctx = { scale() {}, beginPath: vi.fn(), moveTo() {}, lineTo() {}, stroke: vi.fn(), save() {}, restore() {}, setTransform() {}, clearRect() {} };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    // jsdom kennt kein Pointer Capture.
    HTMLCanvasElement.prototype.setPointerCapture ??= () => {};
    const onLeer = vi.fn();
    const ref = createRef<Unterschriftflaeche>();
    await mount(<UnterschriftFlaeche ref={ref} beschriftetVon="x" onLeer={onLeer} />);
    const c = query<HTMLCanvasElement>('[data-testid="unterschrift-flaeche"]');
    expect(c.dataset.aktiv).toBe("false");

    await act(async () => zieh(c));
    expect(ctx.stroke).not.toHaveBeenCalled();
    expect(onLeer).not.toHaveBeenCalledWith(false);

    await clickElement(query('[data-testid="unterschrift-flaeche-start"]'));
    expect(exists('[data-testid="unterschrift-flaeche-start"]')).toBe(false);
    expect(c.dataset.aktiv).toBe("true");
    await act(async () => zieh(c));
    expect(ctx.stroke).toHaveBeenCalled();
    expect(onLeer).toHaveBeenLastCalledWith(false);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
