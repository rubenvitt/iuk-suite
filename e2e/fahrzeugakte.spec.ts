import { expect, test, type Page } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";

/**
 * Fahrzeugakte (IDA-299): vom Fahrzeug in die Akte, eine Prüfung anlegen und erledigt eintragen, die
 * Ampel auf Tafel und Hallentafel, Rechte. Der Funkkenner trägt einen Zufallsteil, damit Wiederholungen
 * gegen dieselbe Datenbank durchlaufen.
 *
 * Greifer: Kartentabelle rendert Tabelle UND Karten (Falle 14) — Zeilen über die benannte Tabelle und
 * `[data-row-key]`.
 */
const HOST = "fahrzeuge.localtest.me";
const url = (p: string) => `http://${HOST}:${E2E_PORT}${p}`;

async function oeffne(page: Page, pfad: string): Promise<void> {
  await page.goto(url(pfad));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);
}

/** Legt ein Fahrzeug an und gibt den Pfad seiner Akte zurück. */
async function legeFahrzeugAn(page: Page, kenner: string): Promise<string> {
  await oeffne(page, "/");
  await klickeWennRuhig(page.getByRole("button", { name: "Fahrzeug anlegen" }));
  const schublade = page.getByRole("dialog");
  await schublade.getByLabel("Typ").fill("KTW");
  await schublade.getByLabel("Funkrufname").fill(`Rotkreuz Akte ${kenner}`);
  await schublade.getByLabel("Funkkenner").fill(kenner);
  await schublade.getByLabel("Standort").fill("Teststadt");
  await schublade.getByRole("button", { name: "Speichern" }).click();
  await expect(schublade).toBeHidden();
  const verweis = page.getByRole("table", { name: "Fahrzeuge" }).getByRole("link", { name: `Rotkreuz Akte ${kenner}` });
  const pfad = await verweis.getAttribute("href");
  expect(pfad).toMatch(/^\/fahrzeug\/.+/);
  return pfad!;
}

test("Prüfung anlegen und erledigt eintragen, Ampel auf Tafel und Hallentafel", async ({ page }) => {
  const kenner = `98-${Date.now() % 100_000}-1`;
  await devLogin(page, { host: HOST, groups: "fahrzeuge-admin", callbackPath: "/" });
  const akte = await legeFahrzeugAn(page, kenner);

  await oeffne(page, akte);
  await expect(page.getByRole("heading", { name: `Rotkreuz Akte ${kenner}` })).toBeVisible();

  // Eine neue Akte ist leer; die erste Prüfung schlägt die HU vor.
  await klickeWennRuhig(page.getByRole("button", { name: "Prüfung hinzufügen" }).first());
  const neu = page.getByRole("dialog", { name: "Prüfung hinzufügen" });
  await expect(neu.getByLabel("Bezeichnung")).toHaveValue("HU (TÜV)");
  await neu.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(neu).toBeHidden();

  const termine = page.getByRole("table", { name: "Prüf- und Servicetermine" });
  const zeile = termine.locator("[data-row-key]").filter({ hasText: "HU (TÜV)" });
  await expect(zeile).toHaveCount(1);
  await expect(zeile).toContainText("nicht erfasst");

  // Erledigt mit dem vorbelegten Tag (heute): der nächste Termin liegt zwei Jahre weiter, also in Ordnung.
  await klickeWennRuhig(zeile.getByRole("button", { name: /Erledigt/ }));
  const erledigt = page.getByRole("dialog", { name: "HU (TÜV) erledigt eintragen" });
  await erledigt.getByRole("button", { name: "Eintragen" }).click();
  await expect(erledigt).toBeHidden();
  await expect(zeile).toContainText(/bis \d{2}\/\d{4}/);
  await expect(zeile).not.toContainText("nicht erfasst");

  // Die Tafel führt das Fahrzeug mit seinem Stand und zurück in die Akte.
  await oeffne(page, "/tafel");
  await expect(page.getByRole("heading", { name: "Fahrzeugtafel" })).toBeVisible();
  const tafelZeile = page.getByRole("table", { name: "Fahrzeugtafel" }).locator("[data-row-key]").filter({ hasText: kenner });
  await expect(tafelZeile).toHaveCount(1);
  await expect(tafelZeile).toContainText(/bis \d{2}\/\d{4}/);
  await expect(tafelZeile.getByRole("link").first()).toHaveAttribute("href", akte);

  // Die Hallentafel steht ohne Suite-Rahmen da.
  await oeffne(page, "/halle");
  await expect(page.getByRole("heading", { name: "Fahrzeuge · Termine" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: kenner })).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Modulnavigation" })).toHaveCount(0);
});

test("ohne Admin-Gruppe nur lesend, unbekannte Akte 404", async ({ page, browser }) => {
  const kenner = `97-${Date.now() % 100_000}-1`;
  await devLogin(page, { host: HOST, groups: "fahrzeuge-admin", callbackPath: "/" });
  const akte = await legeFahrzeugAn(page, kenner);

  const leser = await browser.newPage();
  await devLogin(leser, { host: HOST, groups: "fahrzeuge-nutzer", callbackPath: "/" });
  await oeffne(leser, akte);
  await expect(leser.getByRole("heading", { name: `Rotkreuz Akte ${kenner}` })).toBeVisible();
  await expect(leser.getByRole("button", { name: "Prüfung hinzufügen" })).toHaveCount(0);
  await expect(leser.getByRole("button", { name: "Kilometerstand eintragen" })).toHaveCount(0);
  await expect(leser.getByRole("button", { name: "Technische Daten bearbeiten" })).toHaveCount(0);

  const antwort = await leser.goto(url("/fahrzeug/gibt-es-nicht"));
  expect(antwort?.status()).toBe(404);
  await leser.close();
});
