import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";

test("portal shows seeded public tiles to any logged-in user", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "" });
  await expect(page.getByTestId("portal-grid")).toBeVisible();
  await expect(page.getByText("BookStack")).toBeVisible();
  // group-gated service hidden without admin group
  await expect(page.getByText("Vaultwarden")).toHaveCount(0);
});

test("admin can create a service", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "dashboard-admins", callbackPath: "/admin" });
  await page.getByLabel("slug").fill("neu");
  await page.getByLabel("name").fill("Neuer Dienst");
  await page.getByLabel("url").fill("https://neu.iuk-ue.de");
  await page.getByRole("button", { name: /anlegen|create/i }).click();
  await page.goto("http://portal.localtest.me:3100/");
  await expect(page.getByText("Neuer Dienst")).toBeVisible();
});

test("admin can delete a service", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "dashboard-admins", callbackPath: "/admin" });
  // Eigener, eindeutiger Dienst: die Seed-Daten bleiben unangetastet (der erste
  // Test prueft BookStack sichtbar), und ein eigener Name entkoppelt den Test
  // vom Anlege-Test — beide teilen bei `workers:1` dieselbe, einmal gewischte DB.
  await page.getByLabel("slug").fill("weg");
  await page.getByLabel("name").fill("Zu loeschender Dienst");
  await page.getByLabel("url").fill("https://weg.iuk-ue.de");
  await page.getByRole("button", { name: /anlegen|create/i }).click();

  const row = page.getByTestId("service-row").filter({ hasText: "Zu loeschender Dienst" });
  await expect(row).toHaveCount(1);
  // Auf die Zielzeile gescopt: "Loeschen" gibt es pro Zeile einmal. Der Knopf ist
  // seit dem antd-Umbau `<Button danger htmlType="submit">` in einem nativen
  // <form action={deleteServiceAction}> — ohne htmlType waere er ein stiller
  // No-op (antd-Default type="button"), und kein anderer Test faehrt diesen Pfad.
  await row.getByRole("button", { name: "Löschen" }).click();
  // Zusicherung: die Zeile ist wirklich weg, nicht nur der Knopf vorhanden.
  await expect(row).toHaveCount(0);
});
