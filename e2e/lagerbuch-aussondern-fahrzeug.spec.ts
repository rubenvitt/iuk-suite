import { test, expect } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * AUSSONDERN AUS EINEM FAHRZEUG (DRK-303).
 *
 * ⚠️ WARUM DIESE SPEC NEBEN `AussondernDialog.test.tsx` STEHT — DREI AUSSAGEN,
 * DIE NUR EIN ECHTER ABRUF MACHEN KANN:
 *
 * (1) DAS FAHRZEUGBLATT ANTWORTET UEBERHAUPT NOCH. Der Dialog haengt in einer
 *     `columns[].render`-Funktion; entstuende sie in der Server Component, waere
 *     sie eine gewoehnliche Funktion, die React nicht ueber die RSC-Grenze
 *     reicht — HTTP 500 fuer das ganze Blatt. `typecheck` und `build` bleiben
 *     dabei gruen, und ein `mount()` in jsdom ist ein einziger JS-Prozess OHNE
 *     RSC-Grenze (Falle 9, `CLAUDE.md`).
 *
 * (2) DIE SERVER ACTION LAEUFT WIRKLICH. In `AussondernDialog.test.tsx` ist sie
 *     gemockt — dort steht fest, dass die Insel die richtigen Werte SCHICKT,
 *     nicht, dass am anderen Ende gebucht wird.
 *
 * (3) DER BESTAND SINKT UM DIE GEZAEHLTE MENGE. Das ist der ganze Zweck: vier
 *     im Fahrzeug, eines ausgesondert, drei uebrig.
 *
 * DIESE SPEC SCHREIBT und arbeitet deshalb auf einem EIGENEN Fahrzeug
 * (`aussondernFahrzeugFixtures`). Der Bestand ist danach dauerhaft um 1
 * niedriger — die Zusicherungen unten sind so geschrieben, dass sie das
 * aushalten (relativ, nicht absolut).
 */
const BLATT = "/verwaltung/fahrzeuge/e2e-aussondern-fahrzeug";

test.describe("Aussondern aus einem Fahrzeug", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("bucht die gezaehlte Menge ab und senkt den Ist-Bestand", async ({ page }) => {
    const antwort = await page.goto(lagerbuchUrl(BLATT));
    // ⛔ NICHT nur `toBeVisible()` weiter unten: eine 500er Seite waere hier
    // schon entschieden, und die Sichtbarkeitsprobe liefe stattdessen in ihr
    // Zeitbudget und meldete sich als etwas ganz anderes (Falle 10).
    expect(antwort!.status()).toBe(200);

    const istZelle = page.locator(
      "[data-row-key='e2e-aussondern-soll'] [data-rolle='ist']",
    );
    await expect(istZelle).toBeVisible();
    const vorher = Number((await istZelle.innerText()).match(/\d+/)![0]);
    expect(vorher).toBeGreaterThan(0);

    await klickeWennRuhig(page.getByRole("button", { name: "E2E Verfall NaCl aussondern" }));
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Menge").fill("1");
    await dialog.getByLabel("Kommentar").fill("E2E MHD ueberschritten");

    /*
     * ⚠️ AUF DIE ANTWORT WARTEN, NICHT AUF EINE SPAETERE ZUSTANDSAENDERUNG
     * (Falle 10, zweite Testregel). Eine abgelehnte Server Action (404, 405,
     * abgebrochen) liefe sonst still ins Zeitbudget und meldete sich als
     * „Bestand hat sich nicht geaendert" — einem Symptom, das in die Irre fuehrt.
     */
    const [aktionsAntwort] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes(BLATT)),
      page.getByRole("button", { name: "Aussondern", exact: true }).click(),
    ]);
    expect(aktionsAntwort.status()).toBe(200);

    await expect(dialog).toBeHidden();
    // Genau eines weniger — die Menge aus dem Feld, nicht der ganze Bestand.
    await expect(istZelle).toContainText(String(vorher - 1));
  });
});
