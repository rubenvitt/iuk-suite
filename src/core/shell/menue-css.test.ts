import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/*
 * DIE REGELN DES MENÜS VON `FullShell` (IDA-347, Etappe 2) — am Quelltext, weil jsdom weder Media
 * Queries noch Übergänge auswertet. Was man bei 390 und 1280px SIEHT, besitzt der Playwright-Lauf.
 */
const CSS = readFileSync(join(__dirname, "menue.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function regel(selektor: string): string {
  const i = CSS.indexOf(`${selektor} {`);
  expect(i, `Regel ${selektor}`).toBeGreaterThan(-1);
  return CSS.slice(i, CSS.indexOf("}", i));
}

describe("menue.module.css", () => {
  it("schaltet am einen Breakpoint der Suite um, 768px", () => {
    const breakpoints = [...CSS.matchAll(/@media \((min|max)-width: ([\d.]+)px\)/g)].map((t) => t[2]);
    expect(breakpoints).toEqual(["768"]);
  });

  it("liest keine antd-Variablen und keine antd-Klassen (Falle 2, Falle 20)", () => {
    expect(CSS).not.toMatch(/--ant-/);
    expect(CSS).not.toMatch(/\.ant-/);
  });

  it("schiebt die Ebenen mit der Feder der Suite", () => {
    expect(regel(".ebene")).toContain("transform var(--iuk-feder-dauer) var(--iuk-feder)");
    expect(CSS).toMatch(/\.spur\[data-ebene="apps"\] > \.ebene \{\s*transform: translateX\(-100%\);/);
  });

  it("markiert den aktiven Eintrag leise: Fläche, Tinte, 600 — keine rote Kante", () => {
    const aktiv = regel(".eintrag[aria-current]");
    expect(aktiv).toContain("background: var(--iuk-flaeche-aktiv)");
    expect(aktiv).toContain("color: var(--iuk-tinte)");
    expect(aktiv).toContain("font-weight: 600");
    expect(CSS).not.toContain("--iuk-marke");
  });

  it("hält jede Trefferfläche bei mindestens 44px (Falle 4)", () => {
    for (const s of [".eintrag", ".zurueck", ".appKnopf", ".ort"]) {
      const hoehe = Number(/min-block-size: (\d+)px/.exec(regel(s))?.[1]);
      expect(hoehe, s).toBeGreaterThanOrEqual(44);
    }
  });

  it("zeigt das Tastenkürzel nur mit Tastatur und Maus, nie am Telefon (IDA-391)", () => {
    expect(regel(".kuerzel")).toContain("display: none");
    expect(CSS).toMatch(/@media \(hover: hover\) and \(pointer: fine\) \{\s*\.kuerzel \{\s*display: inline-block;/);
  });

  it("nimmt das Menü aus dem Druck", () => {
    expect(CSS).toMatch(/@media print[\s\S]*\.druckRahmen \.kopf \{\s*display: none !important;/);
  });

  it("blendet den Hover der Einträge über, statt umzuspringen", () => {
    expect(CSS).toMatch(/\.eintrag,\s*\.zurueck,\s*\.ort,\s*\.appKnopf \{\s*transition:[^}]*background-color 140ms ease/);
  });
});
