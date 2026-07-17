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
