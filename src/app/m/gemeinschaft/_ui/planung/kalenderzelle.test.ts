// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createCache, extractStyle, StyleProvider } from "@ant-design/cssinjs";
import { Calendar, ConfigProvider } from "antd";
import dayjs from "dayjs";
import { buildTheme } from "@/core/theme/theme";

/**
 * Falle 20 (`CLAUDE.md`): die flachen Tageszellen des Kalenders am Telefon (IDA-387) stehen in
 * `planung.module.css` gegen antds Klassen. Hier wird gemessen, dass antd diese Klassen heute rendert und dass
 * unser Selektor mehr Klassen trägt als antds Regel für die Höhe des Inhaltsbereichs — sonst verlöre er still.
 */
const KLASSEN = ["ant-picker-calendar-full", "ant-picker-panel", "ant-picker-calendar-date", "ant-picker-calendar-date-content"];

function kalender() {
  const cache = createCache();
  const markup = renderToString(
    createElement(StyleProvider, { cache }, createElement(ConfigProvider, { theme: buildTheme("light") }, createElement(Calendar, { value: dayjs("2026-11-07") }))),
  );
  return { markup, css: extractStyle(cache, true) };
}

const klassenZahl = (selektor: string) => (selektor.replace(/:where\([^)]*\)/g, "").match(/\.[A-Za-z_-][\w-]*/g) ?? []).length;

describe("Kalender: flache Zellen am Telefon (IDA-387, Falle 20)", () => {
  it("antd rendert die Klassen, auf die die Regel zielt", () => {
    const { markup } = kalender();
    const klassen = new Set([...markup.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)));
    for (const k of KLASSEN) expect(klassen.has(k), k).toBe(true);
    // Nicht nur jede Klasse für sich: die ganze Nachfahrenkette der Regel muss ein Element treffen.
    const wurzel = document.createElement("div");
    wurzel.innerHTML = markup;
    const kette = ".ant-picker-calendar.ant-picker-calendar-full .ant-picker-panel .ant-picker-calendar-date .ant-picker-calendar-date-content";
    expect(wurzel.querySelectorAll(kette).length, kette).toBeGreaterThan(0);
  });

  it("unser Selektor schlägt antds Regel für die Höhe des Inhaltsbereichs", () => {
    const { css } = kalender();
    const antd = [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)].filter((b) => /ant-picker-calendar-date-content\s*$/.test(b[1].trim()) && /height:/.test(b[2]));
    expect(antd.length, "antds Höhenregel für den Inhaltsbereich fehlt — Bauform geändert").toBeGreaterThan(0);
    const unser = /\n\s*(\.kalender\.kalender[^{]*ant-picker-calendar-date-content\))\s*\{/.exec(readFileSync("src/app/m/gemeinschaft/_ui/planung/planung.module.css", "utf8"));
    expect(unser, "Regel in planung.module.css fehlt").not.toBeNull();
    const unsereZahl = klassenZahl(unser![1].replace(/:global\(([^)]*)\)/g, "$1"));
    for (const b of antd) expect(unsereZahl, b[1]).toBeGreaterThan(klassenZahl(b[1]));
  });
});
