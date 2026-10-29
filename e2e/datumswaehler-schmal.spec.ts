import { test, expect, type Locator, type Page } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte, warteAufSpaltenaufteilung } from "./fixtures";
import { AUFGABEN_HOST, AUFGABEN_KOORDINATION_SITZUNG } from "./helpers/aufgaben";
import { ADMIN as KOMMPLAN_ADMIN, HOST as KOMMPLAN_HOST, url as kommplanUrl } from "./kommplan-hilfen";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";
import { RADIO_ADMIN_GRUPPE, RADIO_HOST, radioUrl } from "./helpers/radio";
import { UAV_ADMIN_GRUPPE, UAV_HOST, uavUrl } from "./helpers/uav";
import { pruefeOffenesFenster, schliesseFenster } from "./helpers/waehler";

/**
 * KEIN OFFENER DATUMSWAEHLER DER SUITE RAGT UEBER EIN 375px-TELEFON (IDA-264).
 *
 * Nachzug aus IDA-242 (`e2e/monatswaehler-schmal.spec.ts`): dort bekam nur der Monatswähler im
 * Lagerbuch `shiftX`. Das Tagesfenster ist mit `WAEHLER_ZELLE` (`core/theme/theme.ts`) genauso
 * 344px breit, und rc-picker klappt es nur um. Ein Feld in der rechten Hälfte (Filterzeile „bis")
 * lässt ihm links wie rechts zu wenig Platz. Je Modul mindestens ein Wähler, in Filterzeilen beide.
 *
 * Nur öffnen, nichts wählen: die Seeds teilen sich andere Specs.
 */
const SCHMAL = { width: 375, height: 800 };

async function oeffneUndPruefe(page: Page, feld: Locator, panel?: string): Promise<void> {
  await feld.scrollIntoViewIfNeeded();
  await klickeWennRuhig(feld);
  await pruefeOffenesFenster(page, panel);
  await schliesseFenster(page);
}

test.describe("Datumswähler auf schmalem Telefon", () => {
  test("aufgaben: Fälligkeit und Uhrzeit beim Einstellen", async ({ page }) => {
    await devLogin(page, {
      host: AUFGABEN_HOST,
      groups: AUFGABEN_KOORDINATION_SITZUNG,
      email: "malte@localtest.me",
      callbackPath: "/neu",
    });
    await page.setViewportSize(SCHMAL);
    const antwort = await page.goto(`http://${AUFGABEN_HOST}:${E2E_PORT}/neu`);
    expect(antwort!.status()).toBe(200);
    await warteAufSpaltenaufteilung(page);

    await oeffneUndPruefe(page, page.locator("#af-faelligAm"));
    await oeffneUndPruefe(page, page.locator("#af-faelligUhrzeit"), ".ant-picker-time-panel");
  });

  test("radio: Filter der Ausleihen und „Zuletzt aktualisiert“", async ({ page }) => {
    await devLogin(page, { host: RADIO_HOST, groups: RADIO_ADMIN_GRUPPE });
    await page.setViewportSize(SCHMAL);
    let antwort = await page.goto(radioUrl("/admin/ausleihen"));
    expect(antwort!.status()).toBe(200);
    await warteAufSpaltenaufteilung(page);
    await oeffneUndPruefe(page, page.getByLabel("Ausgeliehen von"));
    await oeffneUndPruefe(page, page.getByLabel("Ausgeliehen bis"));

    // Die Id über `data-row-key`, nicht per Zeilenklick (Vorbild `datumsfeld-enter.spec.ts`). Die
    // Tabelle zeigt auf dem Telefon Karten; die Zeilen stehen im DOM, nur nicht sichtbar.
    await page.goto(radioUrl("/admin/geraete"));
    const zeile = page.locator("[data-row-key]").first();
    await expect(zeile, "der radio-Seed hat kein Gerät angelegt").toBeAttached();
    const id = await zeile.getAttribute("data-row-key");
    antwort = await page.goto(radioUrl(`/admin/geraete/${id}`));
    expect(antwort!.status()).toBe(200);
    await warteAufSpaltenaufteilung(page);
    await oeffneUndPruefe(page, page.getByLabel("Zuletzt aktualisiert"));
  });

  test("uav: Beginn beim Anlegen eines Teilnehmers", async ({ page }) => {
    await devLogin(page, { host: UAV_HOST, groups: UAV_ADMIN_GRUPPE, callbackPath: "/admin" });
    await page.setViewportSize(SCHMAL);
    const antwort = await page.goto(uavUrl("/admin"));
    expect(antwort!.status()).toBe(200);
    await warteAufSpaltenaufteilung(page);
    await oeffneUndPruefe(page, page.locator("#tn-beginn"));
  });

  test("kommplan: Datum beim neuen Plan und in den Planangaben", async ({ page }) => {
    await devLogin(page, { host: KOMMPLAN_HOST, groups: KOMMPLAN_ADMIN, callbackPath: "/" });
    await page.setViewportSize(SCHMAL);
    let antwort = await page.goto(kommplanUrl("/"));
    expect(antwort!.status()).toBe(200);
    await warteAufSpaltenaufteilung(page);
    await klickeWennRuhig(page.getByRole("button", { name: "Neu", exact: true }));
    const formular = page.getByRole("form", { name: "Neuer Plan" });
    await oeffneUndPruefe(page, formular.getByLabel("Datum"));

    antwort = await page.goto(kommplanUrl("/p/beispiel-openr-2022-07-01"));
    expect(antwort!.status()).toBe(200);
    await warteAufSpaltenaufteilung(page);
    await klickeWennRuhig(page.getByRole("button", { name: "Plan und Verbindungen" }));
    const angaben = page.locator('fieldset[aria-label="Planangaben"]');
    await expect(angaben).toBeVisible();
    await oeffneUndPruefe(page, angaben.getByLabel("Datum"));
  });

  test.describe("lagerbuch", () => {
    test.beforeEach(async ({ page }) => {
      await devLogin(page, { host: LAGERBUCH_HOST, groups: LAGERBUCH_ADMIN_GRUPPE, callbackPath: "/verwaltung" });
      await page.setViewportSize(SCHMAL);
    });

    for (const pfad of ["/verwaltung/journal", "/verwaltung/checks"]) {
      test(`Zeitraum im Filter von ${pfad}`, async ({ page }) => {
        const antwort = await page.goto(lagerbuchUrl(pfad));
        expect(antwort!.status()).toBe(200);
        await warteAufGestreamteInhalte(page);
        await warteAufSpaltenaufteilung(page);
        await oeffneUndPruefe(page, page.getByLabel("Zeitraum von"));
        await oeffneUndPruefe(page, page.getByLabel("Zeitraum bis"));
      });
    }

    test("Datum auf dem Geräteblatt", async ({ page }) => {
      const antwort = await page.goto(lagerbuchUrl("/verwaltung/geraete/e2e-geraet"));
      expect(antwort!.status()).toBe(200);
      await warteAufGestreamteInhalte(page);
      await warteAufSpaltenaufteilung(page);
      await oeffneUndPruefe(page, page.getByLabel(/^(Nächste MTK|Ablaufdatum)$/));
    });

    // Vor der Abhilfe begann das Fenster hier 1px links außerhalb der Sichtfläche.
    test("Datum im Dialog „Neues Gerät“", async ({ page }) => {
      const antwort = await page.goto(lagerbuchUrl("/verwaltung/geraete"));
      expect(antwort!.status()).toBe(200);
      await warteAufGestreamteInhalte(page);
      await warteAufSpaltenaufteilung(page);
      await klickeWennRuhig(page.getByRole("button", { name: "Neues Gerät" }));
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await oeffneUndPruefe(page, dialog.getByLabel(/^(Nächste MTK|Ablaufdatum)$/));
    });
  });
});
