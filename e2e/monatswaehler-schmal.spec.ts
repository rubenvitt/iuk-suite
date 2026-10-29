import { test, expect } from "@playwright/test";
import { devLogin, klickeWennRuhig, warteAufGestreamteInhalte, warteAufSpaltenaufteilung } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";
import { pruefeOffenesFenster } from "./helpers/waehler";

/**
 * DER OFFENE MONATSWAEHLER RAGT NICHT UEBER EIN 375px-TELEFON (IDA-242).
 *
 * antd rechnet die Breite JEDES Wählerfensters (Tag, Monat, Jahr) aus
 * `cellWidth * 7 + 2 * pickerDatePanelPaddingHorizontal`, und `cellWidth` aus
 * `controlHeightSM * 1.5`. Mit der Arbeitsdichte (44 → SM 33) waren das 382,5px,
 * mit der Einsatzdichte (56 → SM 42) sogar 477px. Gemessen vor der Abhilfe bei
 * 375px: das Fenster begann auf dem Fahrzeugblatt 172px, im Aussondern-Dialog
 * 40px links ausserhalb der Sichtflaeche (gemeldet war, je nach Lage des Felds,
 * auch ein 476px breites Dokument). Deshalb prueft der Test beides: den
 * Ueberlauf des Dokuments UND die Kanten des Fensters.
 *
 * ⚠️ NUR EIN ECHTER BROWSER SIEHT DAS: jsdom rechnet keine Layoutboxen, und das
 * Fenster haengt als Portal am `body`, nicht in der Tabelle, die in sich scrollen
 * darf. Gemessen wird deshalb das DOKUMENT und die Box des Fensters selbst.
 */
test.describe("Monatswähler auf schmalem Telefon", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
    await page.setViewportSize({ width: 375, height: 800 });
  });

  test("Verfall auf dem Fahrzeugblatt", async ({ page }) => {
    const antwort = await page.goto(lagerbuchUrl("/verwaltung/fahrzeuge/e2e-verfall-fahrzeug"));
    expect(antwort!.status()).toBe(200);
    await warteAufGestreamteInhalte(page);
    await page.locator("[data-rolle='bestandsliste']").waitFor();
    await warteAufSpaltenaufteilung(page);

    // Nur öffnen, nichts wählen: das Fahrzeug teilen sich andere Specs.
    await klickeWennRuhig(page.getByRole("button", { name: "Verfall E2E Verfall NaCl ändern" }));
    await pruefeOffenesFenster(page, ".ant-picker-month-panel");
  });

  test("Verfall im Aussondern-Dialog", async ({ page }) => {
    const antwort = await page.goto(lagerbuchUrl("/verwaltung/fahrzeuge/e2e-aussondern-fahrzeug"));
    expect(antwort!.status()).toBe(200);
    await warteAufGestreamteInhalte(page);
    await page.locator("[data-rolle='bestandsliste']").waitFor();
    await warteAufSpaltenaufteilung(page);

    await klickeWennRuhig(page.getByRole("button", { name: "Aktionen für E2E Verfall NaCl" }));
    await page.getByRole("menuitem", { name: "Aussondern" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Nur öffnen, nicht absenden: der Dialog bucht sonst ab.
    await dialog.getByLabel("Verfall").click();
    await pruefeOffenesFenster(page, ".ant-picker-month-panel");
  });
});
