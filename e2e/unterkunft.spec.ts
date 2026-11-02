import { expect, test } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";

/**
 * Modul unterkunft (IDA-322): rechnet im Browser, ohne Endpunkt und ohne Datenbank. Geprüft wird, dass
 * Eingabe und Ergebnis zusammenhängen und die Räume je Raum abgerundet zählen (Szenario aus LLH-1520).
 */
const HOST = "unterkunft.localtest.me";
const url = (p: string) => `http://${HOST}:${E2E_PORT}${p}`;

test("rechnen: Personen getrennt, Räume, Richtwerte", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "", callbackPath: "/" });
  await page.goto(url("/"));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);

  await page.getByLabel("Männer", { exact: true }).fill("50");
  await page.getByLabel("Frauen", { exact: true }).fill("50");
  const sanitaer = page.locator(".ant-card").filter({ hasText: "Sanitär" });
  await expect(sanitaer.getByRole("row", { name: /^Toiletten/ })).toContainText("6");
  await expect(sanitaer.getByRole("row", { name: /^Urinale/ })).toContainText("4");

  await klickeWennRuhig(page.getByText("Räume", { exact: true }));
  await page.getByLabel("Länge Raum 1", { exact: true }).fill("15");
  await page.getByLabel("Breite Raum 1", { exact: true }).fill("13.5");
  await page.getByLabel("Abzug 1 Länge Raum 1", { exact: true }).fill("4");
  await page.getByLabel("Abzug 1 Breite Raum 1", { exact: true }).fill("2.5");
  await klickeWennRuhig(page.getByRole("button", { name: "Raum hinzufügen" }));
  await page.getByLabel("Länge Raum 2", { exact: true }).fill("12");
  await page.getByLabel("Breite Raum 2", { exact: true }).fill("8");
  await page.getByLabel("Abzug 1 Länge Raum 2", { exact: true }).fill("3");
  await page.getByLabel("Abzug 1 Breite Raum 2", { exact: true }).fill("2");
  await expect(page.getByTestId("raum").nth(0)).toContainText("Plätze 48");
  await expect(page.getByTestId("raum").nth(1)).toContainText("Plätze 22");
  await expect(page.locator("[class*=kpiWert]").first()).toHaveText("70");

  // Drucken (IDA-330): das Blatt rechnet die Eingabe aus dem Link mit demselben Kern.
  const druck = page.getByRole("link", { name: /Drucken/ });
  const href = await druck.getAttribute("href");
  expect(href).toMatch(/^\/druck\?e=/);
  const blatt = await page.context().newPage();
  await blatt.addInitScript(() => { window.print = () => {}; });
  await blatt.goto(url(href!));
  await expect(blatt.getByRole("article", { name: "Druckblatt Unterkunft" })).toContainText("Grundlage: Räume");
  await expect(blatt.getByRole("row", { name: /^Raum 1/ })).toContainText("48");
  await expect(blatt.getByRole("row", { name: /^Raum 2/ })).toContainText("22");
  await expect(blatt.getByRole("button", { name: "Drucken" })).toBeVisible();
  await blatt.emulateMedia({ media: "print" });
  await expect(blatt.getByRole("button", { name: "Drucken" })).toBeHidden();
  await blatt.close();

  await klickeWennRuhig(page.getByRole("tab", { name: "Richtwerte" }));
  await expect(page.getByRole("table", { name: "Richtwerte" })).toContainText("Schlaffläche je Person");
});
