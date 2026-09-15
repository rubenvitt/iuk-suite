import { test, expect } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * ABGELAUFENES MATERIAL JE FAHRZEUG (DRK-298).
 *
 * ⚠️ WARUM DIESE SPEC NEBEN `FahrzeugVerfallTabelle.test.tsx` UND
 * `FahrzeugeListe.test.tsx` STEHT — ZWEI AUSSAGEN, DIE NUR EIN ECHTER ABRUF
 * MACHEN KANN:
 *
 * (1) `/verwaltung/verfall` ANTWORTET UEBERHAUPT. Auf der Seite steht seit
 *     diesem Ticket eine Tabelle, und antds `Table` ist selbst eine
 *     Client-Komponente: ein `columns[].render`, das in der Server Component
 *     entstuende, waere eine gewoehnliche Funktion, die React nicht ueber die
 *     RSC-Grenze reicht — HTTP 500 fuer die ganze Seite. `typecheck` und
 *     `build` bleiben dabei gruen, und ein `mount()` in jsdom ist ein einziger
 *     JS-Prozess OHNE RSC-Grenze, kann es also strukturell nicht sehen
 *     (Falle 9, `CLAUDE.md`). Nur der Statuscode hier zeigt es.
 *
 * (2) DIE ZEILEN KOMMEN AUS DER DATENBANK, nicht aus einer Fixture. Vitest
 *     prueft die Tabelle gegen erfundene Zeilen; dass `lagerortVerfallListe`
 *     eine abgelaufene Meldung ueberhaupt liefert und die Server Component ihre
 *     Ampel richtig aufloest, steht erst hier fest.
 *
 * Der Seed liefert zwei eigene, inaktive Fahrzeuge (`fahrzeugVerfallFixtures`).
 * Die Spec SCHREIBT NICHTS und endet im Ausgangszustand.
 */
test.describe("Abgelaufenes Material je Fahrzeug", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("die Verfallseite traegt die Meldung mit Artikel, Monat und Fahrzeug", async ({ page }) => {
    const antwort = await page.goto(lagerbuchUrl("/verwaltung/verfall"));
    // ⛔ NICHT NUR `toBeVisible()` weiter unten: eine 500er Seite waere hier
    // schon entschieden, und die Sichtbarkeitsprobe liefe stattdessen in ihr
    // Zeitbudget und meldete sich als etwas ganz anderes.
    expect(antwort!.status()).toBe(200);

    /**
     * ⚠️ `[data-row-key]` UND NICHT `tbody tr` (Falle 14). Ab
     * `VIRTUELL_AB_ZEILEN` rendert rc-table Zeilen als `div` ohne `role="row"`;
     * ein Greifer ueber `tbody tr` findet dann nichts mehr — und zwar erst
     * dann, was ihn heute, bei wenigen Meldungen, gruen liesse.
     */
    const zeile = page.locator("[data-row-key='e2e-verfall-fahrzeug:e2e-verfall-artikel']");
    await expect(zeile).toContainText("E2E Verfall-RTW");
    await expect(zeile).toContainText("MS-E2E-4");
    await expect(zeile).toContainText("E2E Verfall NaCl");
    // ⚠️ „01/20", NICHT „01/2020" — `fmtVerfall` ist das Monatsformat des
    // ganzen Moduls (auch auf der Plakette). Ein zweites Format nur fuer diese
    // Spalte waere genau die Drift, gegen die die eine Funktion existiert.
    await expect(zeile).toContainText("01/20");
    await expect(zeile).toContainText("abgelaufen");

    // Das Fahrzeug ist von hier aus erreichbar — der Weg zur Austauschliste.
    await expect(zeile.locator("a")).toHaveAttribute(
      "href", "/verwaltung/fahrzeuge/e2e-verfall-fahrzeug");
  });

  test("die Meldungen lassen sich auf ein Fahrzeug eingrenzen", async ({ page }) => {
    const antwort = await page.goto(lagerbuchUrl("/verwaltung/verfall"));
    expect(antwort!.status()).toBe(200);

    // Beide Fahrzeuge stehen zuerst da — sonst pruefte das Eingrenzen nichts.
    await expect(
      page.locator("[data-row-key='e2e-verfall-fahrzeug:e2e-verfall-artikel']"),
    ).toBeVisible();
    await expect(
      page.locator("[data-row-key='e2e-verfall-fahrzeug-2:e2e-verfall-artikel']"),
    ).toBeVisible();

    // Ueber die Suche statt ueber den Spaltenfilter: dieselbe fachliche Frage
    // („nur dieses Fahrzeug"), aber ohne von antds Filtermenue-Markup abzuhaengen.
    await page.getByRole("searchbox").first().fill("E2E Verfall-RTW");
    await expect(
      page.locator("[data-row-key='e2e-verfall-fahrzeug:e2e-verfall-artikel']"),
    ).toBeVisible();
    await expect(
      page.locator("[data-row-key='e2e-verfall-fahrzeug-2:e2e-verfall-artikel']"),
    ).toBeHidden();
    // ⚠️ „1 von" OHNE GESAMTZAHL: die Trefferanzeige nennt beide Zahlen, aber
    // die zweite gehoert dieser Spec nicht allein — ein Check in einem anderen
    // Spec kann jederzeit eine weitere Meldung schreiben.
    await expect(page.getByTestId("trefferanzeige")).toContainText("1 von");
  });

  /**
   * ⚠️ DER TEIL, DEN DIE VERFALLSEITE NICHT BEANTWORTEN KANN. Sie zeigt nur
   * vorhandene Meldungen — ein Fahrzeug ohne Meldung fehlt dort einfach, und
   * „nichts faellig" ist von „nie angesehen" nicht zu unterscheiden. In der
   * Fahrzeugliste hat jedes Fahrzeug eine Zeile, also steht die Antwort dort.
   *
   * ⚠️ „0 von 1 erfasst" UND NICHT „nichts erfasst": die Spalte misst gegen das
   * aktive Soll, seit eine einzelne Angabe kein gepflegtes Fahrzeug mehr
   * beweist (Reviewbefund zu DRK-298). Die Quote ist zugleich der Beleg, dass
   * hier ueberhaupt etwas zu erfassen WAERE.
   */
  test("die Fahrzeugliste trennt abgelaufen von nie angesehen", async ({ page }) => {
    const antwort = await page.goto(lagerbuchUrl("/verwaltung/fahrzeuge"));
    expect(antwort!.status()).toBe(200);

    await klickeWennRuhig(page.getByRole("searchbox").first());
    await page.getByRole("searchbox").first().fill("E2E ");

    await expect(page.locator("[data-row-key='e2e-verfall-fahrzeug']"))
      .toContainText("1 abgelaufen");
    await expect(page.locator("[data-row-key='e2e-ungepflegt-fahrzeug']"))
      .toContainText("0 von 1 erfasst");
  });
});
