import { expect, test } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";

/**
 * Zugang für Lifeline Hub (LLH-1194): anlegen, der Schlüssel steht einmal da, Lifeline holt damit ohne Sitzung
 * ab, und nach dem Widerrufen gilt er nicht mehr. Der Abruf läuft über die Routing-Ausnahme `ABRUF_OHNE_LOGIN`.
 */
const HOST = "helfer.localtest.me";
const url = (p: string) => `http://${HOST}:${E2E_PORT}${p}`;

test("Zugang anlegen, abholen, widerrufen", async ({ page, playwright }) => {
  await devLogin(page, { host: HOST, groups: "helfer-nutzer,helfer-admin", callbackPath: "/einstellungen" });
  await page.goto(url("/einstellungen"));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);

  const bezeichnung = `Lifeline e2e ${Date.now()}`;
  await page.getByLabel("Neuer Zugang").fill(bezeichnung);
  await klickeWennRuhig(page.getByRole("button", { name: "Zugang anlegen" }));
  const neu = page.getByTestId("neuer-zugang");
  await expect(neu).toContainText(url("/api/stammdaten"));
  const schluessel = (await neu.locator("pre").nth(1).textContent())?.trim() ?? "";
  expect(schluessel).toMatch(/^[A-Za-z0-9_-]{43}$/);

  // Ohne Sitzung, wie Lifeline Hub.
  const anonym = await playwright.request.newContext();
  const ok = await anonym.get(url("/api/stammdaten"), { headers: { authorization: `Bearer ${schluessel}` } });
  expect(ok.status()).toBe(200);
  expect(Object.keys(await ok.json())).toEqual(["personal"]);
  expect((await anonym.get(url("/api/stammdaten"))).status()).toBe(401);

  await page.getByTestId("neuer-zugang-fertig").click();
  await klickeWennRuhig(page.getByRole("button", { name: `Zugang widerrufen: ${bezeichnung}` }));
  await page.getByRole("button", { name: "Widerrufen", exact: true }).last().click();
  await expect(page.getByRole("button", { name: `Zugang widerrufen: ${bezeichnung}` })).toHaveCount(0);
  expect((await anonym.get(url("/api/stammdaten"), { headers: { authorization: `Bearer ${schluessel}` } })).status()).toBe(401);
  await anonym.dispose();
});
