import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FELD_BREIT, FORMULAR_BREITE, Feld, Felder, SEITENTYPEN, Seite } from "./Seite";

/*
 * DIE VIER SEITENTYPEN (Haarlinie, IDA-347). Was man bei 320, 390, 1280 und 1920px SIEHT, besitzt
 * der Playwright-Lauf; hier stehen Markup und Regeltext — eigenes Markup, eigene Klassen, also
 * ohne die Wirkungsfrage aus Falle 20.
 */
const QUELLE = readFileSync(join(__dirname, "seite.module.css"), "utf8");
const CSS = QUELLE.replace(/\/\*[\s\S]*?\*\//g, "");

function regel(selektor: string): string {
  const i = CSS.indexOf(`${selektor} {`);
  expect(i, `Regel ${selektor}`).toBeGreaterThan(-1);
  return CSS.slice(i, CSS.indexOf("}", i));
}

describe("Seite", () => {
  it.each(SEITENTYPEN)("rendert den Typ %s als Attribut und Klasse", (typ) => {
    const html = renderToString(createElement(Seite, { typ, "data-testid": "x" } as never, "Inhalt"));
    expect(html).toContain(`data-seite="${typ}"`);
    expect(html).toContain('data-testid="x"');
    expect(html).toContain("Inhalt");
  });

  it("hängt eine eigene Klasse an, statt die des Typs zu ersetzen", () => {
    const html = renderToString(createElement(Seite, { typ: "formular", className: "eigen" }, "x"));
    expect(html).toMatch(/class="[^"]*\beigen\b/);
    expect(html).toMatch(/class="[^"]*formular/);
  });

  it("zentriert nie: kein automatischer Rand in den Regeln", () => {
    expect(CSS).not.toMatch(/margin(-inline)?\s*:[^;]*auto/);
    expect(CSS).not.toMatch(/margin-(left|right)\s*:\s*auto/);
  });

  it("begrenzt nur das Formular, auf die genannte Breite", () => {
    expect(regel(".formular")).toContain(`max-inline-size: ${FORMULAR_BREITE}px`);
    expect(CSS.match(/max-inline-size/g)).toHaveLength(1);
  });

  it("gibt dem Werkzeug am Desktop die volle Höhe, in dvh", () => {
    expect(CSS).toMatch(/@media \(min-width: 768px\) \{\s*\.werkzeug \{\s*min-block-size: calc\(100dvh - 32px - var\(--iuk-rueckmeldung-platz, 0px\)\);/);
    expect(CSS).not.toMatch(/100vh/);
  });

  it("liest keine antd-Variablen und keine antd-Klassen (Falle 2, Falle 20)", () => {
    expect(CSS).not.toMatch(/--ant-/);
    expect(CSS).not.toMatch(/\.ant-/);
  });

  it("ist serversicher: keine Client-Direktive, kein antd (Falle 1, 6)", () => {
    const tsx = readFileSync(join(__dirname, "Seite.tsx"), "utf8");
    expect(tsx).not.toMatch(/^\s*["']use client["']/m);
    expect(tsx).not.toMatch(/from ["']antd/);
  });
});

describe("Felder", () => {
  it("bricht ohne Media Query um: auto-fit mit einer Untergrenze, die unter 320px nachgibt", () => {
    const felder = regel(".felder");
    expect(felder).toContain("display: grid");
    expect(felder).toContain("grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr))");
  });

  it("lässt jedes Kind schmaler werden als seinen Inhalt (auch ein fieldset)", () => {
    expect(regel(".felder > *")).toContain("min-inline-size: 0");
  });

  it("spannt ein breites Feld über die ganze Zeile", () => {
    expect(regel(".breit")).toContain("grid-column: 1 / -1");
    const html = renderToString(
      createElement(Felder, null, createElement(Feld, { breit: true }, "lang"), createElement(Feld, null, "kurz")),
    );
    expect(html).toContain('data-felder=""');
    expect(html).toContain('data-feld="breit"');
    expect(html).toContain('data-feld="schmal"');
    expect(typeof FELD_BREIT).toBe("string");
  });
});
