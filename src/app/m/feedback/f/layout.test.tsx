import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ReactElement } from "react";
import PublicFeedbackLayout from "./layout";

/**
 * Die Huelle der oeffentlichen Ansicht traegt zwei Zusagen des Entwurfs
 * (Abschnitt 3.11), die beide unsichtbar brechen koennen:
 *
 * 1. randlos — die 3px-Fahne laeuft von Fensterkante zu Fensterkante. Eine
 *    Maximalbreite oder ein Innenabstand hier setzt sie ab, und niemand sieht
 *    das in einem Typecheck.
 * 2. antd-frei — Ziel ist < 15 KB gz Route-JS. Ein spaeterer "schneller
 *    Import" von `Typography` oder `Button` wuerde das Budget reissen, ohne
 *    dass etwas anschlaegt. Deshalb eine Quelltext-Assertion auf den Import.
 */
const quelle = readFileSync(fileURLToPath(new URL("./layout.tsx", import.meta.url)), "utf8");

/** Kommentare raus: die Begruendung DARF antd nennen, der Code nicht. */
const codeOhneKommentare = quelle
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

function huelle() {
  return PublicFeedbackLayout({ children: null }) as ReactElement<{
    style?: Record<string, unknown>;
  }>;
}

describe("Oeffentliche Feedback-Huelle: randlos", () => {
  it("setzt keine Maximalbreite", () => {
    expect(huelle().props.style?.maxWidth).toBeUndefined();
  });

  it("setzt keinen Innenabstand", () => {
    const style = huelle().props.style ?? {};
    for (const schluessel of ["padding", "paddingLeft", "paddingRight", "paddingInline"]) {
      expect(style[schluessel]).toBeUndefined();
    }
  });

  it("die Huelle selbst bleibt ein <main>", () => {
    expect(huelle().type).toBe("main");
  });
});

describe("Oeffentliche Feedback-Huelle: antd-frei", () => {
  it("importiert antd nicht", () => {
    expect(codeOhneKommentare).not.toMatch(/from\s*["']antd(\/[^"']*)?["']/);
    expect(codeOhneKommentare).not.toMatch(/require\(\s*["']antd/);
    expect(codeOhneKommentare).not.toMatch(/import\(\s*["']antd/);
  });

  it("importiert auch keine antd-Nachbarn (Icons, cssinjs, Registry, ConfigProvider)", () => {
    expect(codeOhneKommentare).not.toMatch(/["']@ant-design\//);
    expect(codeOhneKommentare).not.toMatch(/AntdProvider|ConfigProvider/);
  });
});
