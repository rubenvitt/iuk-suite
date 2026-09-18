/**
 * DER QUELLTEXT-SCAN ZU `schmalkarten.module.css` (DRK-421).
 *
 * ⚠️ WAS DIESER TEST BESITZT UND WAS NICHT — die Aufteilung steht in
 * `docs/design/README.md`, „Tests für Responsives":
 *
 *  * Der Quelltext-Scan besitzt „die Klasse trägt die RICHTIGE Media Query".
 *  * Playwright bei 390×844 besitzt „man sieht die Karten".
 *  * Playwright bei 1280×720 besitzt die andere Hälfte, „man sieht sie DORT
 *    NICHT" — ohne die kann eine `display:none`-Regel gar nicht widerlegt
 *    werden, und genau so ist Falle 5 einmal durchgekommen.
 *
 * ⚠️ jsdom WERTET MEDIA QUERIES NICHT AUS. Ein Vitest, der „auf 390px ist die
 * Tabelle unsichtbar" behauptet und dafür im DOM sucht, geht IMMER durch — er
 * misst nichts, und der grüne Balken ist eine Lüge. Deshalb liest dieser Test
 * die Datei, statt etwas zu rendern.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(new URL("./schmalkarten.module.css", import.meta.url), "utf8");

describe("schmalkarten.module.css", () => {
  it("kennt genau EINEN Breakpoint, und das ist der der Suite", () => {
    const breakpoints = [...CSS.matchAll(/(?:min|max)-width:\s*([\d.]+)px/g)].map((t) => t[1]);
    expect(breakpoints.length).toBeGreaterThan(0);
    // 768 in `min-width`, 767.98 in `max-width` — die Schreibweise der Suite.
    // Ein Modul, das bei 600px schaltet, ist bei 390px nicht von einem
    // richtigen zu unterscheiden und dazwischen kaputt.
    expect([...new Set(breakpoints)]).toEqual(["768"]);
  });

  it("ist mobile-first: die schmale Ansicht steht in der BASIS, die Tabelle kommt dazu", () => {
    /*
     * ⚠️ DIE RICHTUNG IST DIE AUSSAGE. Andersherum geschrieben zeigte alles,
     * was Media Queries nicht auswertet, die BREITE Darstellung — also genau
     * die, die auf einem schmalen Schirm nicht zu bedienen ist.
     */
    const basis = CSS.slice(0, CSS.indexOf("@media"));
    expect(basis).toMatch(/\.breit\s*\{[^}]*display:\s*none/);
    expect(basis).not.toMatch(/\.nurSchmal\s*\{[^}]*display:\s*none/);

    const abBreit = CSS.slice(CSS.indexOf("@media"));
    expect(abBreit).toMatch(/\.nurSchmal\s*\{[^}]*display:\s*none/);
    expect(abBreit).toMatch(/\.breit\s*\{[^}]*display:\s*block/);
  });

  it("gibt `.nurSchmal` in der BASIS ueberhaupt kein `display` (Falle 5)", () => {
    /*
     * Die Klasse haengt auch an Flaechen, die ihr eigenes `display` mitbringen
     * — die Kartenliste `flex`, eine antd-`Flex` ihr `display: flex` aus
     * `.ant-flex`. Ein `display` in der Basis (auch ein `revert`) traete gegen
     * jenes an: beide einklassig, und dann entscheidet die Reihenfolge im
     * Stylesheet. Bei antds zur Laufzeit eingespritztem CSS ist das nichts,
     * worauf man bauen kann — und der Bruch waere still.
     */
    const basis = CSS.slice(0, CSS.indexOf("@media"));
    expect(basis).not.toMatch(/\.nurSchmal\s*\{/);
  });

  it("gibt den übersprungenen Karten eine Platzhaltergröße", () => {
    /*
     * `content-visibility: auto` OHNE `contain-intrinsic-size` ist schlimmer
     * als gar keine Optimierung: eine übersprungene Karte meldet Höhe 0, die
     * Bildlaufleiste springt beim Scrollen, und ein Ziel weiter unten ist nicht
     * zu treffen. Die beiden gehören zusammen, und diese Zusicherung hält sie
     * zusammen.
     */
    expect(CSS).toMatch(/content-visibility:\s*auto/);
    expect(CSS).toMatch(/contain-intrinsic-size:\s*auto\s+var\(--tab-kartenhoehe/);
  });
});
