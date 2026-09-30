import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Die REGEL steht da (Quelltext-Scan, docs/design/README.md „Tests für Responsives"); dass sie WIRKT,
 * prüft `e2e/kommplan-editor.spec.ts` mit `emulateMedia({ reducedMotion: "reduce" })`.
 */
const css = readFileSync("src/app/m/kommplan/_ui/kommplan.css", "utf8");

describe("kommplan.css", () => {
  it("Gleiten und Nachziehen haben einen Zweig für reduzierte Bewegung", () => {
    const zweig = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(zweig).toMatch(/\.kp-gleitet \{ transition: none; \}/);
    expect(zweig).toMatch(/\.kp-nachziehen \{ animation: none; \}/);
  });
  it("Farben für Hell und Dunkel über data-theme, nie über prefers-color-scheme", () => {
    expect(css).not.toMatch(/prefers-color-scheme/);
    expect(css).toMatch(/:root\[data-theme="dark"\]/);
  });
});
