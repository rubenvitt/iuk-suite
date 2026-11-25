import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Die geteilten Zeichen des Live-Quiz (Beamer und Handy). Ohne Kommentare: die nennen die
// verbotenen Wege absichtlich beim Namen.
const css = readFileSync(join(__dirname, "zeichen.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("zeichen.module.css", () => {
  it("kennt kein antd und keine `--ant-*`-Variablen (Falle 2)", () => {
    expect(css).not.toMatch(/--ant-|\.ant-/);
  });
  it("hängt Dunkel an `data-theme`, nicht an `prefers-color-scheme`", () => {
    expect(css).toContain(':root[data-theme="dark"] .zeichen');
    expect(css).not.toContain("prefers-color-scheme");
  });
  it("Suite-Rot genau einmal: `--qz-marke`, nur für Fahne und Wortzeichen", () => {
    expect(css.match(/#c8000f/gi)).toHaveLength(1);
    expect(css).toMatch(/--qz-marke:\s*#c8000f/i);
  });
  it("trägt alle Variablen der Entwurfsdatei, hell und dunkel", () => {
    const [hell, dunkel] = css.split(':root[data-theme="dark"] .zeichen');
    for (const v of ["grund", "flaeche", "tinte", "tinte-auf", "gedaempft", "linie", "linie-stark", "spur", "a", "a-text", "b", "b-text", "c", "c-text", "d", "d-text"]) {
      expect(hell, v).toMatch(new RegExp(`--qz-${v}:`));
      expect(dunkel, v).toMatch(new RegExp(`--qz-${v}:`));
    }
  });
});
