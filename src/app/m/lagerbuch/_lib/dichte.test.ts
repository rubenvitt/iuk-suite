import { describe, expect, it } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { createCache, extractStyle, StyleProvider } from "@ant-design/cssinjs";
import { Button, Card, ConfigProvider, Table, theme as antdTheme } from "antd";
import { ARBEITSDICHTE, buildTheme } from "@/core/theme/theme";
import { VERWALTUNGSLUFT, ZEILENBOX } from "./dichte";

/**
 * DIE LUFT DER VERWALTUNG WIRD AM ERZEUGTEN STYLESHEET GEMESSEN, NICHT GELESEN
 * (Falle 20, Vorbild `core/theme/selektschrift.test.ts`).
 *
 * Gerendert wird die echte Schachtelung der Verwaltung: Suite-Theme, darin die
 * `ARBEITSDICHTE` der `FullShell`, darin `VERWALTUNGSLUFT`. Gefragt wird, was
 * antd unter der Scope-Klasse `lb-luft` TATSÄCHLICH ausgibt.
 */
function verwaltung(kind: ReactNode) {
  const cache = createCache();
  const markup = renderToString(
    createElement(
      StyleProvider,
      { cache },
      createElement(
        ConfigProvider,
        { theme: buildTheme("light") },
        createElement(
          ConfigProvider,
          { theme: ARBEITSDICHTE },
          createElement(ConfigProvider, { theme: VERWALTUNGSLUFT }, kind),
        ),
      ),
    ),
  );
  return { markup, css: extractStyle(cache, true) };
}

/** Alle Deklarationen der Regelblöcke, deren Selektor `teil` enthält. */
function bloecke(css: string, teil: string): string {
  const treffer: string[] = [];
  for (const block of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    if (block[1].includes(teil)) treffer.push(block[2]);
  }
  return treffer.join(";");
}

function wert(block: string, eigenschaft: string): string | undefined {
  const maskiert = eigenschaft.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  const treffer = [...block.matchAll(new RegExp(`(?:^|;)\\s*${maskiert}\\s*:([^;]*)`, "g"))];
  return treffer.at(-1)?.[1].trim();
}

describe("VERWALTUNGSLUFT", () => {
  it("setzt keine Bedienhöhe — die 44 px der ARBEITSDICHTE bleiben", () => {
    // Die Entscheidung von IDA-234: Platz an der Luft, nicht am Tippziel.
    expect(VERWALTUNGSLUFT.token).toBeUndefined();
    expect(JSON.stringify(VERWALTUNGSLUFT)).not.toMatch(/controlHeight/);
  });

  it("rechnet mit der echten Zeilenbox: eine Textzeile ist so hoch wie ein Bedienelement", () => {
    // Stimmt die Zeilenbox nicht mehr (anderer `fontSize`/`lineHeight`), wird
    // aus „so hoch wie ein Knopf" still etwas anderes — und der sortierbare
    // Spaltenkopf fiele unter 44 px.
    const token = antdTheme.getDesignToken(buildTheme("light"));
    expect(Math.floor(token.fontSize * token.lineHeight)).toBe(ZEILENBOX);
    const polster = VERWALTUNGSLUFT.components?.Table?.cellPaddingBlock ?? 0;
    expect(ZEILENBOX + 2 * polster).toBe(ARBEITSDICHTE.token?.controlHeight);
  });

  it("legt das Zellenpolster der Tabelle auf die Scope-Klasse `lb-luft`", () => {
    const { markup, css } = verwaltung(
      createElement(Table, {
        rowKey: "id",
        dataSource: [{ id: "1", name: "Kompresse" }],
        columns: [{ title: "Artikel", dataIndex: "name" }],
      }),
    );
    expect(markup, "die Tabelle trägt die Scope-Klasse nicht").toMatch(
      /class="[^"]*\blb-luft\b[^"]*\bant-table-css-var\b|class="[^"]*\bant-table-css-var\b[^"]*\blb-luft\b/,
    );
    const scope = bloecke(css, ".lb-luft");
    expect(wert(scope, "--ant-table-cell-padding-block")).toBe("11px");
    expect(wert(scope, "--ant-table-cell-padding-inline")).toBe("12px");
    // Und die Zelle liest genau diese Variable — sonst wäre der Token still tot.
    const zelle = bloecke(css, ".ant-table-tbody>tr>td");
    expect(zelle).toMatch(/var\(--ant-table-cell-padding-block\)/);
  });

  it("legt Kartenpolster und Kartenkopf auf dieselbe Scope-Klasse", () => {
    const { markup, css } = verwaltung(createElement(Card, { title: "Letzte Buchungen" }, "Inhalt"));
    expect(markup).toMatch(/class="[^"]*\blb-luft\b/);
    const scope = bloecke(css, ".lb-luft");
    expect(wert(scope, "--ant-card-body-padding")).toBe("16px");
    expect(wert(scope, "--ant-card-header-padding")).toBe("16px");
    expect(wert(scope, "--ant-card-header-height")).toBe("48px");
  });

  it("lässt einen Knopf darunter 44 px hoch", () => {
    const { css } = verwaltung(createElement(Button, null, "Speichern"));
    const scope = bloecke(css, ".lb-luft");
    expect(wert(scope, "--ant-control-height")).toBe("44px");
  });
});
