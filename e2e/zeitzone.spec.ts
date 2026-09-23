import { test, expect, type Page } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";

/**
 * DIE ANZEIGEZONE DER SUITE (DRK-469) — der Rundlauf durch die echte Verdrahtung.
 *
 * Vitest sieht die Teile einzeln. Ob sie zusammen tragen, sieht nur ein echter
 * Server: Die Server-Action schreibt die Datenbank und den prozessweiten
 * Speicher auf `globalThis`, das Root-Layout liest ihn im RSC-Bundle, und der
 * Browser liest `<html data-zeitzone>`. Stünde der Speicher in einer
 * Modulvariable, bliebe das Attribut hier auf `Europe/Berlin`.
 *
 * Der Test verstellt eine SUITEWEITE Einstellung. `workers: 1`
 * (`playwright.config.ts`) hält fremde Specs heraus, und `afterEach` stellt den
 * Standard zurück, damit keine spätere Datei in UTC rechnet.
 */

async function waehleZone(page: Page, zone: string): Promise<void> {
  const formular = page.getByTestId("zeitzone-form");
  await klickeWennRuhig(formular.getByRole("combobox"));
  await page.keyboard.type(zone);
  // Enter nimmt den ersten Treffer. `getByRole("option")` träfe antds
  // unsichtbare Barrierefreiheits-Liste, nicht den sichtbaren Eintrag.
  await page.keyboard.press("Enter");
  await expect(formular.locator('input[name="zeitzone"]')).toHaveValue(zone);
  const antwort = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin"));
  await formular.getByRole("button", { name: /Speichern/ }).click();
  expect((await antwort).ok()).toBe(true);
}

test.afterEach(async ({ page }) => {
  await page.reload();
  if ((await page.locator("html").getAttribute("data-zeitzone")) !== "Europe/Berlin") {
    await waehleZone(page, "Europe/Berlin");
  }
});

test("die Verwaltung stellt die Zeitzone der Suite um, und das Root-Layout reicht sie an den Browser", async ({
  page,
}) => {
  await devLogin(page, {
    host: "portal.localtest.me",
    groups: "dashboard-admins",
    callbackPath: "/admin",
  });

  await expect(page.locator("html")).toHaveAttribute("data-zeitzone", "Europe/Berlin");
  await waehleZone(page, "UTC");

  // Neu laden statt dem Formular zu glauben: die Zone muss Datenbank UND
  // Prozessspeicher erreicht haben, nicht nur den Client-State.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-zeitzone", "UTC");
  await expect(page.getByTestId("zeitzone-form").locator('input[name="zeitzone"]')).toHaveValue("UTC");
});
