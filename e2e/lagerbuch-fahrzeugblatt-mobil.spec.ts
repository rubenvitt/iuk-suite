import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * DAS FAHRZEUGBLATT LAEUFT NICHT WAAGERECHT UEBER (DRK-343).
 *
 * ⚠️ WARUM DAS EIN EIGENER, ECHTER ABRUF SEIN MUSS: die Ursache ist eine
 * IMPLIZITE GRID-SPALTE. Eine `auto`-Spalte waechst auf die MINDESTBREITE ihres
 * Inhalts, und die ist bei einer Tabelle die Summe der Spalten-Mindestbreiten —
 * das `scroll.x` der `Datentabelle` kommt dann gar nicht zum Zug, weil nichts
 * zu eng wird. `typecheck` prueft eine gueltige CSS-Zeichenkette, `build`
 * serialisiert sie klaglos, und Vitest kann es STRUKTURELL nicht sehen, weil
 * jsdom keine Layoutboxen rechnet (Falle 13, `CLAUDE.md`). Nur die Zahl hier
 * kennt den Unterschied.
 *
 * Gemessen vor der Abhilfe: 210px Ueberlauf bei 375px Breite, 105px bei 480px.
 * `SollEditor` kannte dieselbe Falle seit DRK-315; `VerfallEditor` eine Tuer
 * weiter hatte sie nie behoben.
 *
 * ⚠️ GEPRUEFT WIRD DAS DOKUMENT, NICHT DIE TABELLE. Eine Tabelle DARF breiter
 * sein als ihr Platz — sie scrollt dann in sich, und genau das ist gewollt.
 * Falsch ist erst, wenn die SEITE waagerecht scrollt: dann wandert bei jedem
 * Wisch die ganze Oberflaeche, und die Bedienelemente stehen nicht mehr da, wo
 * man sie gerade gesehen hat.
 */
test.describe("Fahrzeugblatt auf schmalem Schirm", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  for (const breite of [375, 480, 768]) {
    test(`scrollt bei ${breite}px nicht waagerecht`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 800 });
      const antwort = await page.goto(
        lagerbuchUrl("/verwaltung/fahrzeuge/e2e-verfall-fahrzeug"));
      expect(antwort!.status()).toBe(200);

      // Erst wenn der Abschnitt steht, ist die Tabelle gerendert — sonst misst
      // die Probe eine Seite, auf der das Breite machende Element noch fehlt.
      await page.getByRole("heading", { name: "Verfall im Fahrzeug" }).waitFor();

      const masse = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        sicht: document.documentElement.clientWidth,
      }));
      expect(
        masse.scroll - masse.sicht,
        `Das Dokument ragt bei ${breite}px um ${masse.scroll - masse.sicht}px über die Sichtfläche`,
      ).toBeLessThanOrEqual(0);
    });
  }
});
