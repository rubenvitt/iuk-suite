import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Kennzahl, Kennzahlen } from "./Kennzahl";

const QUELLE = readFileSync(join(__dirname, "Kennzahl.tsx"), "utf8");
const CSS = readFileSync(join(__dirname, "kennzahl.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const html = (el: ReactElement) => renderToString(el);

describe("Kennzahl", () => {
  it("rendert Wert und Label ohne Kiste und ohne antd", () => {
    const h = html(createElement(Kennzahl, { wert: 7, label: "unter Mindestbestand" }));
    expect(h).toContain("data-kennzahl-wert");
    expect(h).toContain(">7<");
    expect(h).toContain("unter Mindestbestand");
    expect(h).not.toMatch(/class="[^"]*\bant-/);
  });

  it("setzt die Zahl in der Zahlenrolle und Tinte, auch beim Ton fehler (Falle 3)", () => {
    const h = html(createElement(Kennzahl, { wert: 3, label: "abgelaufen", ton: "fehler" }));
    expect(h).toMatch(/data-kennzahl-wert=""[^>]*style="[^"]*font-size:30px/);
    expect(h).toContain('data-kennzahl="fehler"');
    // Der Ton steht am Punkt, nicht an der Zahl.
    expect(h.match(/aria-hidden="true"/g)).toHaveLength(1);
    expect(CSS).not.toMatch(/\.wert \{[^}]*--sc-ton/);
  });

  it("zeichnet für neutral und ohne Ton keinen Punkt", () => {
    for (const ton of [undefined, "neutral" as const]) {
      expect(html(createElement(Kennzahl, { wert: 1, label: "x", ton }))).not.toContain('aria-hidden="true"');
    }
  });

  it("verlinkt mit Chevron, wenn ein Ziel da ist", () => {
    const h = html(createElement(Kennzahl, { wert: 3, label: "abgelaufen", href: "/verfall" }));
    expect(h).toMatch(/<a [^>]*href="\/verfall"/);
    expect(h).toContain('data-icons8="chevron-right"');
    expect(html(createElement(Kennzahl, { wert: 3, label: "x" }))).not.toContain("<a ");
  });

  it("setzt Textwerte kleiner", () => {
    expect(html(createElement(Kennzahl, { wert: "RTW 1", label: "Standort", text: true }))).toMatch(/font-size:20px/);
  });

  it("Kennzahlen ist eine Gruppe, wenn sie benannt ist", () => {
    expect(html(<Kennzahlen aria-label="Lage">x</Kennzahlen>)).toContain('role="group"');
    expect(html(<Kennzahlen>x</Kennzahlen>)).not.toContain("role=");
  });

  it("trägt kein \"use client\" und kein antd (Falle 1, 6)", () => {
    expect(QUELLE).not.toMatch(/^["']use client["']/m);
    expect(QUELLE).not.toMatch(/from "antd"/);
  });

  it("trennt mit einer Haarlinie, die am Zeilenanfang weggeschnitten wird", () => {
    expect(CSS).toMatch(/\.kennzahl \{[^}]*border-inline-start: 1px solid var\(--iuk-linie\)/);
    expect(CSS).toMatch(/\.rahmen \{[^}]*overflow: clip/);
    expect(CSS).toMatch(/\.zeile \{[^}]*flex-wrap: wrap;[^}]*margin-inline-start: calc\(-1 \* var\(--kz-polster\) - 1px\)/);
    expect(CSS).not.toMatch(/--ant-|\.ant-|box-shadow/);
  });
});
