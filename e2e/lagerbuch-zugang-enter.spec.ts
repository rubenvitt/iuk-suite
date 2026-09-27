import { test, expect, type Page } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * DRK-483 — `ENTER` IM VERFALLSMONAT UEBERNIMMT DEN MONAT UND BUCHT NICHT.
 *
 * Bis DRK-483 schickte ein `Enter` in antds Monatsauswahl das ganze Formular „Zugang buchen" ab:
 * rc-picker uebernimmt die Eingabe, verhindert die implizite Absendung des Browsers aber nicht
 * (`core/formular/enter.ts`). Gemessen gegen den gebauten Stand: `bucheZugang` lief mit dem
 * getippten Monat — auch, wenn vorher ein anderer uebernommen war —, danach stand das Formular leer.
 *
 * ⚠️ NUR EIN ECHTER BROWSER SIEHT ES. jsdom kennt keine implizite Absendung, der Unit-Test des
 * Riegels haelt nur fest, welche Taste er unterdrueckt.
 *
 * ⚠️ EIGENER ARTIKEL MIT VERSUCHSZAEHLER im Namen — dieselbe Regel wie in
 * `lagerbuch-umlagern.spec.ts` (eine Datenbank fuer alle Specs, `retries` gegen dieselbe).
 */

function istServerAction(r: { method(): string; headers(): Record<string, string> }): boolean {
  return r.method() === "POST" && r.headers()["next-action"] !== undefined;
}

function serverActionAntwort(page: Page) {
  // ⚠️ NICHT an der Aufrufstelle `await`-en: das Lauschen beginnt sofort, der
  // ausloesende Klick kommt erst danach.
  return page.waitForResponse((r) => istServerAction(r.request()), { timeout: 60_000 });
}

/** Ein Auswahlfeld im offenen Drawer setzen. */
async function waehle(page: Page, feld: string, eintrag: string): Promise<void> {
  await klickeWennRuhig(page.getByRole("combobox", { name: feld, exact: true }));
  await page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden)")
    .locator(".ant-select-item-option", { hasText: eintrag })
    .first()
    .click();
}

test.describe("Lagerbuch Zugang — Enter im Verfallsmonat (DRK-483)", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("Enter uebernimmt den Monat, gebucht wird erst per Knopf", async ({ page }) => {
    const versuch = test.info().retry;
    const artikelName = `E2E Enter-Artikel Versuch ${versuch}`;
    const chargenNr = `E2E-ENTER-${versuch}`;
    const einheit = "Stk.";
    // Nicht der Sentinel „2099-12" (der meint „kein Verfall").
    const verfallsmonat = "2091-07";

    // ── 1) Eigenen Artikel anlegen ────────────────────────────────────────
    const artikelSeite = await page.goto(lagerbuchUrl("/verwaltung/artikel"));
    expect(artikelSeite?.status(), "/verwaltung/artikel: HTTP").toBe(200);
    await page.waitForLoadState("networkidle");

    await klickeWennRuhig(page.getByRole("button", { name: "Neuer Artikel" }));
    const artikelDialog = page.getByRole("dialog");
    await artikelDialog.getByLabel("Name").fill(artikelName);
    await artikelDialog.getByLabel("Fach").fill("E2E-E");
    await artikelDialog.getByLabel("Einheit").fill(einheit);
    const artikelAntwort = serverActionAntwort(page);
    await klickeWennRuhig(page.getByRole("button", { name: "Anlegen" }));
    expect((await artikelAntwort).ok(), "Artikel anlegen: Server Action").toBe(true);

    // Ueber die Suche finden, nie ueber Bildlauf (Falle 14).
    await page.getByRole("searchbox").fill(artikelName);
    const artikelKnopf = page.getByRole("button", { name: artikelName, exact: true });
    await expect(artikelKnopf).toBeVisible();
    await klickeWennRuhig(artikelKnopf);

    // ── 2) Zugang ausfuellen, den Monat mit Enter uebernehmen ─────────────
    const zugangForm = page.locator('form[data-rolle="zugang-form"]');
    await expect(zugangForm).toBeVisible();
    await zugangForm.getByLabel("Zugangsmenge").fill("3");
    await zugangForm.getByLabel("Chargennummer").fill(chargenNr);
    await waehle(page, "Wohin", "Handlager");

    const aktionen: string[] = [];
    page.on("request", (r) => {
      if (istServerAction(r)) aktionen.push(r.url());
    });

    const verfallFeld = zugangForm.getByLabel("Verfallsmonat");
    await verfallFeld.click();
    await verfallFeld.fill(verfallsmonat);
    await verfallFeld.press("Enter");

    // Der Picker hat uebernommen: das Panel ist zu, der Monat steht im Feld.
    await expect(page.locator(".ant-picker-dropdown:not(.ant-picker-dropdown-hidden)"))
      .toHaveCount(0);
    await expect(verfallFeld).toHaveValue(verfallsmonat);

    // ⚠️ EINE NEGATIVE ZUSICHERUNG BRAUCHT EIN ZEITFENSTER. Vor DRK-483 ging die Buchung im
    // selben Tastendruck los (Absendung → Validierung → Server Action, gemessen deutlich unter
    // einer Sekunde); nach einer Sekunde Ruhe hat das Enter nichts ausgeloest.
    await page.waitForTimeout(1_000);
    expect(aktionen, "Enter im Verfallsmonat darf nicht buchen").toEqual([]);
    // Und das Formular steht noch — ein Absenden haette es zurueckgesetzt.
    await expect(zugangForm.getByLabel("Chargennummer")).toHaveValue(chargenNr);
    await expect(verfallFeld).toHaveValue(verfallsmonat);

    // ── 3) Erst der Knopf bucht, mit dem per Enter uebernommenen Monat ────
    const zugangAntwort = serverActionAntwort(page);
    await klickeWennRuhig(page.getByRole("button", { name: "Zugang buchen" }));
    expect((await zugangAntwort).ok(), "Zugang buchen: Server Action").toBe(true);

    const chargeZeile = page.getByRole("table", { name: "Chargen" })
      .locator("[data-row-key]").filter({ hasText: chargenNr });
    await expect(chargeZeile, "die neue Charge muss in der Chargentabelle stehen").toBeVisible();
    // `fmtVerfall` zeigt `MM/JJ`.
    await expect(chargeZeile).toContainText("07/91");
  });
});
