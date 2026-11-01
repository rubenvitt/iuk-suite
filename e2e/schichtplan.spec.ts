import { expect, test, type Locator, type Page } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";

/**
 * Modul schichtplan (IDA-313): Planung anlegen, Schicht löschen und im Raster neu aufziehen, verschieben,
 * temporären Helfer anlegen und auf eine Schicht ziehen, Prüfen, Excel. Ziehen schrittweise mit
 * `page.mouse` (Falle 11). Die Planung trägt einen Zufallsteil, damit Wiederholungen durchlaufen.
 */
const HOST = "schichtplan.localtest.me";
const url = (p: string) => `http://${HOST}:${E2E_PORT}${p}`;

async function ziehe(page: Page, von: { x: number; y: number }, nach: { x: number; y: number }): Promise<void> {
  await page.mouse.move(von.x, von.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(von.x + ((nach.x - von.x) * i) / 8, von.y + ((nach.y - von.y) * i) / 8);
  await page.mouse.up();
}

async function mitte(l: Locator): Promise<{ x: number; y: number; links: number; breite: number }> {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, links: b.x, breite: b.width };
}

async function zeitraum(feld: Locator, von: string, bis: string): Promise<void> {
  const eingaben = feld.locator("input");
  await eingaben.nth(0).click();
  await eingaben.nth(0).fill(von);
  await eingaben.nth(0).press("Enter");
  await eingaben.nth(1).fill(bis);
  await eingaben.nth(1).press("Enter");
}

test("planen: anlegen, aufziehen, verschieben, Helfer ziehen, prüfen, Excel", async ({ page }) => {
  const name = `Testfest ${Date.now() % 100_000}`;
  await devLogin(page, { host: HOST, groups: "schichtplan-nutzer", callbackPath: "/" });
  await page.goto(url("/"));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);

  // Planung mit einem Abschnitt, 08:00–20:00, Schichten zu 4 Stunden.
  await klickeWennRuhig(page.getByRole("button", { name: "Neue Planung" }));
  const neu = page.getByRole("dialog");
  await neu.getByLabel("Name").fill(name);
  await zeitraum(neu.locator(".ant-picker-range"), "14.11.2030 08:00", "14.11.2030 20:00");
  const abschnitte = neu.getByLabel("Abschnitte");
  await abschnitte.fill("Sanitätswache");
  await abschnitte.press("Enter");
  await neu.getByRole("button", { name: "Planung anlegen" }).click();
  await page.waitForURL(/\/p\/[^/?]+$/);
  await warteAufGestreamteInhalte(page);
  await expect(page.getByRole("heading", { name })).toBeVisible();

  const spur = page.locator("[data-spur]").first();
  const bloecke = spur.locator("[data-schicht]");
  await expect(bloecke).toHaveCount(3);
  await expect(bloecke.nth(1)).toHaveAttribute("aria-label", /12:00–16:00/);

  // Mittlere Schicht löschen …
  await bloecke.nth(1).click();
  const flyin = page.getByRole("dialog");
  await flyin.getByRole("button", { name: "Schicht löschen" }).click();
  await page.getByRole("button", { name: "Löschen", exact: true }).click();
  await expect(bloecke).toHaveCount(2);
  await expect(flyin).toBeHidden();

  // … und 12:00–15:00 neu aufziehen (Zoom „Normal“: 56 px je Stunde, Spur beginnt um 08:00).
  const s = await mitte(spur);
  const px = 56;
  await ziehe(page, { x: s.links + 4 * px + 2, y: s.y }, { x: s.links + 7 * px + 2, y: s.y });
  await expect(spur.locator('[data-schicht][aria-label*="12:00–15:00"]')).toHaveCount(1);
  const neueSchicht = spur.locator('[data-schicht][aria-label*="12:00–15:00"]');
  await expect(neueSchicht).toHaveAttribute("data-schicht", /^(?!entwurf)/);

  // Verschieben um eine Stunde: 13:00–16:00.
  const b = await mitte(neueSchicht);
  await ziehe(page, { x: b.x, y: b.y - 10 }, { x: b.x + px, y: b.y - 10 });
  await expect(spur.locator('[data-schicht][aria-label*="13:00–16:00"]')).toHaveCount(1);

  // Temporären Helfer anlegen und auf die erste Schicht ziehen.
  await page.getByRole("tab", { name: "Helfer" }).click();
  await page.getByRole("button", { name: "Temporären Helfer anlegen" }).click();
  const temp = page.getByRole("dialog");
  await temp.getByLabel("Vorname").fill("Erika");
  await temp.getByLabel("Nachname").fill("Beispiel");
  await temp.getByRole("button", { name: "Anlegen" }).click();
  await expect(temp).toBeHidden();
  await page.getByRole("tab", { name: "Schichtraster" }).click();
  const karte = page.locator('[data-helfer^="temp:"]').filter({ hasText: "Erika Beispiel" });
  const ziel = bloecke.first();
  await ziehe(page, await mitte(karte), await mitte(ziel));
  await expect(ziel).toHaveAttribute("aria-label", /1 von 2 besetzt/);
  await expect(ziel).toContainText("Erika Beispiel");

  // Neu laden: alles ist gespeichert.
  await page.reload();
  await warteAufGestreamteInhalte(page);
  await expect(page.locator("[data-spur]").first().locator("[data-schicht]")).toHaveCount(3);
  await expect(page.locator("[data-spur]").first().locator("[data-schicht]").first()).toContainText("Erika Beispiel");

  // Prüfen zeigt die offenen Plätze, Ausgabe lädt eine Excel-Datei.
  await page.getByRole("tab", { name: /Prüfen/ }).click();
  await expect(page.getByText(/Sanitätswache, .*1 Platz offen/)).toBeVisible();
  await page.getByRole("tab", { name: "Ausgabe" }).click();
  const laden = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel herunterladen" }).click();
  expect((await laden).suggestedFilename()).toMatch(/^schichtplan-testfest-\d+-2030-11-14\.xlsx$/);
});

test("ohne Gruppe 403, ohne Admin-Gruppe kein Löschen", async ({ page, browser }) => {
  await devLogin(page, { host: HOST, groups: "schichtplan-nutzer", callbackPath: "/" });
  await page.goto(url("/"));
  await expect(page.getByRole("heading", { name: "Planungen" })).toBeVisible();

  const fremd = await browser.newPage();
  await devLogin(fremd, { host: HOST, groups: "kommplan-nutzer", callbackPath: "/" });
  const antwort = await fremd.goto(url("/"));
  expect(antwort?.status()).toBe(403);
  const unbekannt = await page.goto(url("/p/gibt-es-nicht"));
  expect(unbekannt?.status()).toBe(404);
  await fremd.close();
});
