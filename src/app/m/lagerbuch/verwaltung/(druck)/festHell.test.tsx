/**
 * IDA-380 — DIE DRUCKFLÄCHEN SIND FEST HELL, AUCH IM DUNKELMODUS.
 *
 * Gemessen war „Zurück zu Fahrzeugen und Taschen", „Kompakt" und
 * „Blindzählung" im Dunkelmodus bei 1,04:1 — helle Schrift auf dem weißen
 * Bogen. Dieser Test rechnet den Kontrast aus den Werten nach, die wirklich
 * gelten: antds erzeugtem CSS (`extractStyle`, Vorbild
 * `core/theme/selektschrift.test.ts`) und den eigenen Variablen in `druck.css`.
 * Ob der Browser sie so anwendet, sieht nur Playwright.
 */
import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createCache, extractStyle, StyleProvider } from "@ant-design/cssinjs";
import { Button, Checkbox, ConfigProvider } from "antd";
import { ARBEITSDICHTE, buildTheme } from "@/core/theme/theme";
import { FEST_HELL } from "./festHell";
import { FestHell } from "./FestHell";

const DRUCK_CSS = readFileSync("src/app/m/lagerbuch/verwaltung/(druck)/druck.css", "utf8");
const GLOBALS = readFileSync("src/app/globals.css", "utf8");
const MODUL_CSS = readFileSync("src/app/m/lagerbuch/_ui/verwaltung.module.css", "utf8");
const LAYOUT = readFileSync("src/app/m/lagerbuch/verwaltung/(druck)/layout.tsx", "utf8");

/** Alle `--name: wert`-Paare aus den Blöcken mit genau diesem Selektor. */
function variablen(css: string, selektor: string): Map<string, string> {
  const ohne = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const paare = new Map<string, string>();
  for (const block of ohne.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    if (block[1].trim() !== selektor) continue;
    for (const d of block[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) paare.set(d[1], d[2].trim());
  }
  return paare;
}

/** Relative Leuchtdichte nach WCAG 2.x für `#rrggbb`. */
function leuchtdichte(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((k) => (k <= 0.03928 ? k / 12.92 : ((k + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function kontrast(a: string, b: string): number {
  const [hell, dunkel] = [leuchtdichte(a), leuchtdichte(b)].sort((x, y) => y - x);
  return (hell! + 0.05) / (dunkel! + 0.05);
}

describe("FEST_HELL — antd auf hell, unabhängig vom Modus", () => {
  it("erbt nichts vom dunklen Theme und behält die Arbeitsdichte", () => {
    expect(FEST_HELL.inherit).toBe(false);
    expect(FEST_HELL.algorithm).toEqual(buildTheme("light").algorithm);
    expect(FEST_HELL.token?.controlHeight).toBe(ARBEITSDICHTE.token?.controlHeight);
    // Ein eigener Schlüssel: `iuk` teilte sich die Klasse mit dem dunklen Theme.
    expect((FEST_HELL.cssVar as { key: string }).key).not.toBe("iuk");
  });

  it("gibt Kontrollkästchen und Knopf im Dunkelmodus helle Werte", () => {
    const cache = createCache();
    const markup = renderToString(h(StyleProvider, { cache },
      h(ConfigProvider, { theme: buildTheme("dark") },
        h(FestHell, null,
          h(Checkbox, null, "Kompakt"),
          h(Button, { type: "primary" }, "Drucken")))));
    const schluessel = (FEST_HELL.cssVar as { key: string }).key;
    expect(markup).toMatch(new RegExp(`class="ant-checkbox-wrapper ${schluessel}\\b`));
    expect(markup).toContain("lb-festHell");

    const werte = variablen(extractStyle(cache, true), `.${schluessel}`);
    const text = werte.get("--ant-color-text")!;
    expect(text).toMatch(/^#[0-9a-f]{6}$/i);
    // Auf dem weißen Bogen (`.lb-cl-bogen`) — AA für Fließtext.
    expect(kontrast(text, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    // Der Primärknopf: helle Schrift auf Tinte, nicht dunkel auf dunkel.
    const primaer = werte.get("--ant-color-primary")!;
    const aufPrimaer = werte.get("--ant-color-text-light-solid")!;
    expect(kontrast(primaer, aufPrimaer.length === 4
      ? `#${[...aufPrimaer.slice(1)].map((z) => z + z).join("")}`
      : aufPrimaer)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("druck.css — die eigenen Variablen der hellen Fläche", () => {
  const fest = variablen(DRUCK_CSS, ".lb-festHell");

  it("pinnt jede Suite-Variable mit Dunkelzweig auf ihren hellen Wert", () => {
    const dunkel = variablen(GLOBALS, ":root[data-theme=\"dark\"]");
    const hell = variablen(GLOBALS, ":root");
    expect(dunkel.size).toBeGreaterThan(0);
    for (const name of dunkel.keys()) {
      expect(fest.get(name), name).toBe(hell.get(name));
    }
  });

  it("pinnt jede Modul-Variable mit Dunkelzweig auf ihren hellen Wert", () => {
    const dunkel = variablen(MODUL_CSS, ":root[data-theme=\"dark\"] .modul");
    const hell = variablen(MODUL_CSS, ".modul");
    expect(dunkel.size).toBeGreaterThan(0);
    for (const name of dunkel.keys()) {
      expect(fest.get(name), name).toBe(hell.get(name));
    }
  });

  it("gibt dem nackten Link die helle Tinte — lesbar auf dem weißen Bogen", () => {
    const ohne = DRUCK_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(ohne).toMatch(/\.lb-festHell a:not\(\[class\]\)\s*\{[^}]*color:\s*var\(--iuk-tinte\)/);
    expect(ohne).toMatch(/\.lb-festHell\s*\{[^}]*color-scheme:\s*light/);
    expect(kontrast(fest.get("--iuk-tinte")!, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    // Das Gegenstück, das IDA-380 gemessen hat: die dunkle Tinte auf Weiß.
    const dunkleTinte = variablen(GLOBALS, ":root[data-theme=\"dark\"]").get("--iuk-tinte")!;
    expect(kontrast(dunkleTinte, "#ffffff")).toBeLessThan(1.1);
  });

  it("hängt unter jeder Druckseite", () => {
    expect(LAYOUT).toMatch(/<FestHell>\{children\}<\/FestHell>/);
  });
});
