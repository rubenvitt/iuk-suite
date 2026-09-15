import { expect, test } from "@playwright/test";
import { devLogin } from "./fixtures";
import {
  E2E_LAST_ANZAHL,
  LAGERBUCH_ADMIN_GRUPPE,
  LAGERBUCH_HOST,
  lagerbuchUrl,
} from "./helpers/lagerbuch";

/**
 * DRK-334 — auf dem Telefon scrollt die TABELLE, nicht die Seite.
 *
 * WAS KEIN ANDERES TOR HIER SEHEN KANN: alles. `typecheck` und `build` prüfen
 * Zahlen und Modulgrenzen, nicht Layoutboxen; Vitest kann es STRUKTURELL nicht
 * sehen, weil jsdom keine Kästen rechnet (Falle 13) und eine virtuelle Tabelle
 * dort ÜBERHAUPT KEINE ZEILE rendert (Falle 14). Die Rechnung dahinter ist in
 * `src/core/tabelle/vollhoehe.test.ts` geprüft — ob sie im Browser die
 * gewünschte Wirkung hat, entsteht als Aussage allein hier.
 *
 * ⚠️ DIE VIRTUALISIERUNG WIRD ZUERST BEWIESEN, nicht angenommen. `core/tabelle`
 * virtualisiert erst ab 150 Zeilen; unterhalb davon gibt es den zweiten
 * Scrollcontainer gar nicht, und jede Zusicherung hier wäre mühelos grün, ohne
 * je das Verhalten zu prüfen, um das es geht (Falle 3 der Testregeln: „in
 * welchem falschen Zustand wäre das auch grün?"). Die 200 Lastartikel stehen
 * dafür im Seed (`E2E_LAST_ANZAHL`).
 *
 * ⚠️ JEDER TEST TRÄGT EIN SEITENSPEZIFISCHES MERKMAL (`lb-excel`): ohne (oder
 * mit falschem) `groups` bezeugt der Lauf sonst eine 404 — und eine 404 hat
 * weder zwei Scroller noch einen Überlauf, besteht also stillschweigend.
 */

/** Der Scrollcontainer, den rc-virtual-list anlegt. */
const KOERPER = ".ant-table-tbody-virtual-holder";

async function artikelseite(page: import("@playwright/test").Page): Promise<void> {
  const antwort = await page.goto(lagerbuchUrl("/verwaltung/artikel"));
  expect(antwort?.status(), "/verwaltung/artikel: HTTP").toBe(200);
  await expect(page.getByTestId("lb-excel")).toBeVisible();
  // Ohne Hydration steht die gemessene Höhe noch auf ihrem Startwert und die
  // Deckelung ist gar nicht gesetzt (Begründung in `lagerbuch-ux.spec.ts`).
  await page.waitForLoadState("networkidle");
}

test.describe("Artikeltabelle auf dem Telefon (DRK-334)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung/artikel",
    });
  });

  test("die Seite selbst scrollt nicht — nur der Tabellenkörper", async ({ page }) => {
    await artikelseite(page);

    // 1) Die Vorbedingung, ohne die der Rest nichts aussagt.
    const koerper = page.locator(KOERPER);
    await expect(
      koerper,
      `Die Tabelle virtualisiert nicht — mit weniger als 150 Zeilen prüft dieser `
      + `Test nichts. Seed: ${E2E_LAST_ANZAHL} Lastartikel.`,
    ).toHaveCount(1);

    // 2) Die Aussage: das Dokument hat keinen Scrollweg.
    //    ⚠️ Ein Pixel Toleranz, weil Chromium Layoutboxen mit Nachkommastellen
    //    rechnet und `scrollHeight` aufrundet. Zwei Scrollbalken kosten immer
    //    deutlich mehr als ein Pixel — die Toleranz kann den Befund nicht
    //    verstecken.
    const seite = await page.evaluate(() => {
      const wurzel = document.scrollingElement as HTMLElement;
      return { scrollHeight: wurzel.scrollHeight, clientHeight: wurzel.clientHeight };
    });
    expect(
      seite.scrollHeight,
      `Das Dokument scrollt (${seite.scrollHeight} > ${seite.clientHeight}) — `
      + "damit stehen zwei senkrechte Scroller ineinander.",
    ).toBeLessThanOrEqual(seite.clientHeight + 1);

    // 3) …und die Tabelle scrollt tatsächlich, statt nur gedeckelt zu sein.
    //    Ohne diese Hälfte wäre eine Tabelle, die man gar nicht mehr bewegen
    //    kann, die perfekte Lösung.
    const gefahren = await koerper.evaluate((el) => {
      el.scrollTop = 400;
      return el.scrollTop;
    });
    expect(gefahren, "der Tabellenkörper lässt sich nicht scrollen").toBeGreaterThan(0);

    // 4) Und die Bewegung bleibt drin, statt am Ende in das Dokument
    //    weiterzulaufen (`overscroll-behavior`, außerhalb der Media Query).
    await expect(koerper).toHaveCSS("overscroll-behavior-y", "contain");

    // 5) Die Gegenprobe zum Schreibtisch-Test weiter unten: hier GILT die
    //    Media Query. Ein `max-width`, das versehentlich zu `min-width` wird,
    //    faellt sonst an keiner der beiden Breiten auf.
    await expect(page.locator("[data-rolle=tabellenrahmen]")).toHaveCSS("overflow-y", "hidden");
  });

  test("die Werkzeugleiste bleibt stehen, während die Tabelle fährt", async ({ page }) => {
    await artikelseite(page);

    const knopf = page.getByTestId("lb-excel");
    const vorher = await knopf.boundingBox();
    expect(vorher, "ohne Kasten misst der Vergleich unten nichts").not.toBeNull();
    await page.locator(KOERPER).evaluate((el) => { el.scrollTop = 600; });
    const nachher = await knopf.boundingBox();

    // Der Punkt der ganzen Übung: auf einer Seite, die als Ganzes scrollt,
    // wandert die Leiste beim Blättern aus dem Bild.
    expect(nachher?.y).toBe(vorher?.y);
    await expect(knopf).toBeInViewport();
  });

  /**
   * DER RANDFALL, und er ist bewusst die andere Richtung.
   *
   * Auf einem sehr niedrigen Schirm bleibt für den Tabellenkörper nicht einmal
   * `mindestens` übrig. Dann gibt `TabellenVollhoehe` die Deckelung AUF: lieber
   * eine scrollende Seite als ein `overflow: hidden`, das Bedienelemente
   * abschneidet, an die danach niemand mehr herankommt.
   *
   * 390×360 ist kein echtes Gerät, sondern der billigste Weg, den Zustand
   * herzustellen — dieselbe Lage entsteht auf einem echten Telefon im
   * Querformat mit aufgeklappter Sammelleiste.
   */
  test("gibt die Deckelung auf, wenn kein Platz für die Tabelle bleibt", async ({ page }) => {
    await artikelseite(page);
    await page.setViewportSize({ width: 390, height: 360 });
    // Die Messung hängt an `resize`; ohne diesen Atemzug misst der Test den
    // Zustand von vorher.
    await expect
      .poll(async () => page.evaluate(() => {
        const wurzel = document.scrollingElement as HTMLElement;
        return wurzel.scrollHeight > wurzel.clientHeight;
      }), { message: "die Seite muss wieder scrollen dürfen" })
      .toBe(true);

    // Und die Probe darauf, worum es dabei geht: der Knopf ist erreichbar.
    await page.getByTestId("lb-excel").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("lb-excel")).toBeInViewport();

    // ⚠️ Der innere Scroller ist trotzdem noch da — deshalb haengt
    // `overscroll-behavior` an `.tabelle` und nicht an der Deckelung. Stuende
    // es dort, waere es genau in diesem Zustand still verschwunden.
    await expect(page.locator(KOERPER)).toHaveCSS("overscroll-behavior-y", "contain");
  });
});

/**
 * Am Schreibtisch gilt die Deckelung NICHT — die Media Query endet bei 767px,
 * und dort ist eine mitlaufende Seite richtig: die Leiste links hat ihren
 * eigenen Scroller, und der Inhalt darf länger sein als der Schirm.
 *
 * Der Test steht hier, weil eine Media Query genau so falsch sein kann: ein
 * `max-width`, das versehentlich zu `min-width` wird, fiele bei 390px nicht auf.
 */
test.describe("Artikeltabelle am Schreibtisch (DRK-334)", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung/artikel",
    });
  });

  test("deckelt die Seitenhöhe nicht, hält die Bewegung aber im Körper", async ({ page }) => {
    await artikelseite(page);

    // `overflow` ist der ehrlichste Zeuge der Media Query: `hidden` steht
    // AUSSCHLIESSLICH darin. Die Hoehe taugt nicht dafuer — sie ist am
    // Schreibtisch ohnehin fast dieselbe Zahl, weil `scroll.y` so oder so bis
    // zum unteren Fensterrand gemessen wird.
    await expect(page.locator("[data-rolle=tabellenrahmen]")).toHaveCSS("overflow-y", "visible");

    await expect(page.locator(KOERPER)).toHaveCSS("overscroll-behavior-y", "contain");
  });
});
