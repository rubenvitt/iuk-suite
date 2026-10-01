import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Icons8Ikone } from "./Icons8Ikone";
import { ICONS8, type Icons8Name } from "./katalog";

/*
 * DER RIEGEL DER EINEN ZEICHENQUELLE. Seit 2026-09-30 kommt jedes Zeichen der Suite
 * aus dem Icons8-Katalog (`katalog.ts`, Satz „Windows 11 Outline") über
 * `Icons8Ikone`. Kein Icon-Paket mehr in `package.json`.
 *
 * Was dieser Test festhält:
 *  1. Keine Quelldatei importiert ein Icon-Paket (`@ant-design/icons`, `react-icons`,
 *     `lucide-react` …) — statisch, dynamisch, als Nebeneffekt oder per `require`.
 *     `@ant-design/icons` bleibt als Abhängigkeit von antd selbst im Baum; importiert
 *     wird es nie mehr direkt (Falle 7: HTTP 500 in RSC schon beim Import).
 *  2. `package.json` führt kein Icon-Paket.
 *  3. `Icons8Ikone.tsx` und `katalog.ts` tragen KEIN `"use client"` — sonst käme der
 *     Katalog in einer Server Component als Client-Referenz an (Falle 6).
 *  4. Der Katalog trägt nur, was gebraucht wird: jeder Schlüssel steht irgendwo in
 *     `src` als Literal. Der Katalog landet als Ganzes im Bundle.
 */

const WURZEL = "src";
const VERBOTEN = [
  /^@ant-design\/icons(\/|$)/,
  /^react-icons(\/|$)/,
  /^lucide-react(\/|$)/,
  /^@heroicons\//,
  /^@tabler\/icons/,
  /^@phosphor-icons\//,
  /^@iconify\//,
];

function quellDateien(verzeichnis: string, mitTests: boolean, treffer: string[] = []): string[] {
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) {
      quellDateien(pfad, mitTests, treffer);
      continue;
    }
    if (!/\.tsx?$/.test(eintrag)) continue;
    if (!mitTests && /\.test\.tsx?$/.test(eintrag)) continue;
    treffer.push(pfad);
  }
  return treffer;
}

function ohneKommentare(quelle: string): string {
  return quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function importSpezifizierer(quelle: string): string[] {
  const muster = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"']+)["']/g;
  return [...ohneKommentare(quelle).matchAll(muster)].map((m) => m[1]);
}

function traegtClientDirektive(quelle: string): boolean {
  return /^\s*["']use client["']/.test(ohneKommentare(quelle));
}

describe("core/ikonen — die eine Zeichenquelle", () => {
  it("keine Quelldatei importiert ein Icon-Paket", () => {
    // Tests sind ausgenommen: sie schreiben verbotene Importe als Fallbeispiele in Strings.
    const suender = quellDateien(WURZEL, false).flatMap((datei) =>
      importSpezifizierer(readFileSync(datei, "utf8"))
        .filter((s) => VERBOTEN.some((v) => v.test(s)))
        .map((s) => `${datei} -> ${s}`),
    );
    expect(suender, "Zeichen kommen aus `@/core/ikonen/Icons8Ikone`").toEqual([]);
  });

  it("package.json führt kein Icon-Paket", () => {
    const paket = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const namen = Object.keys({ ...paket.dependencies, ...paket.devDependencies });
    expect(namen.filter((n) => VERBOTEN.some((v) => v.test(n)))).toEqual([]);
  });

  it("Komponente und Katalog tragen kein `use client`", () => {
    for (const datei of ["Icons8Ikone.tsx", "katalog.ts"]) {
      const quelle = readFileSync(join(WURZEL, "core", "ikonen", datei), "utf8");
      expect(traegtClientDirektive(quelle), datei).toBe(false);
    }
  });

  it("jeder Katalogeintrag hat eine viewBox und mindestens einen Pfad", () => {
    for (const [name, zeichen] of Object.entries(ICONS8)) {
      expect(zeichen.viewBox, name).toMatch(/^0 0 \d+ \d+$/);
      expect(zeichen.pfade.length, name).toBeGreaterThan(0);
      expect(zeichen.id, name).toMatch(/^\w+$/);
    }
  });

  it("jeder Katalogschlüssel wird in `src` benutzt — der Katalog trägt keinen Ballast", () => {
    const quellen = quellDateien(WURZEL, false)
      .filter((d) => !d.startsWith(join(WURZEL, "core", "ikonen")))
      .map((d) => ohneKommentare(readFileSync(d, "utf8")))
      .join("\n");
    const unbenutzt = (Object.keys(ICONS8) as Icons8Name[]).filter(
      (name) => !quellen.includes(`"${name}"`),
    );
    expect(unbenutzt).toEqual([]);
  });

  it("rendert ein dekoratives SVG in currentColor, 1em ohne Größe", () => {
    const html = renderToStaticMarkup(createElement(Icons8Ikone, { name: "search" }));
    expect(html).toMatch(/^<svg /);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('focusable="false"');
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain('width="1em"');
    expect(html).toContain('data-icons8="search"');
    expect(html).not.toContain("stroke=");
  });

  it("`groesse` setzt Pixel, `kraeftig` zieht eine Kontur, `data-*` wird durchgereicht", () => {
    const html = renderToStaticMarkup(
      createElement(Icons8Ikone, { name: "plus", groesse: 20, kraeftig: true, "data-zeichen": "plus" }),
    );
    expect(html).toContain('width="20"');
    expect(html).toContain('stroke="currentColor"');
    expect(html).toContain('data-zeichen="plus"');
  });
});
