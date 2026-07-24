// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BarChart } from "./BarChart";

/**
 * jsdom kennt kein Layout — jedes Element liefert `getBoundingClientRect()`
 * mit 0×0 zurück. Recharts' `ResponsiveContainer` misst darüber seine
 * tatsächliche Größe und würde bei 0×0 eine Layout-Warnung (`console.warn`,
 * "The width(0) and height(0) of chart should be greater than 0…") auslösen —
 * ein Umgebungsartefakt, kein Fehler im Wrapper. Ein fester Rect-Stub gibt
 * dem Container eine plausible Größe (analog zu den matchMedia/ResizeObserver-
 * Stubs in vitest.setup.ts) und hält die Testausgabe pristine, ohne echte
 * Warnungen zu unterdrücken.
 */
let originalGetBoundingClientRect: typeof Element.prototype.getBoundingClientRect;

beforeAll(() => {
  originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      width: 800,
      height: 280,
      top: 0,
      left: 0,
      right: 800,
      bottom: 280,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
    } as DOMRect;
  };
});

afterAll(() => {
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
});

describe("BarChart", () => {
  it("rendert ohne Absturz", async () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);

    await act(async () => {
      root.render(<BarChart data={[{ x: "q1", y: 2.5 }]} xKey="x" yKey="y" domain={[1, 6]} />);
    });

    expect(host.querySelector(".recharts-wrapper")).toBeTruthy();

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
