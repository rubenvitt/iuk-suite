import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";

test("anonymous beta host renders minimal shell, no switcher", async ({ page }) => {
  await page.goto("http://beta.localtest.me:3100/");
  await expect(page.getByTestId("minimal-shell")).toBeVisible();
  await expect(page.getByTestId("beta-content")).toBeVisible();
  await expect(page.getByTestId("full-shell-header")).toHaveCount(0);
});

test("kiosk host renders fullscreen, no chrome", async ({ page }) => {
  await page.goto("http://kioskdemo.localtest.me:3100/");
  await expect(page.getByTestId("kiosk-shell")).toBeVisible();
  await expect(page.getByTestId("full-shell-header")).toHaveCount(0);
});

test("alpha requires the alpha-users group", async ({ page }) => {
  // logged in WITHOUT the group -> forbidden
  await devLogin(page, { host: "portal.localtest.me", groups: "" });
  const res = await page.goto("http://alpha.localtest.me:3100/");
  expect(res?.status()).toBe(403);
});

test("SSO: one login serves alpha + gamma; switcher reflects groups", async ({ page }) => {
  await devLogin(page, { host: "alpha.localtest.me", groups: "alpha-users", callbackPath: "/" });
  // now on alpha, full shell, content visible (no second login)
  await expect(page.getByTestId("alpha-content")).toBeVisible();
  await expect(page.getByTestId("full-shell-header")).toBeVisible();
  // cross to gamma host (auth-required, no group) WITHOUT logging in again — proves the cookie
  // set on .localtest.me carries the session across subdomains
  await page.goto("http://gamma.localtest.me:3100/");
  await expect(page.getByTestId("gamma-content")).toBeVisible();
  await expect(page.getByTestId("full-shell-header")).toBeVisible();
  // switcher contains Alpha (group present)
  await expect(page.getByRole("link", { name: /Alpha/ })).toBeVisible();
});
