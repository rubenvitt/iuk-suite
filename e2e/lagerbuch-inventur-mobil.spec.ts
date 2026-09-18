import { expect, test, type Page } from "@playwright/test";
import { devLogin } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * DRK-421 — DIE INVENTUR AUF DEM TELEFON.
 *
 * ⚠️ WAS KEIN ANDERES TOR HIER SEHEN KANN: alles. `typecheck` kennt keine
 * Klassennamen, `build` serialisiert klaglos, der Quelltext-Scan in
 * `core/tabelle/schmalkarten.test.ts` sieht die Regel und nicht die Kaskade —
 * und **jsdom wertet Media Queries überhaupt nicht aus**, ein Vitest dagegen
 * wäre immer grün, ohne etwas zu messen (`docs/design/README.md`, „Tests für
 * Responsives").
 *
 * ⚠️ UND BEIDE VIEWPORTS ZÄHLEN, NICHT NUR DER SCHMALE. Ein Test, der nur bei
 * 390px misst, kann eine `display:none`-Regel gar nicht widerlegen: dort sagen
 * die richtige und die kaputte Fassung beide „sichtbar". Genau so ist Falle 5
 * in diesem Ticket einmal durchgekommen — die Filterleiste hing an einer
 * antd-`Flex`, beide Regeln einklassig, antds CSS kommt zur Laufzeit danach,
 * und die Leiste stand bei 1280px da, obwohl die Regel richtig dastand.
 *
 * ⚠️ DIE VIRTUALISIERUNG GEHÖRT NICHT HIERHER, und das ist kein Versäumnis: die
 * Lastartikel des Seeds sind INAKTIV (`E2E_LAST_ANZAHL`), und die Inventur liest
 * nur aktive Artikel — hier stehen also nie 150 Zeilen, und eine Zusicherung
 * darauf wäre mühelos grün. Die Wirkung der Virtualisierung besitzt
 * `lagerbuch-artikel-mobil.spec.ts`, die Entscheidung darüber
 * `core/tabelle/masse.test.ts`; beide gelten für denselben Codepfad.
 */

const KARTEN = '[data-rolle="schmalkarten"]';
const BREIT = '[data-rolle="breitansicht"]';
const SCHMALFILTER = '[data-rolle="schmalfilter"]';

async function inventurseite(page: Page): Promise<void> {
  const antwort = await page.goto(lagerbuchUrl("/verwaltung/inventur"));
  expect(antwort?.status(), "/verwaltung/inventur: HTTP").toBe(200);
  /*
   * ⚠️ EIN SEITENSPEZIFISCHES MERKMAL, BEVOR IRGENDETWAS GEMESSEN WIRD. Ohne
   * (oder mit falschem) `groups` bezeugt der Lauf sonst eine 404 — und eine 404
   * hat weder Karten noch eine Tabelle, besteht also stillschweigend jede
   * „ist unsichtbar"-Zusicherung (dieselbe Regel wie in
   * `lagerbuch-artikel-mobil.spec.ts`).
   */
  await expect(page.getByRole("button", { name: /^Inventur abschließen/ })).toBeVisible();
  // Die Umschaltung ist reines CSS und steht sofort; die Kartenliste entsteht
  // aber erst mit der Hydration der Insel.
  await page.waitForLoadState("networkidle");
}

test.describe("Inventur auf dem Telefon (DRK-421)", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("bei 390px zählt man in Karten, und der Stepper steht im Bild", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await inventurseite(page);

    await expect(page.locator(KARTEN)).toBeVisible();
    await expect(page.locator(BREIT)).toBeHidden();
    // Ohne Spaltenköpfe gäbe es hier sonst gar keinen Filter (DRK-333 hatte ihn
    // dorthin verlegt) — eine Zählung mit hunderten Artikeln wäre auf 390px
    // nicht durchsuchbar.
    await expect(page.locator(SCHMALFILTER)).toBeVisible();

    /*
     * ⚠️ DAS IST DIE GEMELDETE SACHE, UND SIE WIRD ALS ZAHL GEPRÜFT.
     * Vorher stand der Stepper in der achten von acht Spalten: die Tabelle war
     * 358px breit und 1156px lang zu scrollen, das erste Ist-Feld lag bei
     * x = 1030…1096 — also 672px rechts neben dem Schirm (gemessen, echter
     * Chromium, 612 Artikel). „Sichtbar" allein reichte als Zusicherung nicht:
     * ein Element in einem waagerecht gescrollten Kasten meldet sich als
     * sichtbar, auch wenn niemand es sieht.
     */
    const feld = page.locator(KARTEN).locator('input[aria-label^="Ist-Bestand"]').first();
    await expect(feld).toBeVisible();
    const kasten = await feld.boundingBox();
    expect(kasten, "Ist-Feld hat keinen Kasten").not.toBeNull();
    expect(kasten!.x, "Ist-Feld beginnt links vom Schirmrand").toBeGreaterThanOrEqual(0);
    expect(kasten!.x + kasten!.width, "Ist-Feld ragt rechts aus dem Schirm").toBeLessThanOrEqual(390);

    // Und es zählt auch wirklich: die Karte schreibt in denselben Zählstand wie
    // die Tabelle, der Abschlussknopf zählt die Abweichungen daraus.
    const vorher = await feld.inputValue();
    await page.locator(KARTEN).getByLabel(/^Ist-Bestand .* erhöhen$/).first().click();
    await expect(feld).toHaveValue(String(Number(vorher) + 1));
    await expect(page.getByRole("button", { name: /^Inventur abschließen \(1 Abweichung\)/ }))
      .toBeVisible();
  });

  test("bei 1280px steht die Tabelle, und die schmale Fassung ist weg", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await inventurseite(page);

    await expect(page.locator(BREIT)).toBeVisible();
    await expect(page.locator(KARTEN)).toBeHidden();
    /*
     * ⚠️ DIESE ZEILE IST DER EIGENTLICHE GRUND FÜR DEN 1280er-LAUF. Sie war
     * einmal rot, und zwar mit einer Regel, die richtig dastand: die Leiste hing
     * an einer antd-`Flex`, `.nurSchmal { display: none }` und
     * `.ant-flex { display: flex }` sind beide einklassig, und antd spritzt
     * seins zur Laufzeit ein — also danach (Falle 5).
     */
    await expect(page.locator(SCHMALFILTER)).toBeHidden();

    // Die Tabelle bleibt, was sie war: waagerecht scrollend, nicht umbrechend.
    await expect(page.locator(BREIT).getByRole("columnheader", { name: "Artikel" })).toBeVisible();
  });
});
