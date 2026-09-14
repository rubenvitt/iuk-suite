import { test, expect } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * DAS VORLAGENFELD IM FAHRZEUGBLATT ZEIGT DIE VERKNUEPFTE VORLAGE (DRK-310).
 *
 * ⚠️ WARUM DIESER TEST NEBEN `TemplateVerknuepfung.test.tsx` STEHT. Vitest
 * bestaetigt `textContent` — nicht, dass eine Person den Namen SIEHT. Zwei
 * Aussagen kennt nur ein echter Browser: (1) dass nach der Server Action die
 * neue Verknuepfung als Prop an der Insel ankommt und das Feld ihr folgt, und
 * (2) dass ein vorbelegtes `showSearch`-Feld den Namen wieder zeigt, wenn man
 * hinein- und ohne Wahl wieder herausklickt (antd blendet ihn beim Fokus aus).
 *
 * Der Seed liefert ein eigenes, inaktives Fahrzeug ohne Vorlage
 * (`vorlagenFixtures`). Der Test endet im Ausgangszustand.
 */
test.describe("Vorlagenfeld im Fahrzeugblatt", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("zeigt Leerzustand, dann die verknuepfte Vorlage, dann wieder den Leerzustand", async ({ page }) => {
    const pfad = "/verwaltung/fahrzeuge/e2e-vorlagen-fahrzeug";
    const antwort = await page.goto(lagerbuchUrl(pfad));
    expect(antwort!.status()).toBe(200);

    const insel = page.locator("[data-rolle='template-verknuepfung']");
    const feld = insel.locator(".ant-select");
    const aktuell = insel.locator("[data-rolle='aktuelle-vorlage']");
    const verknuepfen = insel.getByRole("button", { name: "Verknüpfen" });
    const aktionAntwort = () => page.waitForResponse((r) =>
      r.request().method() === "POST" && r.url().includes("e2e-vorlagen-fahrzeug"));

    await expect(feld.getByText("Keine Vorlage verknüpft")).toBeVisible();
    await expect(verknuepfen).toBeDisabled();

    await klickeWennRuhig(insel.getByRole("combobox", { name: "Vorlage" }));
    await page.locator(".ant-select-item-option", { hasText: "E2E Vorlagenfeld" }).click();
    await expect(verknuepfen).toBeEnabled();

    const verknuepft = aktionAntwort();
    await verknuepfen.click();
    expect((await verknuepft).status()).toBe(200);

    await expect(aktuell).toContainText("E2E Vorlagenfeld");
    await expect(feld.getByText("E2E Vorlagenfeld", { exact: true })).toBeVisible();
    await expect(feld).not.toContainText("e2e-vorlagenfeld-tpl");
    await expect(verknuepfen).toBeDisabled();

    // Hinein und ohne Wahl wieder heraus: der Name muss zurueckkommen.
    await insel.getByRole("combobox", { name: "Vorlage" }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("heading", { name: "Soll-Bestückung" }).click();
    await expect(feld.getByText("E2E Vorlagenfeld", { exact: true })).toBeVisible();

    await insel.getByRole("button", { name: "Verknüpfung lösen" }).click();
    const geloest = aktionAntwort();
    await page.locator(".ant-popconfirm-buttons button", { hasText: "Lösen" }).click();
    expect((await geloest).status()).toBe(200);

    await expect(aktuell).toContainText("keine");
    await expect(feld.getByText("Keine Vorlage verknüpft")).toBeVisible();
    await expect(verknuepfen).toBeDisabled();
  });
});
