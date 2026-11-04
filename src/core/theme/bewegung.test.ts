import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Button, ConfigProvider } from "antd";
import { BEWEGUNG, feder } from "./bewegung";
import { buildTheme } from "./theme";

const CSS = readFileSync("src/app/globals.css", "utf8");

describe("Bewegung der Haarlinie", () => {
  it("führt in globals.css dieselbe Feder wie in antds Token", () => {
    const wert = /--iuk-feder:\s*([^;]+);/.exec(CSS)?.[1].trim();
    expect(wert).toBe(BEWEGUNG.feder);
    expect(CSS).toContain(`--iuk-feder-dauer: ${BEWEGUNG.federDauerMs}ms;`);
    expect(buildTheme("light").token?.motionEaseOut).toBe(BEWEGUNG.feder);
  });

  it("endet in Ruhe und schießt höchstens knapp über", () => {
    const { kurve } = feder(260, 26);
    const punkte = kurve.slice(7, -1).split(",").map(Number);
    expect(punkte[0]).toBe(0);
    expect(punkte.at(-1)).toBe(1);
    expect(Math.max(...punkte)).toBeLessThan(1.03);
  });

  it("schaltet bei reduzierter Bewegung Übergänge und Animationen ab", () => {
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? "";
    expect(block).toMatch(/animation-duration:\s*0\.01ms !important/);
    expect(block).toMatch(/transition-duration:\s*0\.01ms !important/);
  });

  // Falle 20: die Druckregel zielt auf einen antd-Klassennamen — gerendert, nicht gelesen.
  it("trifft mit dem Druck-Feedback eine Klasse, die antd am Knopf rendert", () => {
    expect(CSS).toMatch(/:root \.ant-btn:not\(:disabled\):active\s*\{[^}]*transform: scale/);
    const markup = renderToString(createElement(ConfigProvider, { theme: buildTheme("light") }, createElement(Button, null, "Speichern")));
    expect(markup).toMatch(/<button[^>]*class="[^"]*\bant-btn\b/);
  });
});
