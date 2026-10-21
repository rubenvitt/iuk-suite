import { expect, test } from "@playwright/test";
import { devLogin, warteAufGestreamteInhalte } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * IDA-261 — die Statistikseite im echten Browser.
 *
 * WARUM HIER UND NICHT NUR IN VITEST: die Seite ist eine Server Component, die
 * Werte aus `_lib/` liest und eine recharts-Insel rendert. Ein Wert aus einem
 * Client-Modul (Falle 6), ein Icon-Import (Falle 7) oder ein Compound-Zugriff
 * (Falle 1) ergaebe einen HTTP 500, den weder `build` noch Vitest sieht. Und
 * die Diagramme zeichnen erst mit einem echten Layout — jsdom misst 0×0.
 *
 * ⚠️ KEINE ZAHLENZUSAGE GEGEN DEN SEED: alle Specs teilen eine Datenbank und
 * buchen in beliebiger Reihenfolge. Die Zahlen prueft
 * `_lib/lesepfade/statistik.test.ts` gegen eine eigene.
 */
test.describe("lagerbuch — Statistik (IDA-261)", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  for (const breite of [1280, 390]) {
    test(`laedt mit HTTP 200 und zeichnet Diagramme (${breite}px)`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: breite > 768 ? 900 : 844 });
      const antwort = await page.goto(lagerbuchUrl("/verwaltung/statistik"));
      expect(antwort?.status()).toBe(200);
      await warteAufGestreamteInhalte(page);
      await expect(page.getByRole("heading", { name: "Statistik", level: 1 })).toBeVisible();
      await expect(page.getByText("Verbrauch je Monat")).toBeVisible();
      // Mindestens ein Diagramm: der Seed bucht Zugänge, also gibt es eine Verfallsvorschau.
      await expect(page.locator(".recharts-wrapper").first()).toBeVisible({ timeout: 10_000 });

      const masse = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(masse.scroll, "kein seitliches Scrollen").toBe(masse.client);
    });
  }

  test("der Zeitraum steht in der Adresse", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/statistik"));
    await warteAufGestreamteInhalte(page);
    const antwort = page.waitForResponse((r) => r.url().includes("/verwaltung/statistik") && r.status() === 200);
    await page.locator(".ant-segmented-item", { hasText: /^3$/ }).click();
    await antwort;
    await expect(page).toHaveURL(/[?&]monate=3\b/);
  });
});
