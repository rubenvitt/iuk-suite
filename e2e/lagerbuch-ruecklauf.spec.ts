import { test, expect } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * RUECKLAUF VOM FAHRZEUG IN DAS HANDLAGER (DRK-366).
 *
 * Neben `ruecklauf.test.ts` und `VerfallEditor.test.tsx`, weil nur ein echter
 * Abruf drei Dinge zeigt: das Fahrzeugblatt rendert mit dem zweiten Dialog in
 * derselben `columns[].render` noch (Falle 9), die Server Action laeuft wirklich
 * (dort ist sie gemockt), und der Ist-Bestand sinkt um genau die gebuchte Menge.
 *
 * Die Spec BUCHT und arbeitet deshalb auf eigenen Zeilen (`ruecklaufFixtures`);
 * die Zusicherungen sind relativ, damit ein zweiter Lauf sie aushaelt.
 */
const BLATT = "/verwaltung/fahrzeuge/e2e-ruecklauf-fahrzeug";
const ARTIKEL = "E2E Rücklauf Wärmepack";

test.describe("Rücklauf vom Fahrzeug", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("bucht die Menge in das Handlager und senkt den Ist-Bestand", async ({ page }) => {
    const antwort = await page.goto(lagerbuchUrl(BLATT));
    expect(antwort!.status()).toBe(200);

    const istZelle = page.locator("[data-row-key='e2e-ruecklauf-soll'] [data-rolle='ist']");
    await expect(istZelle).toBeVisible();
    const vorher = Number((await istZelle.innerText()).match(/\d+/)![0]);
    expect(vorher).toBeGreaterThan(1);

    await klickeWennRuhig(page.getByRole("button", { name: `${ARTIKEL} zurück ins Handlager` }));
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Eine Charge an der Einheit — sie steht schon im Feld.
    await expect(dialog.getByText("E2E-RL", { exact: false })).toBeVisible();
    await dialog.getByLabel("Menge").fill("2");
    await klickeWennRuhig(dialog.getByRole("combobox", { name: "Ziel", exact: true }));
    await page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden)")
      .locator(".ant-select-item-option", { hasText: "Handlager (ohne Schrank)" })
      .first()
      .click();

    // Auf die ANTWORT warten, nicht auf eine spaetere Zustandsaenderung (Falle 10).
    const [aktionsAntwort] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes(BLATT)),
      page.getByRole("button", { name: "Zurückbuchen", exact: true }).click(),
    ]);
    expect(aktionsAntwort.status()).toBe(200);

    await expect(dialog).toBeHidden();
    await expect(istZelle).toContainText(String(vorher - 2));
  });
});
