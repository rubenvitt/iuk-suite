import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";

const PORTAL = "http://portal.localtest.me:3100";

/**
 * DAS AUSWAHLFELD TRAEGT 16px UND BLEIBT DABEI SO HOCH WIE SEINE NACHBARN
 * (DRK-190/DRK-191).
 *
 * ⚠️ DIE ZWEITE HAELFTE IST DER GRUND FUER DIESE DATEI, NICHT DIE ERSTE. Dass
 * die Schrift 16px misst, sieht auch `core/theme/selektschrift.test.ts` — es
 * liest antds erzeugtes CSS und rechnet die Variablenkette nach. Was es NICHT
 * sehen kann, ist die Hoehe: `.ant-select` traegt gar keine `height`, sondern
 * rechnet `padding-block = (height − font-height) / 2 − border` und laesst die
 * Zeilenbox den Rest machen. Hebt jemand `--ant-select-font-size` an, ohne
 * `--ant-select-line-height` und `--ant-select-font-height` mitzuziehen, wird
 * JEDES Auswahlfeld der Suite 3px hoeher als sein Nachbarfeld — gemessen 44px →
 * 47,1px. Kein Tor sieht das: `typecheck` prueft gueltige Zahlen, `build`
 * serialisiert sie klaglos, und jsdom rechnet keine Layoutboxen (Falle 13).
 *
 * GEMESSEN WIRD GEGEN DEN NACHBARN, NICHT GEGEN EINE ZAHL. Auf derselben
 * Filterzeile stehen antd-`Select` und antd-`Input` nebeneinander, beide auf
 * demselben `controlHeight`. Ein Vergleich der beiden ist damit unabhaengig
 * davon, welche Bediendichte die Seite gerade faehrt (44, 56 oder 32) — und
 * genau das ist die Zusage, die zaehlt: das Auswahlfeld faellt nicht aus der
 * Reihe. Eine hart notierte 44 wuerde bei der naechsten Dichteentscheidung rot,
 * ohne dass etwas kaputt waere.
 *
 * DIE SEITE IST `/admin/audit` im Portal: drei `Select` mit gesetztem Wert (der
 * angezeigte Text ist also sichtbar) neben zwei echten `Input`. Dass das innere
 * `input.ant-select-input` ebenfalls 16px traegt, misst
 * `lagerbuch-mobil.spec.ts` („kein Eingabefeld unter 16px") mit — dort war es
 * bis DRK-191 der einzige begruendete Ausschluss.
 */
test.describe("Auswahlfeld: 16px Schrift, Hoehe wie die Nachbarfelder", () => {
  for (const breite of [390, 1280]) {
    test(`bei ${breite}px`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: 900 });
      await devLogin(page, { host: "portal.localtest.me", groups: "dashboard-admins" });

      const antwort = await page.goto(PORTAL + "/admin/audit");
      expect(antwort?.status(), "/admin/audit: HTTP").toBe(200);
      await page.waitForLoadState("networkidle");

      const auswahl = page.locator(".ant-select").first();
      const feld = page.getByLabel("Personenkennung");
      await expect(auswahl).toBeVisible();
      await expect(feld).toBeVisible();

      const gemessen = await page.evaluate(() => {
        const select = document.querySelector<HTMLElement>(".ant-select")!;
        const input = select.querySelector<HTMLElement>(".ant-select-input")!;
        const text = select.querySelector<HTMLElement>(".ant-select-content")!;
        const nachbar = document.querySelector<HTMLElement>('input[aria-label="Personenkennung"]')!;
        const px = (el: Element) => parseFloat(getComputedStyle(el).fontSize);
        return {
          schriftFeld: px(select),
          schriftText: px(text),
          schriftInneresInput: px(input),
          hoeheAuswahl: Math.round(select.getBoundingClientRect().height * 10) / 10,
          hoeheNachbar: Math.round(nachbar.getBoundingClientRect().height * 10) / 10,
        };
      });

      // ERST DIE SCHRIFT — der eigentliche Befund aus DRK-191. Der angezeigte
      // Wert und das innere Eingabefeld erben beide vom Auswahlfeld; steht dort
      // die 16, stehen sie ueberall.
      expect(gemessen.schriftFeld, "Auswahlfeld").toBe(16);
      expect(gemessen.schriftText, "angezeigter Wert").toBe(16);
      expect(gemessen.schriftInneresInput, "inneres `input.ant-select-input`").toBe(16);

      // DANN DIE HOEHE — die stille Nebenwirkung, gegen die die drei Variablen
      // in `globals.css` zusammengehoeren.
      expect(
        gemessen.hoeheAuswahl,
        `Auswahlfeld ${gemessen.hoeheAuswahl}px, Nachbarfeld ${gemessen.hoeheNachbar}px`,
      ).toBe(gemessen.hoeheNachbar);
    });
  }
});
