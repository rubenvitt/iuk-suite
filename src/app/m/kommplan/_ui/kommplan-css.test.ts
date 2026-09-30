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
  it("ein offenes Flyin schiebt den Editor ab Tablet-Breite zur Seite, statt Kopfleiste und Hinweise zu verdecken", () => {
    const zweig = /@media \(min-width: 768px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(zweig).toMatch(/\.kp-editor\[data-flyin\] \{[^}]*padding-inline-end: var\(--kp-flyin-breite\)/);
  });
  it("der seitliche Griff bricht nicht um: „+“ und Symbol stehen nebeneinander (absolut neben einer schmalen Karte)", () => {
    expect(css).toMatch(/\.kp-griffe \.kp-griff-seite \{[^}]*width: max-content/);
  });
  it("„+“ und Symbol im seitlichen Griff stehen in EINER Zeile — die Regel der Zeichnung trifft nur das SVG direkt in der Fläche", () => {
    expect(css).toMatch(/\.kp-betrachter > svg \{[^}]*width: 100%/);
    expect(css).not.toMatch(/\.kp-betrachter svg \{/);
    expect(css).toMatch(/\.kp-griff-inhalt \{[^}]*display: inline-flex/);
    expect(css).toMatch(/\.kp-griff-inhalt svg \{[^}]*display: inline-block/);
  });
  it("lange Zeichentitel brechen im Knopf um, statt über den Rand zu laufen (Sichtprüfung Phase 2)", () => {
    expect(css).toMatch(/\.kp-zeichen-knopf > span:last-child \{[^}]*overflow-wrap: anywhere/);
  });
  it("Auswahlrahmen auf dem Papier: in beiden Modi dieselbe Farbe, Kontrast zu Weiß mindestens 3:1 (WCAG 1.4.11, Review Phase 2)", () => {
    const dunkel = /:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(dunkel).not.toMatch(/--kp-auswahl-papier/);
    expect(css).toMatch(/\.kp-auswahlrahmen \{[^}]*border: 2px solid var\(--kp-auswahl-papier\)/);
    const farbe = /--kp-auswahl-papier: (#[0-9a-f]{6});/i.exec(css)?.[1];
    expect(farbe).toBeDefined();
    expect(kontrast(farbe!, "#ffffff")).toBeGreaterThanOrEqual(3);
  });
  it("Handlungsknöpfe der Kopfleiste stehen unter 768 px untereinander in voller Breite (docs/design/README.md, Mobil)", () => {
    const zweig = /@media \(max-width: 767\.98px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(zweig).toMatch(/\.kp-kopfwerkzeuge \{ display: grid; grid-template-columns: minmax\(0, 1fr\);/);
  });
  it("die Fläche des Editors endet am Bildrand, gemessen statt geschätzt (Hinweise unten bleiben im Bild)", () => {
    expect(css).toMatch(/\.kp-editor \.kp-betrachter \{ height: calc\(100dvh - var\(--kp-flaeche-oben, 240px\) - 48px\); \}/);
  });
});

/** Kontrastverhältnis nach WCAG 2.x (relative Leuchtdichte). */
function kontrast(a: string, b: string): number {
  const l = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hell, dunkel] = [l(a), l(b)].sort((x, y) => y - x);
  return (hell + 0.05) / (dunkel + 0.05);
}
