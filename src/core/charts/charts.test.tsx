// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ConfigProvider } from "antd";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BarChart } from "./BarChart";
import { LineChart } from "./LineChart";
import { buildTheme } from "@/core/theme/theme";

/**
 * jsdom kennt kein Layout — jedes Element liefert `getBoundingClientRect()`
 * mit 0×0 zurück. Recharts' `ResponsiveContainer` misst darüber seine
 * tatsächliche Größe. Ein fester Rect-Stub (analog zu BarChart.test.tsx)
 * gibt dem Container eine plausible Größe.
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

async function renderInto(node: React.ReactElement): Promise<{ host: HTMLDivElement; root: Root }> {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  await act(async () => {
    root.render(node);
  });
  return { host, root };
}

async function cleanup(host: HTMLDivElement, root: Root): Promise<void> {
  await act(async () => {
    root.unmount();
  });
  host.remove();
}

function moduleSource(relativeFile: string): string {
  const path = fileURLToPath(new URL(relativeFile, import.meta.url));
  return readFileSync(path, "utf-8");
}

describe("core/charts", () => {
  it("kodiert die Suite-Rot-Farbe in BarChart nicht als Literal", () => {
    expect(moduleSource("./BarChart.tsx")).not.toContain("#c8000f");
  });

  it("kodiert die Suite-Rot-Farbe in LineChart nicht als Literal", () => {
    expect(moduleSource("./LineChart.tsx")).not.toContain("#c8000f");
  });

  it("rendert bei leerem Datenarray einen Hinweistext statt eines leeren Achsenkreuzes (BarChart)", async () => {
    const { host, root } = await renderInto(<BarChart data={[]} xKey="x" yKey="y" />);

    expect(host.querySelector(".recharts-wrapper")).toBeFalsy();
    expect(host.textContent).toContain("Noch keine Rückmeldungen");

    await cleanup(host, root);
  });

  it("rendert bei leerem Datenarray einen Hinweistext statt eines leeren Achsenkreuzes (LineChart)", async () => {
    const { host, root } = await renderInto(<LineChart data={[]} xKey="x" yKey="y" />);

    expect(host.querySelector(".recharts-wrapper")).toBeFalsy();
    expect(host.textContent).toContain("Noch keine Rückmeldungen");

    await cleanup(host, root);
  });

  it("nutzt den optionalen emptyText statt des Standardtexts", async () => {
    const { host, root } = await renderInto(<BarChart data={[]} xKey="x" yKey="y" emptyText="Keine Daten" />);

    expect(host.textContent).toContain("Keine Daten");
    expect(host.textContent).not.toContain("Noch keine Rückmeldungen");

    await cleanup(host, root);
  });

  it.each([
    ["BarChart", BarChart],
    ["LineChart", LineChart],
  ] as const)(
    "leitet Achsen- und Gitterfarbe aus dem Theme-Token ab statt aus einer festen Zeichenkette (%s)",
    async (_name, Chart) => {
      const data = [{ x: "q1", y: 2.5 }];

      const light = await renderInto(
        <ConfigProvider theme={buildTheme("light")}>
          <Chart data={data} xKey="x" yKey="y" domain={[1, 6]} />
        </ConfigProvider>,
      );
      const lightGrid = light.host.querySelector(".recharts-cartesian-grid line");
      const lightGridStroke = lightGrid?.getAttribute("stroke");
      const lightAxisLine = light.host.querySelector(".recharts-cartesian-axis-line");
      const lightAxisStroke = lightAxisLine?.getAttribute("stroke");
      const lightTick = light.host.querySelector(".recharts-cartesian-axis-tick-value");
      const lightTickFill = lightTick?.getAttribute("fill");
      await cleanup(light.host, light.root);

      const dark = await renderInto(
        <ConfigProvider theme={buildTheme("dark")}>
          <Chart data={data} xKey="x" yKey="y" domain={[1, 6]} />
        </ConfigProvider>,
      );
      const darkGrid = dark.host.querySelector(".recharts-cartesian-grid line");
      const darkGridStroke = darkGrid?.getAttribute("stroke");
      const darkAxisLine = dark.host.querySelector(".recharts-cartesian-axis-line");
      const darkAxisStroke = darkAxisLine?.getAttribute("stroke");
      const darkTick = dark.host.querySelector(".recharts-cartesian-axis-tick-value");
      const darkTickFill = darkTick?.getAttribute("fill");
      await cleanup(dark.host, dark.root);

      expect(lightGridStroke).toBeTruthy();
      expect(darkGridStroke).toBeTruthy();
      expect(lightGridStroke).not.toBe(darkGridStroke);

      expect(lightAxisStroke).toBeTruthy();
      expect(darkAxisStroke).toBeTruthy();
      expect(lightAxisStroke).not.toBe(darkAxisStroke);

      expect(lightTickFill).toBeTruthy();
      expect(darkTickFill).toBeTruthy();
      expect(lightTickFill).not.toBe(darkTickFill);
    },
  );
});
