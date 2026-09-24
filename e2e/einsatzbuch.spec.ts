import { expect, test } from "@playwright/test";
import { devLogin, E2E_PORT } from "./fixtures";

/**
 * Stufe 1 des Einsatzbuchs: das Modul ist registriert, nur die Zugangsgruppe kommt
 * hinein, und ein fremder Suite-Host liefert es nicht aus. Die Seite selbst ist bewusst
 * schmal — gemessen wird, dass sie OHNE HTTP 500 rendert (Fallen 1, 6, 7 sieht nur ein
 * echter Abruf).
 */
const HOST = "einsatzbuch.localtest.me";
const url = (pfad: string) => `http://${HOST}:${E2E_PORT}${pfad}`;

test("mit der Gruppe öffnet sich die Übersicht in der Suite-Hülle", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "einsatzbuch-verwaltung", callbackPath: "/" });
  const antwort = await page.goto(url("/"));
  expect(antwort?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Einsatzbuch" })).toBeVisible();
  await expect(page.getByTestId("suite-header")).toHaveCount(1);
});

test("ohne die Gruppe antwortet das Modul mit 404 — auch dem Suite-Admin", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "dashboard-admins", callbackPath: "/login" });
  const antwort = await page.goto(url("/"));
  expect(antwort?.status()).toBe(404);
});

test("ohne Anmeldung geht es zum Login", async ({ page }) => {
  await page.goto(url("/"));
  await expect(page).toHaveURL(/\/login/);
});

test("ein fremder Suite-Host liefert das Modul nicht aus", async ({ page }) => {
  await devLogin(page, { host: "feedback.localtest.me", groups: "einsatzbuch-verwaltung", callbackPath: "/login" });
  const antwort = await page.goto(`http://feedback.localtest.me:${E2E_PORT}/m/einsatzbuch`);
  expect(antwort?.status()).toBe(404);
});
