import { expect, test } from "@playwright/test";
import { devLogin } from "./fixtures";
import {
  LAGERBUCH_ADMIN_GRUPPE,
  LAGERBUCH_HOST,
  lagerbuchUrl,
} from "./helpers/lagerbuch";

/** Browserverträge der Modulnavigation, die jsdom nicht beobachten kann. */
test.describe("lagerbuch — Modulnavigation", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("markiert genau einen Eintrag auf /verwaltung/artikel", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(lagerbuchUrl("/verwaltung/artikel"));
    const markiert = page.getByTestId("modulnav").locator("a[aria-current]");
    await expect(markiert).toHaveCount(1);
    await expect(markiert).toHaveText("Artikel");
  });

  test("markiert die Übersicht auf /verwaltung", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(lagerbuchUrl("/verwaltung"));
    const markiert = page.getByTestId("modulnav").locator("a[aria-current]");
    await expect(markiert).toHaveCount(1);
    await expect(markiert).toHaveText("Übersicht");
  });

  test("markiert auf einer Detailseite gar nichts", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(lagerbuchUrl("/verwaltung/geraete"));
    await page.getByRole("link", { name: "E2E Spineboard" }).click();
    await expect(page).toHaveURL(/\/verwaltung\/geraete\/[^/]+$/);
    await expect(page.getByTestId("modulnav").locator("a[aria-current]")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Brotkrume" })).toBeVisible();
  });

  test("fünfzehn Einträge schieben die Seite bei Desktop-Überlauf nicht seitwärts", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(lagerbuchUrl("/verwaltung/artikel"));
    const nav = page.getByTestId("modulnav");
    await expect(nav).toBeVisible();
    await expect(nav.locator("a")).toHaveCount(15);

    const masse = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(masse.scroll).toBe(masse.client);

    // Bei 1280px passen die Links mit der aktuellen Schrift knapp hinein. Der
    // zweite Messpunkt bleibt oberhalb des Mobil-Breakpoints und beweist die
    // eigentliche overflow-x-Kopplung unter realem Überlauf.
    await page.setViewportSize({ width: 900, height: 720 });
    await expect(nav).toBeVisible();
    expect(await nav.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    const lastMasse = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(lastMasse.scroll).toBe(lastMasse.client);
  });

  test("der Container scrollt beim Fokussieren zum letzten Link", async ({ page }) => {
    // Bei 1280px passen die real gerenderten 15 Links auf dieser Schrift knapp
    // vollständig hinein. 900px bleibt Desktop (die Leiste ist sichtbar),
    // erzwingt aber den Überlauf, den die Tastaturzusage tatsächlich braucht.
    await page.setViewportSize({ width: 900, height: 720 });
    await page.goto(lagerbuchUrl("/verwaltung"));
    const nav = page.getByTestId("modulnav");
    expect(await nav.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    const letzter = nav.getByRole("link", { name: "Import" });
    await letzter.focus();
    await expect(letzter).toBeFocused();
    expect(await nav.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  });

  test("bei 390px ist die Leiste unsichtbar und die Ziele stehen im Drawer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(lagerbuchUrl("/verwaltung/artikel"));
    await expect(page.getByTestId("modulnav")).toBeHidden();
    await page.getByTestId("menue-knopf").click();
    await expect(
      page.getByTestId("suite-drawer").getByRole("link", { name: "Journal" }),
    ).toBeVisible();
  });
});
