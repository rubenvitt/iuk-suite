import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createCache, extractStyle, StyleProvider } from "@ant-design/cssinjs";
import { Button, ConfigProvider, Table, theme as antdTheme } from "antd";
import { buildTheme } from "../theme/theme";

/**
 * DER FOKUSRING AN SORTIERBAREN SPALTENKOEPFEN (IDA-392) — GEMESSEN AM GERENDERTEN.
 *
 * Die Regel steht in `globals.css` und zielt auf antd-Klassennamen (Falle 20). Ein
 * Regex ueber die CSS-Datei saehe nur, dass sie dasteht; dieser Test prueft wie
 * `core/theme/selektschrift.test.ts`, dass antd die Klassen, den Gegner
 * (`outline: none`) und die Variablen, auf die die Regel baut, wirklich ausgibt.
 */

const SELEKTOR_ANTD = ".ant-table-wrapper .ant-table-thead th.ant-table-column-has-sorters";

function sortierbareTabelle(mode: "light" | "dark" = "light") {
  const cache = createCache();
  const markup = renderToString(
    createElement(
      StyleProvider,
      { cache },
      createElement(
        ConfigProvider,
        { theme: buildTheme(mode) },
        createElement(Table<{ id: string; name: string }>, {
          rowKey: "id",
          columns: [{ title: "Funkrufname", dataIndex: "name", sorter: (a, b) => a.name.localeCompare(b.name) }],
          dataSource: [{ id: "1", name: "Rotkreuz 1" }],
          pagination: false,
        }),
        // Der Vergleich: ein Knopf daneben, dessen Ring die Regel uebernimmt.
        createElement(Button, null, "Anlegen"),
      ),
    ),
  );
  return { markup, css: extractStyle(cache, true) };
}

/** Alle Deklarationen der Regelbloecke mit GENAU diesem Selektor. */
function deklarationen(css: string, selektor: string): string {
  const treffer: string[] = [];
  for (const block of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    if (block[1].trim() === selektor) treffer.push(block[2]);
  }
  return treffer.join(";");
}

/** Der Suite-Block aus `globals.css`, ohne Kommentare. */
function suiteRegel(): string {
  const css = readFileSync("src/app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const block = new RegExp(
    `:root\\s+\\.ant-table-wrapper\\s+\\.ant-table-thead\\s+th\\.ant-table-column-has-sorters:focus-visible\\s*\\{([^}]*)\\}`,
  ).exec(css);
  expect(block, "Fokusregel fuer sortierbare Spaltenkoepfe fehlt in globals.css").not.toBeNull();
  return block![1];
}

describe("Spaltenkopf-Fokus — sortierbare Koepfe zeigen denselben Ring wie Knoepfe", () => {
  it("rendert die Klassen, auf die die Regel zielt, und den Kopf als Tab-Ziel", () => {
    const { markup } = sortierbareTabelle();
    expect(markup).toMatch(/class="[^"]*\bant-table-wrapper\b[^"]*"/);
    expect(markup).toMatch(/<thead class="[^"]*\bant-table-thead\b/);
    expect(markup, "der sortierbare Kopf heiszt nicht mehr `th.ant-table-column-has-sorters`").toMatch(
      /<th[^>]*class="[^"]*\bant-table-column-has-sorters\b[^"]*"[^>]*tabindex="0"|<th[^>]*tabindex="0"[^>]*class="[^"]*\bant-table-column-has-sorters\b/,
    );
  });

  it("antd nimmt dem Kopf den Ring — sonst braeuchte es die Regel nicht", () => {
    const { css } = sortierbareTabelle();
    expect(deklarationen(css, SELEKTOR_ANTD)).toMatch(/outline:\s*none/);
    expect(
      deklarationen(css, `${SELEKTOR_ANTD}:focus-visible`),
      "antd setzt am Fokus jetzt selbst einen Ring — die Suite-Regel pruefen",
    ).not.toMatch(/outline/);
  });

  it("die Variablen der Regel haengen an antds Scope-Klasse auf dem Tabellenwrapper (Falle 2)", () => {
    const { markup, css } = sortierbareTabelle();
    const wrapper = /class="([^"]*\bant-table-wrapper\b[^"]*)"/.exec(markup)![1].split(/\s+/);
    // Die Knoepfe nehmen genau diese beiden Variablen (`genFocusOutline`).
    expect(css).toMatch(/\.ant-btn:not\(:disabled\):focus-visible\{outline:var\(--ant-line-width-focus\) solid var\(--ant-color-primary-border\)/);
    for (const variable of ["--ant-line-width-focus", "--ant-color-primary-border"]) {
      const scope = [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)].find((b) => b[2].includes(`${variable}:`));
      expect(scope, `${variable} wird nicht ausgegeben`).toBeDefined();
      const klasse = scope![1].trim().replace(/^:where\(|\)$/g, "").replace(/^\./, "");
      expect(wrapper, `${variable} sitzt auf .${klasse}, die der Tabellenwrapper nicht traegt`).toContain(klasse);
    }
  });

  it("die Suite-Regel nimmt Breite und Farbe der Knoepfe, nach innen versetzt", () => {
    const regel = suiteRegel();
    expect(regel).toMatch(/outline:\s*var\(--ant-line-width-focus\)\s+solid\s+var\(--ant-color-primary-border\)/);
    expect(regel).toMatch(/outline-offset:\s*calc\(-1\s*\*\s*var\(--ant-line-width-focus\)\)/);
  });

  it("traegt in Hell und Dunkel einen 3-px-Ring in einer eigenen Farbe", () => {
    const hell = antdTheme.getDesignToken(buildTheme("light"));
    const dunkel = antdTheme.getDesignToken(buildTheme("dark"));
    expect(hell.lineWidthFocus).toBe(3);
    expect(dunkel.lineWidthFocus).toBe(3);
    expect(hell.colorPrimaryBorder).not.toBe(dunkel.colorPrimaryBorder);
    for (const modus of ["light", "dark"] as const) {
      expect(deklarationen(sortierbareTabelle(modus).css, SELEKTOR_ANTD)).toMatch(/outline:\s*none/);
    }
  });
});
