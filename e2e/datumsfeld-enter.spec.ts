import { test, expect, type Locator, type Page } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";
import { RADIO_ADMIN_GRUPPE, RADIO_HOST, radioUrl } from "./helpers/radio";
import { UAV_ADMIN_GRUPPE, UAV_HOST, uavUrl } from "./helpers/uav";

/**
 * DRK-494 — `ENTER` IM DATUMSFELD UEBERNIMMT DAS DATUM UND SENDET NICHT AB, in `radio` und `uav`.
 *
 * Derselbe Befund wie in DRK-483 (`e2e/lagerbuch-zugang-enter.spec.ts`), an den zwei Formularen
 * mit eigenem Absendeknopf, die danach noch ungeschuetzt waren: rc-picker uebernimmt die getippte
 * Eingabe, verhindert die implizite Absendung des Browsers aber nicht (`core/formular/enter.ts`).
 * In `radio` speicherte ein `Enter` in „Zuletzt aktualisiert" das ganze Geraet, in `uav` legte es
 * den Teilnehmer an. Die Teilnehmerdetailseite nutzt dasselbe `Datumsfeld` und ist mit gedeckt.
 *
 * ⚠️ NUR EIN ECHTER BROWSER SIEHT ES. jsdom kennt keine implizite Absendung.
 *
 * ⚠️ EINE NEGATIVE ZUSICHERUNG BRAUCHT EIN ZEITFENSTER — dasselbe wie im Lagerbuch-Fall: vor dem
 * Riegel ging die Server Action im selben Tastendruck los; nach einer Sekunde Ruhe hat das
 * `Enter` nichts ausgeloest.
 */

function istServerAction(r: { method(): string; headers(): Record<string, string> }): boolean {
  return r.method() === "POST" && r.headers()["next-action"] !== undefined;
}

/** Zeichnet jede Server Action ab jetzt auf. */
function lauscheAufAktionen(page: Page): string[] {
  const aktionen: string[] = [];
  page.on("request", (r) => {
    if (istServerAction(r)) aktionen.push(r.url());
  });
  return aktionen;
}

/** Tippt ein Datum ins Feld und uebernimmt es mit Enter; das Panel muss danach zu sein. */
async function tippeUndUebernimm(page: Page, feld: Locator, datum: string): Promise<void> {
  await feld.click();
  await feld.fill(datum);
  await feld.press("Enter");
  await expect(page.locator(".ant-picker-dropdown:not(.ant-picker-dropdown-hidden)")).toHaveCount(0);
  await expect(feld).toHaveValue(datum);
}

test.describe("Datumsfeld — Enter sendet nicht ab (DRK-494)", () => {
  test("radio: Enter in „Zuletzt aktualisiert“ speichert das Geraet nicht", async ({ page }) => {
    await devLogin(page, { host: RADIO_HOST, groups: RADIO_ADMIN_GRUPPE });

    // Die Id ueber `data-row-key`, nicht per Zeilenklick (Falle 12; Vorbild: Fall 3 in
    // `radio-verwaltung.spec.ts`).
    await page.goto(radioUrl("/admin/geraete"));
    const zeilen = page.locator("table tbody tr.ant-table-row");
    await expect(zeilen.first(), "der radio-Seed hat kein Geraet angelegt").toBeVisible();
    const geraeteId = await zeilen.first().getAttribute("data-row-key");
    expect(geraeteId, "die Tabellenzeile traegt kein data-row-key").toBeTruthy();

    const antwort = await page.goto(radioUrl(`/admin/geraete/${geraeteId}`));
    expect(antwort?.status(), "/admin/geraete/<id> auf dem radio-Host").toBe(200);
    await page.waitForLoadState("networkidle");

    const aktionen = lauscheAufAktionen(page);
    // Das Formular setzt kein `format`; es gilt `fieldDateFormat` der deutschen Locale.
    const datum = "15.07.2091";
    const feld = page.getByLabel("Zuletzt aktualisiert");
    await tippeUndUebernimm(page, feld, datum);

    await page.waitForTimeout(1_000);
    expect(aktionen, "Enter im Datumsfeld darf das Geraet nicht speichern").toEqual([]);
    await expect(feld).toHaveValue(datum);
  });

  test("uav: Enter in „Beginn“ legt den Teilnehmer nicht an", async ({ page }) => {
    await devLogin(page, { host: UAV_HOST, groups: UAV_ADMIN_GRUPPE, callbackPath: "/admin" });
    const antwort = await page.goto(uavUrl("/admin"));
    expect(antwort?.status(), "/admin auf dem uav-Host").toBe(200);
    await page.waitForLoadState("networkidle");

    // Versuchszaehler im Namen: eine Datenbank fuer alle Versuche (`retries`).
    const name = `E2E Enter-Teilnehmer Versuch ${test.info().retry}`;
    await page.locator("#tn-name").fill(name);

    const aktionen = lauscheAufAktionen(page);
    // Anzeigeformat des Feldes (`Datumsfeld.tsx`, `DD.MM.YYYY`).
    const datum = "15.07.2091";
    const feld = page.locator("#tn-beginn");
    await tippeUndUebernimm(page, feld, datum);

    await page.waitForTimeout(1_000);
    expect(aktionen, "Enter im Datumsfeld darf den Teilnehmer nicht anlegen").toEqual([]);
    // Ein Absenden haette beide Felder geleert.
    await expect(page.locator("#tn-name")).toHaveValue(name);
    await expect(feld).toHaveValue(datum);

    // Erst der Knopf legt an — mit dem per Enter uebernommenen Datum.
    const anlegen = page.waitForResponse((r) => istServerAction(r.request()), { timeout: 60_000 });
    await klickeWennRuhig(page.getByRole("button", { name: "Teilnehmer anlegen" }));
    expect((await anlegen).ok(), "Teilnehmer anlegen: Server Action").toBe(true);
    await expect(page.locator("#tn-name")).toHaveValue("");
  });
});
