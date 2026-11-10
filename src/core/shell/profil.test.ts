import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

import { AVATAR_FARBEN } from "@/core/shell/profil";

/*
 * DER AVATAR OHNE BILD (IDA-391): antds Vorgabe, Weiß auf Hellgrau, kam auf 1,9:1. Gerechnet wird
 * mit den Werten, die `globals.css` den beiden Variablen in Hell und Dunkel gibt — ändert dort
 * jemand eine Farbe, fällt es hier auf und nicht erst am Bildschirm.
 */
const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** Alle Regeln mit genau diesem Selektor, aneinandergehängt (`globals.css` hat mehrere `:root`). */
function block(selektor: string): string {
  const rumpfe: string[] = [];
  for (let i = CSS.indexOf(`\n${selektor} {`); i !== -1; i = CSS.indexOf(`\n${selektor} {`, i + 1)) {
    rumpfe.push(CSS.slice(i, CSS.indexOf("}", i)));
  }
  expect(rumpfe.length, selektor).toBeGreaterThan(0);
  return rumpfe.join("\n");
}

function wert(rumpf: string, variable: string): string {
  const treffer = new RegExp(`${variable}:\\s*(#[0-9a-fA-F]{6})`).exec(rumpf);
  expect(treffer, variable).not.toBeNull();
  return treffer![1];
}

/** WCAG-Kontrast, sRGB linearisiert. */
function kontrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hoch, tief] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hoch + 0.05) / (tief + 0.05);
}

const variable = (v: string) => /^var\((--[a-z-]+)\)$/.exec(v)![1];

describe("Avatar-Initialen", () => {
  it("stehen auf Suite-Variablen, nicht auf antds Vorgabe", () => {
    expect(variable(AVATAR_FARBEN.backgroundColor)).toBe("--iuk-linie");
    expect(variable(AVATAR_FARBEN.color)).toBe("--iuk-tinte");
  });

  it.each([
    ["hell", ":root"],
    ["dunkel", ':root[data-theme="dark"]'],
  ])("haben im Thema %s mindestens 4,5:1", (_, selektor) => {
    const rumpf = block(selektor);
    const schrift = wert(rumpf, variable(AVATAR_FARBEN.color));
    const grund = wert(rumpf, variable(AVATAR_FARBEN.backgroundColor));
    expect(kontrast(schrift, grund), `${schrift} auf ${grund}`).toBeGreaterThanOrEqual(4.5);
  });

  it("die Rechnung trifft den alten Befund: Weiß auf antds Hellgrau liegt darunter", () => {
    // antds `colorTextPlaceholder` im hellen Thema, auf Weiß gemischt (rgba(0,0,0,.25)).
    expect(kontrast("#ffffff", "#bfbfbf")).toBeLessThan(2);
  });
});
