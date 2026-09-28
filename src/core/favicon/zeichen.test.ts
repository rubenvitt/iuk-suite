import { describe, it, expect } from "vitest";
import { ZEICHEN } from "./zeichen";

const SIGNAL_GRUPPE = /<g transform="translate\(44 19\) scale\([0-9.]+\)">.*?<\/g>/;

describe("Favicon-Zeichen", () => {
  it.each(Object.entries(ZEICHEN))("%s ist ein eigenständiges SVG mit Titel", (name, svg) => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toMatch(/<title>[^<]+<\/title>/);
    expect(name).toMatch(/^[a-z]+$/);
  });

  it.each(Object.entries(ZEICHEN))("%s schaltet für eine dunkle Tab-Leiste um", (_name, svg) => {
    // Ohne die Umschaltung verschwände die Tinte auf dunklem Grund.
    expect(svg).toContain("@media (prefers-color-scheme:dark)");
  });

  it.each(Object.entries(ZEICHEN))("%s kommt ohne CSS-Variablen aus (eine Datei hat keinen Elternbaum)", (_name, svg) => {
    expect(svg).not.toContain("var(");
  });

  it("trägt in jedem Modulzeichen dasselbe Signal an derselben Stelle", () => {
    const modulZeichen = Object.entries(ZEICHEN).filter(([name]) => name !== "ida");
    expect(modulZeichen.length).toBeGreaterThan(0);
    const signale = new Set(modulZeichen.map(([, svg]) => svg.match(SIGNAL_GRUPPE)?.[0]));
    expect(signale.size).toBe(1);
    expect([...signale][0]).toBeDefined();
  });

  it("hat eindeutige Masken-IDs (mehrere Zeichen auf einer Seite dürfen sich nicht treffen)", () => {
    const ids = Object.values(ZEICHEN).flatMap((svg) => [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
