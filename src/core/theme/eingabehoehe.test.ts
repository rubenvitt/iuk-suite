import { describe, it, expect } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { createCache, extractStyle, StyleProvider } from "@ant-design/cssinjs";
import { ConfigProvider, DatePicker, Input, InputNumber, theme as antdTheme } from "antd";
import { buildTheme, ARBEITSDICHTE, SCHREIBTISCHDICHTE } from "./theme";
import { TAP, TAP_XL } from "./tokens";

/**
 * DAS EINGABEFELD STEHT TROTZ 16px SCHRIFT AUF SEINER BEDIENDICHTE (DRK-392).
 *
 * ⚠️ DIESER TEST WIDERLEGT EINEN BEFUND, ER BEHEBT KEINEN. DRK-392 hielt fest,
 * jedes `Input`, `InputNumber` und `DatePicker` der Suite sei 47,1px statt 44
 * hoch: `inputFontSize: 16` hebe die Zeilenbox, antd rechne die Polsterung aber
 * weiter aus `token.fontSize` (14). Das stimmt nicht. antd rechnet sie aus
 * derselben Schrift, die das Feld traegt — `antd/es/input/style/token.js`,
 * `initComponentToken`: `mergedFontSize = inputFontSize || fontSize`, und genau
 * damit `paddingBlock`. `InputNumber` und `DatePicker` rufen dieselbe Funktion.
 * GEMESSEN, nicht hergeleitet: im echten Chromium misst die Huelle eines
 * `Input` mit `allowClear` auf `/admin/audit` 43,9px (390 wie 1280px), das
 * `Select` daneben 44,0. Die 47,1 waren aus dem INNEREN `input` (25,1px)
 * hochgerechnet, nicht an der Huelle gemessen.
 *
 * WARUM DER TEST TROTZDEM BLEIBT: die Zusage haengt an einer antd-Interna, die
 * ein Major aendern kann — und dann waere der Fehler genau der aus dem Ticket,
 * still und in jeder Dichte zugleich. Gerechnet wird wie in
 * `selektschrift.test.ts`: `extractStyle` gibt das CSS heraus, das antd fuer die
 * Suite-Themes WIRKLICH erzeugt, die Hoehe ergibt sich rein rechnerisch.
 *
 * `toBeCloseTo(…, 0)` statt `toBe`: antd rundet die Polsterung auf 0,1px
 * (8,4 statt 8,43), die Huelle misst deshalb 43,92 und nicht 44. Eine halbe
 * Pixelzeile ist Rundung, drei Pixel waeren der Befund.
 *
 * `size="small"` ist bewusst NICHT dabei: unter `SCHREIBTISCHDICHTE` passt eine
 * 16px-Zeilenbox (25,1px) nicht in `controlHeightSM` (24), antd klemmt die
 * Polsterung auf 0. Das ist Geometrie, keine Ableitungsluecke — und die Suite
 * setzt `size` auf Bedienelementen ohnehin nicht (Falle 4).
 */

const HELL = buildTheme("light");
const TOKEN = antdTheme.getDesignToken(HELL);

const DICHTEN = [
  { name: "Einsatz", huelle: [] as unknown[], hoehe: TAP, hoeheLG: TAP_XL },
  { name: "Arbeit", huelle: [ARBEITSDICHTE], hoehe: 44, hoeheLG: 48 },
  { name: "Schreibtisch", huelle: [ARBEITSDICHTE, SCHREIBTISCHDICHTE], hoehe: 32, hoeheLG: 40 },
] as const;

const BAUTEILE = [
  { name: "Input", praefix: "input", element: () => createElement(Input) },
  { name: "InputNumber", praefix: "input-number", element: () => createElement(InputNumber) },
  { name: "DatePicker", praefix: "date-picker", element: () => createElement(DatePicker) },
] as const;

/** Das von antd erzeugte CSS fuer ein Bauteil unter Suite-Theme plus Dichten. */
function erzeugtesCss(huelle: readonly unknown[], kind: ReactNode) {
  const cache = createCache();
  const baum = huelle.reduceRight<ReactNode>(
    (innen, dichte) => createElement(ConfigProvider, { theme: dichte as never }, innen),
    kind,
  );
  renderToString(
    createElement(StyleProvider, { cache }, createElement(ConfigProvider, { theme: HELL }, baum)),
  );
  return extractStyle(cache, true);
}

/** Eine Pixel-Variable aus dem cssVar-Block des Bauteils, z. B. `--ant-input-padding-block`. */
function px(css: string, variable: string): number {
  const treffer = [...css.matchAll(new RegExp(`${variable}:([\\d.]+)px`, "g"))];
  expect(treffer.length, `${variable} fehlt im erzeugten CSS`).toBeGreaterThan(0);
  return Number(treffer.at(-1)![1]);
}

describe("Eingabehoehe — 16px Schrift und trotzdem auf der Bediendichte", () => {
  for (const dichte of DICHTEN) {
    for (const bauteil of BAUTEILE) {
      it(`${bauteil.name} unter der Dichte ${dichte.name}`, () => {
        const css = erzeugtesCss(dichte.huelle, bauteil.element());
        const v = `--ant-${bauteil.praefix}`;
        const rahmen = 2 * TOKEN.lineWidth;

        // Die Schrift, die das Feld traegt — und aus der die Polsterung
        // gerechnet sein muss. Faellt sie unter 16, ist das ein anderer Befund.
        expect(px(css, `${v}-input-font-size`)).toBe(16);
        expect(px(css, `${v}-input-font-size-lg`)).toBe(16);

        const hoehe = 2 * px(css, `${v}-padding-block`) + rahmen + 16 * TOKEN.lineHeight;
        const hoeheLG = 2 * px(css, `${v}-padding-block-lg`) + rahmen + 16 * TOKEN.lineHeightLG;
        expect(hoehe, `${bauteil.name}: ${hoehe.toFixed(2)}px`).toBeCloseTo(dichte.hoehe, 0);
        expect(hoeheLG, `${bauteil.name} lg: ${hoeheLG.toFixed(2)}px`).toBeCloseTo(dichte.hoeheLG, 0);
      });
    }
  }
});
