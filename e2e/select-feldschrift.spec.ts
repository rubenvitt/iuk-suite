import { test, expect } from "@playwright/test";
import { devLogin, E2E_PORT } from "./fixtures";
import { ARBEITSDICHTE } from "@/core/theme/theme";

const PORTAL = `http://portal.localtest.me:${E2E_PORT}`;

/**
 * DAS AUSWAHLFELD TRAEGT 16px UND BLEIBT DABEI AUF SEINER BEDIENDICHTE
 * (DRK-190/DRK-191).
 *
 * ⚠️ DIE ZWEITE HAELFTE IST DER GRUND FUER DIESE DATEI, NICHT DIE ERSTE. Dass
 * die Schrift 16px misst, sieht auch `core/theme/selektschrift.test.ts` — es
 * liest antds erzeugtes CSS und rechnet die Variablenkette nach. Was es NICHT
 * sehen kann, ist die Hoehe: `.ant-select` traegt gar keine `height`, sondern
 * rechnet `padding-block = (height − font-height) / 2 − border` und laesst die
 * Zeilenbox den Rest machen. Hebt jemand `--ant-select-font-size` an, ohne
 * `--ant-select-line-height` und `--ant-select-font-height` mitzuziehen, wird
 * JEDES Auswahlfeld der Suite 3px hoeher als seine Dichte — gerechnet 44px →
 * 47,1px. Kein Tor sieht das: `typecheck` prueft gueltige Zahlen, `build`
 * serialisiert sie klaglos, und jsdom rechnet keine Layoutboxen (Falle 13).
 *
 * ⚠️ GEMESSEN WIRD GEGEN `controlHeight`, UND NICHT GEGEN DAS FELD DANEBEN —
 * das war der erste Versuch, und er ist im CI-Lauf 35143461471 aufgeflogen: er
 * griff im Nachbarfeld das INNERE `input` (25,1px) statt der Huelle. Daraus
 * wurde „jedes Eingabefeld ist 47,1px hoch" hochgerechnet — FALSCH, und zwar
 * gemessen (DRK-392): antd rechnet die Polsterung aus `inputFontSize`
 * (`antd/es/input/style/token.js`, `mergedFontSize`), die Huelle eines `Input`
 * mit `allowClear` misst auf dieser Seite 43,9px, bei 390 wie bei 1280px. Die
 * letzte Zusicherung unten haelt das fest, ebenfalls gegen `controlHeight`, mit
 * `toBeCloseTo`, weil antd die Polsterung auf 0,1px rundet (8,4 statt 8,43).
 * Die Rechnung dazu steht in `core/theme/eingabehoehe.test.ts`.
 *
 * `controlHeight` aus `ARBEITSDICHTE` statt einer notierten 44: die Zahl steht
 * dann an genau einer Stelle, und eine spaetere Dichteentscheidung macht diesen
 * Test nicht rot, ohne dass etwas kaputt waere.
 *
 * DIE SEITE IST `/admin/audit` im Portal: drei `Select` mit gesetztem Wert (der
 * angezeigte Text ist also sichtbar) in einer `FullShell`-Arbeitsflaeche, dort
 * gilt `ARBEITSDICHTE`. Dass das innere `input.ant-select-input` ebenfalls 16px
 * traegt, misst `lagerbuch-mobil.spec.ts` („kein Eingabefeld unter 16px") mit —
 * dort war es bis DRK-191 der einzige begruendete Ausschluss.
 */
test.describe("Auswahlfeld: 16px Schrift, Hoehe auf der Bediendichte", () => {
  for (const breite of [390, 1280]) {
    test(`bei ${breite}px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await devLogin(page, { host: "portal.localtest.me", groups: "dashboard-admins" });

      const antwort = await page.goto(PORTAL + "/admin/audit");
      expect(antwort?.status(), "/admin/audit: HTTP").toBe(200);
      await page.waitForLoadState("networkidle");

      const auswahl = page.locator(".ant-select").first();
      await expect(auswahl).toBeVisible();

      const gemessen = await page.evaluate(() => {
        const select = document.querySelector<HTMLElement>(".ant-select")!;
        const input = select.querySelector<HTMLElement>(".ant-select-input")!;
        const text = select.querySelector<HTMLElement>(".ant-select-content")!;
        const px = (el: Element) => parseFloat(getComputedStyle(el).fontSize);
        return {
          schriftFeld: px(select),
          schriftText: px(text),
          schriftInneresInput: px(input),
          hoehe: Math.round(select.getBoundingClientRect().height * 10) / 10,
        };
      });

      // ERST DIE SCHRIFT — der eigentliche Befund aus DRK-191. Der angezeigte
      // Wert und das innere Eingabefeld erben beide vom Auswahlfeld; steht dort
      // die 16, stehen sie ueberall.
      expect(gemessen.schriftFeld, "Auswahlfeld").toBe(16);
      expect(gemessen.schriftText, "angezeigter Wert").toBe(16);
      expect(gemessen.schriftInneresInput, "inneres `input.ant-select-input`").toBe(16);

      // DANN DIE HOEHE — die stille Nebenwirkung, gegen die die drei Variablen
      // in `globals.css` zusammengehoeren. Nur `--ant-select-font-size` zu
      // heben ergaebe hier 47,1px statt 44.
      expect(gemessen.hoehe, `Auswahlfeld ${gemessen.hoehe}px`).toBe(
        ARBEITSDICHTE.token!.controlHeight,
      );

      // UND DAS EINGABEFELD DANEBEN — an der HUELLE gemessen, nicht am inneren
      // `input` (DRK-392). Rundung ja, drei Pixel nein.
      const huelle = page.locator(".ant-input-affix-wrapper").first();
      await expect(huelle).toBeVisible();
      const eingabe = (await huelle.boundingBox())!.height;
      expect(eingabe, `Eingabefeld ${eingabe}px`).toBeCloseTo(ARBEITSDICHTE.token!.controlHeight!, 0);
    });
  }
});
