import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createCache, extractStyle, StyleProvider } from "@ant-design/cssinjs";
import { ConfigProvider, Select, theme as antdTheme } from "antd";
import { buildTheme, ARBEITSDICHTE, SCHREIBTISCHDICHTE } from "./theme";

/**
 * DAS AUSWAHLFELD FAELLT NICHT UNTER DIE 16px DER SUITE — UND DAS WIRD HIER
 * GEMESSEN, NICHT GELESEN.
 *
 * ⚠️ DIESER TEST GIBT ES, WEIL SEIN VORGAENGER DAS FALSCHE GEPRUEFT HAT.
 * `feldschrift.test.ts` hielt jahrelang fest, dass in `globals.css` eine Regel
 * `:root .ant-select-selector { font-size: 16px }` STEHT — und nannte sie „die
 * einzige Stelle, die das braucht". Sie stand da. Gewirkt hat sie seit antd 6
 * nicht mehr: diese Klasse wird nicht mehr gerendert (DRK-190). Ein Regex ueber
 * eine CSS-Datei kann das strukturell nicht sehen — er liest den Regeltext,
 * nicht den Baum, auf den die Regel zielt. Der Test war damit schlimmer als
 * kein Test: er hat jeden davon abgehalten, die Regel zu hinterfragen, und die
 * 16px-Zusage der Suite sah fuer jedes Auswahlfeld erfuellt aus, ohne es zu
 * sein.
 *
 * DESHALB RENDERT DIESER TEST. `extractStyle` aus `@ant-design/cssinjs` gibt
 * das CSS heraus, das antd fuer das Suite-Theme TATSAECHLICH erzeugt, und
 * `renderToString` das Markup dazu. Beides zusammen beantwortet die Frage, an
 * der der Vorgaenger gescheitert ist: **welche Klasse traegt die Schriftgroesse
 * heute?** Benennt ein antd-Major sie um, faellt dieser Test — laut, an der
 * Stelle, an der die Ursache sitzt.
 *
 * KEIN BROWSER NOETIG UND TROTZDEM EINE MESSUNG: die Zahlen stehen vollstaendig
 * im erzeugten Stylesheet, die Variablenkette ist rein rechnerisch aufloesbar.
 * Was ein Browser zusaetzlich zeigt — dass das Feld auf dem Schirm auch so hoch
 * bleibt —, misst `e2e/select-feldschrift.spec.ts`.
 */

const CSS_GLOBAL = readFileSync("src/app/globals.css", "utf8");

/** Das von antd fuer das Suite-Theme erzeugte CSS plus das Markup dazu. */
function antdAuswahlfeld(mode: "light" | "dark" = "light") {
  const cache = createCache();
  const markup = renderToString(
    createElement(
      StyleProvider,
      { cache },
      createElement(
        ConfigProvider,
        { theme: buildTheme(mode) },
        createElement(Select, { showSearch: true, options: [{ value: "a", label: "A" }] }),
      ),
    ),
  );
  return { markup, css: extractStyle(cache, true) };
}

/**
 * Alle Deklarationen eines Regelblocks, dessen Selektor GENAU so lautet.
 * Mehrere Bloecke desselben Selektors werden zusammengelegt — antd verteilt
 * seine `.ant-select`-Regeln auf zwei (Reset und Bauteil).
 */
function deklarationen(css: string, selektor: string): string {
  const treffer: string[] = [];
  for (const block of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    if (block[1].trim() === selektor) treffer.push(block[2]);
  }
  return treffer.join(";");
}

/**
 * Der Wert einer Deklaration aus einem Deklarationsblock — die LETZTE, nicht die
 * erste.
 *
 * ⚠️ Das ist keine Feinheit, sondern die Kaskade. antd verteilt seine
 * `.ant-select`-Regeln auf zwei Bloecke: der Reset setzt
 * `font-size: var(--ant-font-size)`, das Bauteil danach
 * `font-size: var(--ant-select-font-size)`. Bei gleichem Selektor gewinnt die
 * spaetere Deklaration. Wer die erste nimmt, misst den Reset und haelt die
 * Suite-Untergrenze faelschlich fuer unwirksam.
 */
function wert(block: string, eigenschaft: string): string | undefined {
  const regex = new RegExp(`(?:^|;)\\s*${eigenschaft.replace(/[-]/g, "\\-")}\\s*:([^;]*)`, "g");
  const treffer = [...block.matchAll(regex)];
  return treffer.at(-1)?.[1].trim();
}

/** Die drei Zahlen, die `globals.css` dem Auswahlfeld gibt. */
function suiteSchriftTrio() {
  const css = CSS_GLOBAL.replace(/\/\*[\s\S]*?\*\//g, "");
  const block = /:root\s+\.ant-select\s*\{([^}]*)\}/.exec(css);
  expect(block, "Regel `:root .ant-select { … }` fehlt in globals.css").not.toBeNull();
  const fontSize = wert(block![1], "--ant-select-font-size");
  const lineHeight = wert(block![1], "--ant-select-line-height");
  const fontHeight = wert(block![1], "--ant-select-font-height");
  return {
    fontSize: Number(String(fontSize).replace("px", "")),
    lineHeight: Number(lineHeight),
    fontHeight: Number(String(fontHeight).replace("px", "")),
  };
}

describe("Selektschrift — das Auswahlfeld haelt die 16px der Suite", () => {
  it("rendert die Klassen, auf die die Regel zielt — `.ant-select` und `input.ant-select-input`", () => {
    /*
     * DIE ZUSICHERUNG, DIE DRK-190 VERHINDERT HAETTE. Sie prueft nicht, dass in
     * `globals.css` ein Name steht, sondern dass antd ihn ausgibt. `grep` ueber
     * `node_modules/antd/es/` findet `select-selector` heute nur noch im
     * `color-picker`; im Markup eines Auswahlfeldes kommt er nicht vor.
     */
    const { markup } = antdAuswahlfeld();
    expect(markup).toMatch(/class="[^"]*\bant-select\b[^"]*"/);
    expect(markup, "das innere Eingabefeld heiszt nicht mehr `.ant-select-input`").toMatch(
      /<input[^>]*class="[^"]*\bant-select-input\b/,
    );
    expect(markup, "`.ant-select-selector` ist seit antd 6 fort — steht sie wieder da, gehoert diese Datei geprueft").not.toContain(
      "ant-select-selector",
    );
  });

  it("laesst das innere Eingabefeld die Schriftgroesse ERBEN — deshalb wirkt eine Regel am Elternknoten", () => {
    /*
     * Der Hebel der ganzen Datei. antd setzt
     * `.ant-select:not(.ant-select-customize) .ant-select-input { font-size:
     * inherit }` (0,3,0) — dagegen kaeme `globals.css` nicht an, und muss es
     * auch nicht: `inherit` reicht den Wert des Elternknotens durch. Faellt
     * `inherit` weg, ist die Regel in `globals.css` still wirkungslos.
     */
    const { css } = antdAuswahlfeld();
    const regel = deklarationen(css, ".ant-select:not(.ant-select-customize) .ant-select-input");
    expect(regel, "antds `.ant-select-input`-Regel fehlt — die Bauform hat sich geaendert").not.toBe("");
    expect(wert(regel, "font-size")).toBe("inherit");
  });

  it("haengt Schrift UND Hoehe des Feldes an genau den drei Variablen, die `globals.css` setzt", () => {
    /*
     * `.ant-select` traegt KEINE `height`. Die Hoehe entsteht aus
     * `padding-block` plus Rahmen plus Zeilenbox, und `padding-block` rechnet
     * antd aus `height` und `font-height`. Wer nur `font-size` anhebt, macht das
     * Feld hoeher (gemessen: 44px → 47,1px). Diese Zusicherung haelt fest, dass
     * die Rechnung noch so laeuft — sonst stimmt die Begruendung der drei Zahlen
     * in `globals.css` nicht mehr.
     */
    const { css } = antdAuswahlfeld();
    const block = deklarationen(css, ".ant-select");
    expect(wert(block, "font-size")).toBe("var(--ant-select-font-size)");
    expect(wert(block, "line-height")).toBe("var(--ant-select-line-height)");
    expect(wert(block, "padding-block")).toBe("var(--ant-select-padding-vertical)");
    expect(wert(block, "--ant-select-padding-vertical")).toBe(
      "calc((var(--ant-select-height) - var(--ant-select-font-height)) / 2 - var(--ant-select-border-size))",
    );
    // Und antds eigene Werte dafuer liegen unter der Suite-Untergrenze — sonst
    // braeuchte es die Regel in `globals.css` gar nicht.
    expect(wert(block, "--ant-select-font-size")).toBe("var(--ant-font-size)");
    expect(antdTheme.getDesignToken(buildTheme("light")).fontSize).toBeLessThan(16);
  });

  it("setzt in `globals.css` alle drei Variablen, und `:root` macht die Regel stark genug", () => {
    const css = CSS_GLOBAL.replace(/\/\*[\s\S]*?\*\//g, "");
    // (0,2,0) schlaegt antds `.ant-select` und `.ant-select-lg` (beide 0,1,0).
    // Ohne `:root` waere Gleichstand, und antds Stylesheet kommt spaeter.
    expect(css).toMatch(/:root\s+\.ant-select\s*\{/);
    expect(css, "die tote Regel auf `.ant-select-selector` ist zurueck").not.toMatch(
      /\.ant-select-selector\s*\{/,
    );
    const trio = suiteSchriftTrio();
    expect(trio.fontSize).toBe(16);
    expect(trio.lineHeight).toBeGreaterThan(0);
    expect(trio.fontHeight).toBeGreaterThan(0);
  });

  it("haelt die drei Zahlen aneinander — `font-height` IST `line-height` mal `font-size`", () => {
    /*
     * DAS IST DER HOEHENBEWEIS, UND ER IST ALGEBRAISCH.
     *
     * Feldhoehe = 2 × padding-block + 2 × Rahmen + Zeilenbox
     *           = 2 × ((h − fh) / 2 − lw) + 2 × lw + lh × fs
     *           = h − fh + lh × fs
     *
     * Die Bediendichte `h` faellt also genau dann heraus, wenn `fh === lh × fs`.
     * Stimmt das Paar nicht, waechst oder schrumpft JEDES Auswahlfeld der Suite
     * um die Differenz — in jeder Dichte gleichzeitig, und kein Tor sieht es.
     */
    const { fontSize, lineHeight, fontHeight } = suiteSchriftTrio();
    expect(fontHeight).toBe(lineHeight * fontSize);
  });

  it("laesst die Feldhoehe in allen drei Bediendichten auf ihrem `controlHeight`", () => {
    // Dieselbe Rechnung mit den echten Zahlen der drei Dichten — damit der
    // algebraische Satz oben nicht nur stimmt, sondern auch etwas bedeutet.
    const { fontSize, lineHeight, fontHeight } = suiteSchriftTrio();
    const dichten = {
      Einsatz: buildTheme("light"),
      Arbeit: { ...buildTheme("light"), token: { ...buildTheme("light").token, ...ARBEITSDICHTE.token } },
      Schreibtisch: {
        ...buildTheme("light"),
        token: { ...buildTheme("light").token, ...SCHREIBTISCHDICHTE.token },
      },
    };
    for (const [name, config] of Object.entries(dichten)) {
      const { controlHeight, lineWidth } = antdTheme.getDesignToken(config);
      const padding = (controlHeight - fontHeight) / 2 - lineWidth;
      const hoehe = 2 * padding + 2 * lineWidth + lineHeight * fontSize;
      expect(hoehe, `${name} (controlHeight ${controlHeight})`).toBe(controlHeight);
    }
  });

  it("gilt in beiden Farbmodi — die Regel haengt an keiner Farbe", () => {
    // Billig, aber nicht ueberfluessig: `buildTheme("dark")` schiebt einen
    // zweiten Algorithmus davor, und der rechnet die Schriftleiter mit.
    for (const modus of ["light", "dark"] as const) {
      const { css } = antdAuswahlfeld(modus);
      expect(wert(deklarationen(css, ".ant-select"), "font-size")).toBe("var(--ant-select-font-size)");
    }
  });
});
