/**
 * DER QUELLTEXT-SCAN ZU `spaltenkarte.module.css` (DRK-451).
 *
 * ⚠️ DIESELBE AUFTEILUNG WIE BEI `schmalkarten.test.ts`, und sie steht in
 * `docs/design/README.md`, „Tests für Responsives": der Quelltext-Scan besitzt
 * „die Datei trägt die richtige Regel", Playwright besitzt „man sieht es".
 * jsdom wertet Media Queries nicht aus und rechnet keine Layoutboxen — ein
 * Vitest, der hier etwas über Sichtbarkeit oder Breite behauptet, misst nichts.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(new URL("./spaltenkarte.module.css", import.meta.url), "utf8");

describe("spaltenkarte.module.css", () => {
  /*
   * ⚠️ DIE KARTE DARF KEINE EIGENE MEDIA QUERY HABEN. Ob sie zu sehen ist,
   * entscheidet `schmalkarten.module.css` an der Liste darüber. Eine zweite
   * Abfrage hier wäre ein zweiter Ort für dieselbe Zahl — genau das, was „ein
   * Breakpoint" ausschließt, und beim nächsten Umbau liefen die beiden
   * auseinander, ohne dass ein Tor rot würde.
   */
  it("bringt keinen eigenen Breakpoint mit", () => {
    expect(CSS).not.toMatch(/@media/);
  });

  /*
   * ⚠️ `--ant-*` IST NICHT GLOBAL (Falle 2). antd deklariert seine Variablen auf
   * seiner Scope-Klasse; eigenes Markup sieht sie nicht, und der Fehler ist
   * still — die Linie verschwindet einfach. Erlaubt sind die `--iuk-*` aus
   * `app/globals.css`, die dort auf `:root` stehen UND einen Dunkelzweig haben.
   */
  it("greift auf keine antd-Variable zu", () => {
    expect(CSS).not.toMatch(/var\(\s*--ant-/);
  });

  it("benutzt nur Variablen, die global deklariert sind und einen Dunkelzweig haben", () => {
    const globals = readFileSync(
      new URL("../../app/globals.css", import.meta.url),
      "utf8",
    );
    const hell = globals.slice(globals.indexOf(":root {"), globals.indexOf(":root[data-theme=\"dark\"]"));
    const dunkel = globals.slice(globals.indexOf(":root[data-theme=\"dark\"]"));
    const benutzt = [...new Set(
      [...CSS.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((treffer) => treffer[1]),
    )];
    expect(benutzt.length).toBeGreaterThan(0);
    for (const name of benutzt) {
      // `--font-*` kommen aus dem Schriftlader, `--tab-*` setzt die Komponente
      // selbst als Inline-Variable — beide sind keine Themefarben.
      if (name.startsWith("--font-") || name.startsWith("--tab-")) continue;
      expect(hell, `${name} fehlt im hellen Zweig`).toContain(`${name}:`);
      expect(dunkel, `${name} fehlt im Dunkelzweig`).toContain(`${name}:`);
    }
  });

  /*
   * ⚠️ „Handlungsknöpfe unter 768px sind volle Breite und stehen untereinander"
   * (`docs/design/README.md`) — und die Karte gibt es NUR unter 768px. Ein
   * `row` hier wäre die Tabellenzelle zurück, in der die Knöpfe nebeneinander
   * stehen und der Daumen zwischen zwei 60px-Zielen wählen muss.
   */
  it("stellt die Handlungen untereinander und über die volle Breite", () => {
    const aktionen = CSS.slice(CSS.indexOf(".aktionen {"));
    expect(aktionen).toMatch(/flex-direction:\s*column/);
    // Ohne `s`-Flag: das Ziel der Suite ist ES2017, und `tsc` lehnt es dort ab
    // („This regular expression flag is only available when targeting
    // 'es2018' or later"). `[\s\S]` leistet dasselbe und ist überall gültig.
    expect(CSS).toMatch(/\.aktionen :global\(\.ant-btn\)[\s\S]*?\{[\s\S]*?width:\s*100%/);
  });

  /*
   * ⚠️ DIE KARTE NIMMT NIEMANDEM DEN FOKUSRING. Sie fügt selbst kein
   * Bedienelement hinzu; was die Spalten an Links und Knöpfen mitbringen, ist
   * das einzige Bedienbare darin — und ein `outline: none` von hier aus träfe
   * genau die.
   */
  it("schaltet nirgends den Fokusring ab", () => {
    expect(CSS).not.toMatch(/outline:\s*(none|0)/);
  });

  /*
   * Ein langer Artikelname darf die Karte nicht breiter machen als den Schirm —
   * eine Karte, die waagerecht scrollt, wäre die Tabelle zurück.
   */
  it("lässt lange Werte umbrechen statt die Karte zu sprengen", () => {
    expect(CSS).toMatch(/overflow-wrap:\s*anywhere/);
    const wert = CSS.slice(CSS.indexOf(".wert {"));
    expect(wert).toMatch(/min-width:\s*0/);
  });
});
