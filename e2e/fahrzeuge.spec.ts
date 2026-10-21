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

test("Erstimport: Vorschau nur mit Verwaltungsrecht", async ({ page, browser }) => {
  await devLogin(page, { host: HOST, groups: "fahrzeuge-admin", callbackPath: "/erstimport" });
  await page.goto(url("/erstimport"));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);
  await expect(page.getByRole("heading", { name: "Erstimport" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vorschau" })).toBeVisible();
  await expect(page.getByTestId("erstimport-summe")).toContainText("neue Fahrzeuge");
  await expect(page.getByRole("button", { name: "Übernehmen" })).toBeVisible();

  const nutzer = await browser.newPage();
  await devLogin(nutzer, { host: HOST, groups: "fahrzeuge-nutzer", callbackPath: "/erstimport" });
  await nutzer.goto(url("/erstimport"));
  await expect(nutzer.getByText("Den Erstimport führt eine Person mit Verwaltungsrecht durch.")).toBeVisible();
  await expect(nutzer.getByRole("heading", { name: "Vorschau" })).toHaveCount(0);
  await nutzer.close();
});

test("das Einsatzbuch übernimmt ein Fahrzeug aus der Fahrzeugverwaltung", async ({ page }) => {
  const kenner = `98-${Date.now() % 100_000}-1`;
  // Eine Anmeldung mit beiden Gruppen: die Sitzung gilt über die gemeinsame Cookie-Domain auf beiden Hosts.
  await devLogin(page, { host: HOST, groups: "fahrzeuge-admin,einsatzbuch-nutzer", callbackPath: "/" });
  await oeffne(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Fahrzeug anlegen" }));
  const schublade = page.getByRole("dialog");
  await schublade.getByLabel("Typ").fill("KTW");
  await schublade.getByLabel("Funkrufname").fill(`Rotkreuz Abgleich ${kenner}`);
  await schublade.getByLabel("Funkkenner").fill(kenner);
  await schublade.getByLabel("Standort").fill("Teststadt");
  await schublade.getByRole("button", { name: "Speichern" }).click();
  await expect(schublade).toBeHidden();

  await page.goto(`http://einsatzbuch.localtest.me:${E2E_PORT}/stammdaten?reiter=fahrzeuge`);
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Aus Fahrzeugverwaltung abgleichen" }));
  const vorschau = page.getByRole("table", { name: "Vorschau des Abgleichs mit der Fahrzeugverwaltung" });
  await expect(vorschau.locator("[data-row-key]").filter({ hasText: kenner })).toContainText("Neu");
  await page.getByRole("dialog").getByRole("button", { name: "Übernehmen" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("cell", { name: `Rotkreuz Abgleich ${kenner}` })).toBeVisible();
});

test("das Lagerbuch legt ein Fahrzeug aus der Fahrzeugverwaltung an und gleicht es ab", async ({ page }) => {
  const kenner = `97-${Date.now() % 100_000}-1`;
  await devLogin(page, { host: HOST, groups: "fahrzeuge-admin,lagerbuch-admin", callbackPath: "/" });
  await oeffne(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Fahrzeug anlegen" }));
  const schublade = page.getByRole("dialog");
  await schublade.getByLabel("Typ").fill("GW-San");
  await schublade.getByLabel("Funkrufname").fill(`Rotkreuz Lager ${kenner}`);
  await schublade.getByLabel("Funkkenner").fill(kenner);
  await schublade.getByLabel("Standort").fill("Teststadt");
  await schublade.getByRole("button", { name: "Speichern" }).click();
  await expect(schublade).toBeHidden();

  await page.goto(`http://lagerbuch.localtest.me:${E2E_PORT}/verwaltung/fahrzeuge`);
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Neue Einheit" }));
  const dialog = page.getByRole("dialog");
  await dialog.locator("label.ant-radio-button-wrapper", { hasText: "Fahrzeug" }).click();
  const auswahl = dialog.getByLabel("Fahrzeug aus der Fahrzeugverwaltung");
  await auswahl.click();
  await auswahl.fill(kenner);
  await page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option", { hasText: kenner }).click();
  const gespeichert = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/verwaltung/fahrzeuge"));
  await dialog.getByRole("button", { name: "Anlegen" }).click();
  expect((await gespeichert).status()).toBe(200);
  await expect(page.locator("[data-row-key]", { hasText: `GW-San ${kenner}` }).first()).toBeVisible();

  await klickeWennRuhig(page.getByRole("button", { name: "Mit Fahrzeugverwaltung abgleichen" }));
  const vorschau = page.getByRole("table", { name: "Vorschau des Abgleichs mit der Fahrzeugverwaltung" });
  await expect(vorschau.locator("[data-row-key]").filter({ hasText: `GW-San ${kenner}` })).toContainText("Unverändert");
});
