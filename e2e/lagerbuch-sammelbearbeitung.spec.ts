import { expect, test, type Page } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * DRK-293 — mehrere Artikel gemeinsam bearbeiten.
 *
 * WARUM EIN ECHTER BROWSER, obwohl Auswahl, Vorschau und Action je eigene
 * Unit-Tests haben: keiner von ihnen hat eine RSC-Grenze. Hier laeuft die ganze
 * Kette — angekreuzte Zeilen, Schublade, Server Action, und danach die Server
 * Component, die die Liste NEU RECHNET. Dass der neue Wert nach dem Neuladen
 * wieder in der Tabelle steht, sieht nur ein echter Abruf.
 *
 * DIE SPEICHERUNG PRUEFT IHRE ANTWORT (CLAUDE.md, zweite Testregel aus Falle
 * 10): sonst liefe eine abgelehnte Server Action still ins Zeitbudget und
 * meldete sich als „Kategorie noch die alte".
 *
 * DER TEST SCHIEBT ZWISCHEN ZWEI WERTEN HIN UND HER statt einen festen zu
 * setzen. Ein fester Zielwert waere beim zweiten Anlauf (`retries`) schon da,
 * die Vorschau meldete zu Recht „kein Artikel aendert sich", und der Knopf
 * bliebe gesperrt — der Test schluege fehl, obwohl nichts kaputt ist.
 *
 * Die beiden Artikel gehoeren allein diesem Spec (`seed-lagerbuch.ts`,
 * `sammelFixtures`).
 */
const ERSTER = "E2E Sammel Kompresse";
const ZWEITER = "E2E Sammel Dreiecktuch";
const EINS = "E2E Sammel Eins";
const ZWEI = "E2E Sammel Zwei";

async function artikelseiteOeffnen(page: Page): Promise<void> {
  await page.goto(lagerbuchUrl("/verwaltung/artikel"));
  // Dieselbe Vorsicht wie `lagerbuch-kategorien.spec.ts`: ohne Hydration
  // traefe ein Klick ein Kreuzchen ohne Handler.
  await page.waitForLoadState("networkidle");
}

test.describe("lagerbuch — mehrere Artikel gemeinsam bearbeiten (DRK-293)", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("legt eine Kategorie auf zwei ausgewählte Artikel und zeigt sie vorher an", async ({ page }) => {
    await artikelseiteOeffnen(page);

    const zeile = (name: string) => page.getByRole("row").filter({ hasText: name });
    await expect(zeile(ERSTER)).toHaveCount(1);
    await expect(zeile(ZWEITER)).toHaveCount(1);

    // Das Ziel ist der Wert, den die Artikel gerade NICHT tragen.
    const traegtEins = await zeile(ERSTER).filter({ hasText: EINS }).count() > 0;
    const ziel = traegtEins ? ZWEI : EINS;

    await klickeWennRuhig(zeile(ERSTER).getByRole("checkbox"));
    await klickeWennRuhig(zeile(ZWEITER).getByRole("checkbox"));

    const leiste = page.getByTestId("sammel-leiste");
    await expect(leiste).toContainText("2 ausgewählt");

    // Ein Klick auf das Kreuzchen darf die Artikelschublade nicht geöffnet
    // haben — beide liegen in derselben Zeile.
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await klickeWennRuhig(leiste.getByRole("button", { name: "Auswahl bearbeiten" }));

    const schublade = page.getByRole("dialog").filter({ hasText: "2 Artikel bearbeiten" });
    await expect(schublade).toBeVisible();
    await expect(schublade).toContainText(ERSTER);
    await expect(schublade).toContainText(ZWEITER);

    await schublade.getByRole("checkbox", { name: "Kategorie" }).check();
    await schublade
      .getByRole("combobox", { name: "Kategorie für alle ausgewählten Artikel" })
      .fill(ziel);

    // Das Akzeptanzkriterium: vor dem Speichern steht da, was passiert.
    await expect(page.getByTestId("sammel-zusammenfassung"))
      .toContainText("2 von 2 Artikeln ändern sich");

    const antwort = page.waitForResponse((r) => (
      r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined
    ));
    await klickeWennRuhig(page.getByTestId("sammel-speichern"));
    expect((await antwort).status()).toBe(200);

    await expect(schublade).toHaveCount(0);
    await expect(page.getByText("2 Artikel geändert.")).toBeVisible();

    // Der Beweis liegt auf dem Server, nicht in der Insel: neu laden und die
    // Liste aus der Server Component lesen.
    await artikelseiteOeffnen(page);
    await expect(zeile(ERSTER)).toContainText(ziel);
    await expect(zeile(ZWEITER)).toContainText(ziel);
  });
});
