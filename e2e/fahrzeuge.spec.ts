import { expect, test, type Page } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";

/**
 * Modul fahrzeuge (IDA-255): anlegen, Feldfehler bei doppeltem Funkkenner, außer Dienst stellen, Rechte.
 * Der Funkkenner trägt einen Zufallsteil, damit Wiederholungen gegen dieselbe Datenbank durchlaufen.
 *
 * Greifer: Kartentabelle rendert Tabelle UND Karten (Falle 14) — Zeilen über die benannte Tabelle und
 * `[data-row-key]`.
 */
const HOST = "fahrzeuge.localtest.me";
const url = (p: string) => `http://${HOST}:${E2E_PORT}${p}`;

async function oeffne(page: Page): Promise<void> {
  await page.goto(url("/"));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);
}

test("anlegen, doppelten Funkkenner abweisen, außer Dienst stellen", async ({ page }) => {
  const kenner = `99-${Date.now() % 100_000}-1`;
  await devLogin(page, { host: HOST, groups: "fahrzeuge-admin", callbackPath: "/" });
  await oeffne(page);

  const anlegen = async () => {
    await klickeWennRuhig(page.getByRole("button", { name: "Fahrzeug anlegen" }));
    const schublade = page.getByRole("dialog");
    await schublade.getByLabel("Typ").fill("RTW");
    await schublade.getByLabel("Funkrufname").fill(`Rotkreuz Test ${kenner}`);
    await schublade.getByLabel("Funkkenner").fill(kenner);
    await schublade.getByLabel("Standort").fill("Teststadt");
    await schublade.getByRole("button", { name: "Speichern" }).click();
    return schublade;
  };

  await expect(await anlegen()).toBeHidden();
  const tabelle = page.getByRole("table", { name: "Fahrzeuge" });
  const zeile = tabelle.locator("[data-row-key]").filter({ hasText: kenner });
  await expect(zeile).toHaveCount(1);
  await expect(zeile).toContainText("aktiv");

  const zweite = await anlegen();
  await expect(zweite.getByText("Diesen Funkkenner hat schon ein anderes Fahrzeug.").first()).toBeVisible();
  await zweite.getByRole("button", { name: "Abbrechen" }).click();

  await klickeWennRuhig(zeile.getByRole("button", { name: "Außer Dienst stellen" }));
  await expect(zeile).toContainText("außer Dienst");
  await expect(zeile.getByRole("button", { name: "In Dienst stellen" })).toBeVisible();
});

test("ohne Admin-Gruppe nur lesend, ohne Gruppe 403", async ({ page, browser }) => {
  await devLogin(page, { host: HOST, groups: "fahrzeuge-nutzer", callbackPath: "/" });
  await oeffne(page);
  await expect(page.getByRole("heading", { name: "Fahrzeuge" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fahrzeug anlegen" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bearbeiten" })).toHaveCount(0);

  const fremd = await browser.newPage();
  await devLogin(fremd, { host: HOST, groups: "kommplan-nutzer", callbackPath: "/" });
  const antwort = await fremd.goto(url("/"));
  // Die Middleware verweigert (`canAccess`), bevor die Seite ihren eigenen 404-Riegel erreicht.
  expect(antwort?.status()).toBe(403);
  await fremd.close();
});
