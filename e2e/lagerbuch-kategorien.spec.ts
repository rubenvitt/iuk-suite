import { expect, test, type Page } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * DRK-294 — ausgeblendete Kategorien bleiben am Konto.
 *
 * WARUM EIN ECHTER BROWSER: jsdom hat keine RSC-Grenze. Dass die gespeicherte
 * Auswahl nach einem Neuladen ueber die Server Component (`page.tsx` liest sie
 * fuer `viewer.sub`) wieder in der Client-Insel ankommt, sieht nur ein echter
 * Abruf — der Filter selbst ist in `ArtikelTable.test.tsx` geprueft.
 *
 * JEDE SPEICHERUNG PRUEFT IHRE ANTWORT (CLAUDE.md, zweite Testregel aus Falle
 * 10): sonst liefe eine abgelehnte Server Action still ins Zeitbudget und
 * meldete sich als „Zeile noch sichtbar".
 *
 * Der Artikel `e2e-kategorie-artikel` gehoert allein diesem Spec
 * (`seed-lagerbuch.ts`, `kategorieFixtures`).
 */
const ARTIKEL = "E2E Kategorie Funkkabel";
const KATEGORIE = "E2E Technik";

async function speichernUndPruefen(page: Page, handlung: () => Promise<void>): Promise<void> {
  const antwort = page.waitForResponse((r) => (
    r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined
  ));
  await handlung();
  expect((await antwort).status()).toBe(200);
}

async function artikelseiteOeffnen(page: Page): Promise<void> {
  await page.goto(lagerbuchUrl("/verwaltung/artikel"));
  // Dieselbe Vorsicht wie `lagerbuch-bestand-export.spec.ts`: ohne Hydration
  // traefe die Auswahl ein Feld ohne Handler.
  await page.waitForLoadState("networkidle");
}

test.describe("lagerbuch — Kategorien ausblenden (DRK-294)", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("die Auswahl bleibt nach dem Neuladen am Konto und lässt sich zurücknehmen", async ({ page }) => {
    await artikelseiteOeffnen(page);
    const zeile = () => page.getByRole("row").filter({ hasText: ARTIKEL });
    const hinweis = page.getByTestId("kategorien-hinweis");

    // Ein Rest aus einem abgebrochenen Versuch (`retries`) wird erst aufgeraeumt
    // — die Auswahl ueberlebt ja genau das, was dieser Test prueft.
    if (await hinweis.isVisible()) {
      await speichernUndPruefen(page, () => hinweis.getByRole("button", { name: "alle zeigen" }).click());
    }
    await expect(zeile()).toHaveCount(1);

    await speichernUndPruefen(page, async () => {
      await klickeWennRuhig(page.getByRole("combobox", { name: "Kategorien dauerhaft ausblenden" }));
      await page.locator(".ant-select-item-option", { hasText: KATEGORIE }).click();
    });
    await expect(zeile()).toHaveCount(0);

    await artikelseiteOeffnen(page);
    await expect(zeile()).toHaveCount(0);
    await expect(hinweis).toContainText("1 Artikel in ausgeblendeten Kategorien");

    await speichernUndPruefen(page, () => hinweis.getByRole("button", { name: "alle zeigen" }).click());
    await expect(zeile()).toHaveCount(1);

    await artikelseiteOeffnen(page);
    await expect(zeile()).toHaveCount(1);
    await expect(hinweis).toHaveCount(0);
  });
});
