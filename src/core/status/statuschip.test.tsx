import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { STATUSTOENE, Statuschip } from "./Statuschip";

const CSS = readFileSync(join(__dirname, "statuschip.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Der Wert von `--sc-ton` in der ersten Regel mit genau diesem Selektor. */
function ton(selektor: string): string {
  const i = CSS.indexOf(`${selektor} {`);
  expect(i, `Regel ${selektor}`).toBeGreaterThan(-1);
  const m = /--sc-ton:\s*(#[0-9a-f]{6})/.exec(CSS.slice(i, CSS.indexOf("}", i)));
  expect(m, `--sc-ton in ${selektor}`).not.toBeNull();
  return m![1];
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}
function mische(vorne: string, anteil: number, hinten: string): [number, number, number] {
  const a = rgb(vorne);
  const b = rgb(hinten);
  return [0, 1, 2].map((i) => a[i] * anteil + b[i] * (1 - anteil)) as [number, number, number];
}
function leuchte([r, g, b]: [number, number, number]): number {
  const k = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * k(r) + 0.7152 * k(g) + 0.0722 * k(b);
}
function kontrast(a: [number, number, number], b: [number, number, number]): number {
  const [h, d] = [leuchte(a), leuchte(b)].sort((x, y) => y - x);
  return (h + 0.05) / (d + 0.05);
}

const HELL = ["#ffffff", "#fafaf9"]; // karte, papier
const DUNKEL = ["#111113", "#09090b", "#18181b"]; // karte, grund, erhoben

describe("Statuschip", () => {
  it.each(STATUSTOENE)("rendert den Ton %s mit Punkt und Text, ohne antd", (t) => {
    const html = renderToString(<Statuschip ton={t}>Text</Statuschip>);
    expect(html).toContain(`data-statuschip="${t}"`);
    expect(html).toContain("Text");
    expect(html).toMatch(/aria-hidden="true"/);
    expect(html).not.toMatch(/class="[^"]*\bant-/);
  });

  it("nimmt ein Zeichen statt des Punktes", () => {
    const html = renderToString(<Statuschip ton="ok" symbol={<svg data-x="1" />}>da</Statuschip>);
    expect(html).toContain('data-x="1"');
    expect(html.match(/aria-hidden/g)).toHaveLength(1);
  });

  it("ist ohne Ton neutral", () => {
    expect(renderToString(<Statuschip>x</Statuschip>)).toContain('data-statuschip="neutral"');
  });

  it.each(STATUSTOENE)("Ton %s trägt 4,5:1 auf Karte, Grund und eigener Fläche — hell und dunkel", (t) => {
    const hell = ton(`.${t}`);
    const dunkel = ton(`:root[data-theme="dark"] .${t}`);
    for (const grund of HELL) {
      expect(kontrast(rgb(hell), rgb(grund)), `${t} hell auf ${grund}`).toBeGreaterThanOrEqual(4.5);
      expect(kontrast(rgb(hell), mische(hell, 0.08, grund)), `${t} hell auf Fläche`).toBeGreaterThanOrEqual(4.5);
    }
    for (const grund of DUNKEL) {
      expect(kontrast(rgb(dunkel), rgb(grund)), `${t} dunkel auf ${grund}`).toBeGreaterThanOrEqual(4.5);
      expect(kontrast(rgb(dunkel), mische(dunkel, 0.08, grund)), `${t} dunkel auf Fläche`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("nennt keine antd-Variable und keine antd-Klasse (Falle 2, Falle 20)", () => {
    expect(CSS).not.toMatch(/--ant-|\.ant-/);
  });

  it("wählt den Modus über data-theme, nie über die Systemabfrage", () => {
    expect(CSS).not.toContain("prefers-color-scheme");
  });
});
