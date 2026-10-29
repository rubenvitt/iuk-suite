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
  await devLogin(page, { host: HOST, groups: "einsatzbuch-nutzer", callbackPath: "/" });
  const antwort = await page.goto(url("/"));
  expect(antwort?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Einsatzbuch" })).toBeVisible();
  await expect(page.getByTestId("suite-header")).toHaveCount(1);
});

test("ohne die Gruppe antwortet das Modul mit 404 — auch dem Suite-Admin", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "admin", callbackPath: "/login" });
  const antwort = await page.goto(url("/"));
  expect(antwort?.status()).toBe(404);
});

test("ohne Anmeldung geht es zum Login", async ({ page }) => {
  await page.goto(url("/"));
  await expect(page).toHaveURL(/\/login/);
});

test("ein fremder Suite-Host liefert das Modul nicht aus", async ({ page }) => {
  await devLogin(page, { host: "feedback.localtest.me", groups: "einsatzbuch-nutzer", callbackPath: "/login" });
  const antwort = await page.goto(`http://feedback.localtest.me:${E2E_PORT}/m/einsatzbuch`);
  expect(antwort?.status()).toBe(404);
});

/**
 * IDA-289: der Knopf unter „Rechner" zeigt auf eine Datei unter `public/`. Ob sie über den
 * Einsatzbuch-Host wirklich als PDF ankommt (Rewrite, Host-Riegel, statische Auslieferung), sieht
 * nur ein echter Abruf — der Vitest-Fall prüft die Datei, nicht den Weg dazwischen.
 */
test("bietet unter Rechner die Anleitung als PDF an, und der Link liefert sie aus", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "einsatzbuch-nutzer", callbackPath: "/rechner" });
  await page.goto(url("/rechner"));
  const link = page.getByTestId("eb-rechner-anleitung");
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).toBe("/m/einsatzbuch/rechner-anleitung.pdf");
  const antwort = await page.request.get(url(href!));
  expect(antwort.status(), "Anleitung: HTTP").toBe(200);
  expect(antwort.headers()["content-type"]).toContain("application/pdf");
  expect((await antwort.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");
});
