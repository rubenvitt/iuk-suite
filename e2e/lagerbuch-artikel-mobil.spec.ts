import { expect, test } from "@playwright/test";
import { devLogin } from "./fixtures";
import {
  E2E_LAST_ANZAHL,
  LAGERBUCH_ADMIN_GRUPPE,
  LAGERBUCH_HOST,
  lagerbuchUrl,
} from "./helpers/lagerbuch";

/**
 * DIE ARTIKELLISTE AUF DEM TELEFON — und am Schreibtisch (DRK-334, DRK-451).
 *
 * WAS KEIN ANDERES TOR HIER SEHEN KANN: alles. `typecheck` und `build` prüfen
 * Zahlen und Modulgrenzen, nicht Layoutboxen; Vitest kann es STRUKTURELL nicht
 * sehen, weil jsdom keine Kästen rechnet (Falle 13), Media Queries gar nicht
 * auswertet und eine virtuelle Tabelle dort ÜBERHAUPT KEINE ZEILE rendert
 * (Falle 14). Die Rechnung dahinter ist in `src/core/tabelle/vollhoehe.test.ts`
 * geprüft — ob sie im Browser die gewünschte Wirkung hat, entsteht als Aussage
 * allein hier.
 *
 * ⚠️ DIE DATEI HAT ZWEI HÄLFTEN MIT ZWEI VERSCHIEDENEN AUSSAGEN, seit DRK-451
 * die Darstellung unter 768px ausgetauscht hat:
 *
 *  * Bei 390px steht eine KARTENLISTE. Die Deckelung aus DRK-334 ist dort
 *    ausdrücklich WEG — es gibt keinen zweiten Scroller mehr, gegen den sie
 *    erfunden wurde, und `overflow: hidden` schnitte die Liste ab.
 *  * Bei 1280px steht die virtualisierte TABELLE, und dort gilt DRK-334
 *    unverändert.
 *
 * ⚠️ BEIDE BREITEN ZÄHLEN, NICHT NUR EINE. Ein Test, der nur bei 390px misst,
 * kann eine `display:none`-Regel gar nicht widerlegen: dort sagen die richtige
 * und die kaputte Fassung beide „sichtbar" (`docs/design/README.md`, „Tests für
 * Responsives").
 *
 * ⚠️ DIE VIRTUALISIERUNG WIRD ZUERST BEWIESEN, nicht angenommen. `core/tabelle`
 * virtualisiert erst ab 150 Zeilen; unterhalb davon gibt es den zweiten
 * Scrollcontainer gar nicht, und jede Zusicherung darauf wäre mühelos grün,
 * ohne je das Verhalten zu prüfen, um das es geht (Falle 3 der Testregeln: „in
 * welchem falschen Zustand wäre das auch grün?"). Die 200 Lastartikel stehen
 * dafür im Seed (`E2E_LAST_ANZAHL`).
 *
 * ⚠️ JEDER TEST TRÄGT EIN SEITENSPEZIFISCHES MERKMAL (`lb-excel`): ohne (oder
 * mit falschem) `groups` bezeugt der Lauf sonst eine 404 — und eine 404 hat
 * weder Karten noch zwei Scroller noch einen Überlauf, besteht also
 * stillschweigend jede Zusicherung.
 */

/** Der Scrollcontainer, den rc-virtual-list anlegt. */
const KOERPER = ".ant-table-tbody-virtual-holder";

/** Die beiden Darstellungen der `Kartentabelle` (DRK-451). */
const KARTEN = '[data-rolle="schmalkarten"]';
const BREIT = '[data-rolle="breitansicht"]';

async function artikelseite(page: import("@playwright/test").Page): Promise<void> {
  const antwort = await page.goto(lagerbuchUrl("/verwaltung/artikel"));
  expect(antwort?.status(), "/verwaltung/artikel: HTTP").toBe(200);
  await expect(page.getByTestId("lb-excel")).toBeVisible();
  // Ohne Hydration steht die gemessene Höhe noch auf ihrem Startwert und die
  // Deckelung ist gar nicht gesetzt (Begründung in `lagerbuch-ux.spec.ts`).
  await page.waitForLoadState("networkidle");
}

test.describe("Artikelliste auf dem Telefon (DRK-451)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung/artikel",
    });
  });

  /*
   * ⚠️ HIER STANDEN BIS DRK-451 DIE ZUSICHERUNGEN AUS DRK-334 — „die Seite
   * scrollt nicht, nur der Tabellenkörper". Sie sind nicht kaputtgegangen,
   * ihre VORAUSSETZUNG ist weggefallen: auf 390px steht hier keine Tabelle
   * mehr, sondern eine Kartenliste, und damit gibt es den zweiten Scroller
   * nicht, gegen den die Deckelung erfunden wurde. Eine Deckelung ohne zweiten
   * Scroller wäre nicht bloss überflüssig, sondern schädlich — `overflow:
   * hidden` schnitte die Kartenliste bei der Fensterhöhe ab.
   *
   * Die Rechnung selbst lebt weiter und gilt unverändert am Schreibtisch
   * (`vollhoehe.test.ts`, und der 1280er-Block unten).
   */
  test("bei 390px stehen Karten, keine Tabelle — und die Seite scrollt wieder", async ({ page }) => {
    await artikelseite(page);

    await expect(page.locator(KARTEN)).toBeVisible();
    await expect(page.locator(BREIT)).toBeHidden();

    /*
     * ⚠️ DIE DECKELUNG MUSS WEG SEIN, und das ist die eigentliche Aussage.
     * `display: none` nimmt die Tabelle aus dem BILD, nicht aus dem DOM: ihr
     * virtueller Körper ist weiterhin zu finden und meldet lauter Nullen.
     * `TabellenVollhoehe` erkennt die Kartenliste deshalb ausdrücklich — ohne
     * das stünde der Rahmen auf einer aus Nullen gerechneten Höhe mit
     * `overflow: hidden`, und alles unterhalb wäre unerreichbar.
     */
    await expect(page.locator("[data-rolle=tabellenrahmen]")).toHaveCSS("overflow-y", "visible");

    // Die Gegenprobe dazu: man kommt tatsächlich ans Ende der Liste.
    await page.locator(KARTEN).locator("li").last().scrollIntoViewIfNeeded();
    await expect(page.locator(KARTEN).locator("li").last()).toBeInViewport();
  });

  /*
   * ⚠️ EINE KARTE, DIE WAAGERECHT SCROLLT, WÄRE DIE TABELLE ZURÜCK. Das ist
   * die gemeldete Sache, und sie wird als Zahl geprüft — „sichtbar" allein
   * reicht nicht: ein Element in einem waagerecht gescrollten Kasten meldet
   * sich als sichtbar, auch wenn niemand es sieht (dieselbe Lehre wie in
   * `lagerbuch-inventur-mobil.spec.ts`).
   */
  test("nichts läuft seitwärts aus dem Schirm", async ({ page }) => {
    await artikelseite(page);

    const masse = await page.evaluate(() => {
      const wurzel = document.scrollingElement as HTMLElement;
      return { scrollWidth: wurzel.scrollWidth, clientWidth: wurzel.clientWidth };
    });
    expect(
      masse.scrollWidth,
      `Die Seite läuft waagerecht über (${masse.scrollWidth} > ${masse.clientWidth}).`,
    ).toBeLessThanOrEqual(masse.clientWidth + 1);

    const karte = page.locator(KARTEN).locator("li").first();
    const kasten = await karte.boundingBox();
    expect(kasten, "die erste Karte hat keinen Kasten").not.toBeNull();
    expect(kasten!.x, "die Karte beginnt links vom Schirmrand").toBeGreaterThanOrEqual(0);
    expect(kasten!.x + kasten!.width, "die Karte ragt rechts aus dem Schirm")
      .toBeLessThanOrEqual(390);
  });

  /*
   * ⚠️ OHNE DIESE LEISTE HÄTTE DIE UMSTELLUNG DEM TELEFON ETWAS WEGGENOMMEN.
   * Filter und Sortierung sitzen seit DRK-333 ausschliesslich im Spaltenkopf —
   * und den gibt es auf einer Karte nicht. Vorher kam man über die waagerecht
   * gescrollte Zeile noch an den Trichter, danach gar nicht mehr.
   */
  test("filtern und sortieren geht ohne Spaltenköpfe", async ({ page }) => {
    await artikelseite(page);

    const leiste = page.locator('[data-rolle="schmalsteuerung"]');
    await expect(leiste).toBeVisible();
    await expect(leiste.getByLabel("Sortierung")).toBeVisible();

    const vorher = await page.locator(KARTEN).locator("li").count();
    expect(vorher, "ohne Karten misst der Rest nichts").toBeGreaterThan(0);

    // Ein Spaltenfilter, gesetzt von der Leiste aus — die Karten müssen ihm
    // folgen, sonst führen die beiden Darstellungen zwei Wahrheiten.
    await leiste.getByLabel("Status filtern").click();
    await page.getByTitle("inaktiv", { exact: true }).click();
    await expect.poll(
      async () => page.locator(KARTEN).locator("li").count(),
      { message: "der Filter aus der Leiste erreicht die Karten nicht" },
    ).toBeLessThan(vorher);

    // Und die Trefferanzeige sagt, warum die Liste kurz ist — auf der Karte
    // fehlt der gefüllte Trichter, an dem man das sonst sieht.
    await expect(leiste).toContainText(/\d+ von \d+/);
    await leiste.getByRole("button", { name: "Filter zurücksetzen" }).click();
    await expect.poll(async () => page.locator(KARTEN).locator("li").count()).toBe(vorher);
  });

  test("die Werkzeugleiste bleibt erreichbar", async ({ page }) => {
    await artikelseite(page);
    await expect(page.getByTestId("lb-excel")).toBeInViewport();
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

    /*
     * ⚠️ DIE VORBEDINGUNG ZUERST, sonst misst der Rest nichts. `core/tabelle`
     * virtualisiert erst ab 150 Zeilen; unterhalb davon gibt es den
     * Scrollcontainer gar nicht, und beide Zusicherungen unten wären an einem
     * Element, das nicht existiert — `toHaveCSS` an einem leeren Greifer läuft
     * in sein Zeitbudget statt eine Aussage zu treffen. Die 200 Lastartikel
     * stehen dafür im Seed.
     *
     * Seit DRK-451 steht diese Probe HIER und nicht mehr im 390er-Block: dort
     * gibt es keine Tabelle mehr, sondern eine Kartenliste.
     */
    await expect(
      page.locator(KOERPER),
      `Die Tabelle virtualisiert nicht — dann prüft dieser Test nichts. `
      + `Seed: ${E2E_LAST_ANZAHL} Lastartikel.`,
    ).toHaveCount(1);

    await expect(page.locator(BREIT)).toBeVisible();
    await expect(page.locator(KARTEN)).toBeHidden();

    // `overflow` ist der ehrlichste Zeuge der Media Query: `hidden` steht
    // AUSSCHLIESSLICH darin. Die Hoehe taugt nicht dafuer — sie ist am
    // Schreibtisch ohnehin fast dieselbe Zahl, weil `scroll.y` so oder so bis
    // zum unteren Fensterrand gemessen wird.
    await expect(page.locator("[data-rolle=tabellenrahmen]")).toHaveCSS("overflow-y", "visible");

    await expect(page.locator(KOERPER)).toHaveCSS("overscroll-behavior-y", "contain");
  });
});
