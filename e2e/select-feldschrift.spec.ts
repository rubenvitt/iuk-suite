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
 * das war der erste Versuch, und er ist im CI-Lauf 35143461471 aufgeflogen.
 * Die Zusage „das Auswahlfeld faellt nicht aus der Reihe" gegen den Nachbarn zu
 * pruefen war als Gedanke richtig (unabhaengig von der Bediendichte), setzt aber
 * voraus, dass der Nachbar selbst auf der Reihe steht. Er steht es nicht:
 * gemessen 44,0px fuer das Auswahlfeld und 25,1px fuer das innere `input` eines
 * antd-`Input`, dessen Huelle damit auf 47,1px kommt. **Jedes Eingabefeld der
 * Suite ist 3px hoeher als seine Dichte** — dieselbe Mechanik wie hier, nur beim
 * Setzen von `inputFontSize: 16` nie aufgefallen (DRK-392, eigener Posten; die
 * Zahl hier NICHT daran anpassen, sonst zementiert dieser Test den Fehler).
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
    });
  }
});
