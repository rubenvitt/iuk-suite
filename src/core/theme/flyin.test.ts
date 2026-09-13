import { describe, expect, it } from "vitest";
import { FLYIN_MAX_ANTEIL_PROZENT, flyinBreite } from "./flyin";

/**
 * ⚠️ WAS DIESE DATEI NICHT LEISTEN KANN — und warum sie trotzdem hier steht.
 *
 * Ob eine Schublade tatsaechlich aus dem Bild waechst, entscheidet eine
 * LAYOUTBOX, und jsdom rechnet keine: `getBoundingClientRect()` liefert dort
 * ueberall Nullen, und `min()`/`vw` wertet es gar nicht erst aus. Ein Test,
 * der hier „die Schublade passt ins Fenster" behauptet, behauptete etwas
 * ueber eine Zahl, die niemand ausgerechnet hat.
 *
 * Dieser Test haelt deshalb nur die FORM der Zeichenkette fest — genau die
 * Eigenschaft, an der die Durchleitung durch antd und rc-drawer haengt
 * (beide entscheiden an `Number(wert)` bzw. an einem Ziffern-Muster, ob sie
 * die Zeichenkette als Zahl lesen). Die Wirkung misst `e2e/flyin-breite.spec.ts`
 * in einem echten Browser.
 */
describe("flyinBreite", () => {
  it("deckelt den Grundwert auf den Fensteranteil", () => {
    expect(flyinBreite(880)).toBe("min(880px, 92vw)");
  });

  it("traegt den Anteil aus der Konstanten, nicht aus einem zweiten Literal", () => {
    expect(flyinBreite(360)).toContain(`${FLYIN_MAX_ANTEIL_PROZENT}vw`);
  });

  /**
   * DIE EIGENTLICHE ZUSAGE DIESER DATEI. antd liest eine `size`-Zeichenkette
   * als Zahl, sobald sie auf `/^\d+(\.\d+)?$/` passt
   * (`antd/es/drawer/Drawer.js:93-98`); rc-drawer tut dasselbe ueber
   * `Number(wert.replace(/px$/i, ""))` (`@rc-component/drawer/es/util.js:3-14`).
   * Faellt der Ausdruck jemals auf eine nackte Zahl zusammen, verschwindet
   * der Deckel STILL — die Schublade bekaeme wieder eine feste Breite, und
   * kein Tor der Kette wuerde rot.
   */
  it("bleibt fuer antd und rc-drawer eine Zeichenkette, keine Zahl", () => {
    for (const grund of [360, 480, 880]) {
      const wert = flyinBreite(grund);
      expect(wert).not.toMatch(/^\d+(\.\d+)?$/);
      expect(Number.isNaN(Number(wert.replace(/px$/i, "")))).toBe(true);
    }
  });
});
