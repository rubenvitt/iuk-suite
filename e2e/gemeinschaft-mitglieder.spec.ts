import { expect, test } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";

/**
 * Modul gemeinschaft (IDA-320), Bereich Mitglieder: die Leitung legt ein Mitglied an, der persönliche Link
 * öffnet ohne Anmeldung die Seite des Mitglieds, „Neuer Link“ macht den alten sofort ungültig, Bearbeiten und
 * Entfernen. Der Zustand entsteht im Test selbst; der Name trägt eine Zufallszahl, damit Wiederholungen gegen
 * dieselbe Datenbank durchlaufen.
 */
const HOST = "gemeinschaft.localtest.me";
const url = (p: string) => `http://${HOST}:${E2E_PORT}${p}`;

test("Mitglied anlegen, Link öffnen, neuer Link macht den alten ungültig, entfernen", async ({ page, browser }) => {
  const nummer = Date.now() % 100_000;
  const name = `Testmitglied ${nummer}`;
  await devLogin(page, { host: HOST, groups: "gemeinschaft-admin", callbackPath: "/mitglieder" });
  await page.goto(url("/mitglieder"));
  await warteAufGestreamteInhalte(page);
  await expect(page.getByRole("heading", { name: "Mitglieder" })).toBeVisible();

  await klickeWennRuhig(page.getByRole("button", { name: "Mitglied anlegen" }));
  const dialog = page.getByRole("dialog", { name: "Mitglied anlegen" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Telefon").fill("0151 2223334");
  await klickeWennRuhig(dialog.getByRole("button", { name: "Anlegen" }));
  await expect(page.getByText("Mitglied angelegt.", { exact: false })).toBeVisible();

  const zeile = page.getByRole("row").filter({ hasText: name });
  await expect(zeile).toContainText("0151 2223334");
  const alt = await zeile.getByRole("link", { name: /…\/mein\// }).getAttribute("href");
  expect(alt).toMatch(new RegExp(`^http://${HOST.replace(/\./g, "\\.")}:${E2E_PORT}/mein/[A-Za-z0-9_-]{22}$`));

  // Ohne Anmeldung, auf dem Telefon: eigener Browserkontext ohne Sitzung.
  const fremd = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const handy = await fremd.newPage();
  const antwort = await handy.goto(alt!);
  expect(antwort?.status()).toBe(200);
  await expect(handy.getByRole("heading", { name: "Hallo Testmitglied" })).toBeVisible();
  await expect(handy.getByRole("heading", { name: "Deine Aufgaben" })).toBeVisible();
  await expect(handy.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  await expect(handy.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(handy.getByText("0151 2223334")).toHaveCount(0);
  expect(await handy.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Neuer Link: Rückfrage, dann ist der alte sofort ungültig.
  await klickeWennRuhig(zeile.getByRole("button", { name: "Neuer Link" }));
  await klickeWennRuhig(page.getByRole("button", { name: "Neu erzeugen" }));
  await expect(page.getByText("Neuer Link erzeugt.", { exact: false })).toBeVisible();
  await expect(zeile.getByRole("link", { name: /…\/mein\// })).not.toHaveAttribute("href", alt!);
  const neu = await zeile.getByRole("link", { name: /…\/mein\// }).getAttribute("href");
  await handy.goto(alt!);
  await expect(handy.getByRole("heading", { name: "Link nicht gültig" })).toBeVisible();
  await expect(handy.getByText("Dieser Link gilt nicht mehr.", { exact: false })).toBeVisible();
  await handy.goto(neu!);
  await expect(handy.getByRole("heading", { name: "Hallo Testmitglied" })).toBeVisible();
  await fremd.close();

  // Bearbeiten.
  await klickeWennRuhig(zeile.getByRole("button", { name: "Bearbeiten" }));
  const bearbeiten = page.getByRole("dialog", { name: "Mitglied bearbeiten" });
  await bearbeiten.getByLabel("Name").fill(`${name} B`);
  await klickeWennRuhig(bearbeiten.getByRole("button", { name: "Speichern" }));
  const zeileB = page.getByRole("row").filter({ hasText: `${name} B` });
  await expect(zeileB).toBeVisible();

  // Entfernen: Rückfrage, dann weg.
  await klickeWennRuhig(zeileB.getByRole("button", { name: "Entfernen" }));
  await klickeWennRuhig(page.locator(".ant-popconfirm").getByRole("button", { name: "Entfernen" }));
  await expect(page.getByRole("row").filter({ hasText: `${name} B` })).toHaveCount(0);
});

test("ohne Leitungsrecht keine Mitgliederliste; ein erfundener Link zeigt die freundliche Seite", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "", callbackPath: "/" });
  const antwort = await page.goto(url("/mitglieder"));
  expect(antwort?.status()).toBe(404);

  const fremd = await page.context().browser()!.newContext();
  const seite = await fremd.newPage();
  const r = await seite.goto(url("/mein/AAAAAAAAAAAAAAAAAAAAAA"));
  expect(r?.status()).toBe(200);
  await expect(seite.getByRole("heading", { name: "Link nicht gültig" })).toBeVisible();
  await fremd.close();
});
