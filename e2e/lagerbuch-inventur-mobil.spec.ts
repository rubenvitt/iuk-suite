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

/**
 * Ans Ende der Seite — WIEDERHOLT, bis es dort bleibt. Die Karten tragen
 * `content-visibility: auto` mit geschaetzter Hoehe (`schmalkarten.module.css`):
 * ein einzelnes `scrollTo` landet am geschaetzten Ende, die Karten dort messen
 * sich danach aus, und die Seite ist wieder laenger als der Sprung.
 */
async function ansEnde(page: Page): Promise<void> {
  let vorher = -1;
  for (let versuch = 0; versuch < 20; versuch += 1) {
    const jetzt = await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      return window.scrollY;
    });
    if (jetzt === vorher) return;
    vorher = jetzt;
    await page.waitForTimeout(100);
  }
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
    // Seit IDA-237 steht die Zahl in der Fortschrittsangabe der festen Leiste.
    await expect(page.locator('[data-rolle="fortschritt"]')).toContainText("1 Abweichung");
  });

  /*
   * IDA-237 — DIE ABSCHLUSSLEISTE BLEIBT IM BILD, und sie verdeckt nichts.
   *
   * ⚠️ BEIDE HAELFTEN ZAEHLEN. „Im Bild" allein bestuende auch eine `fixed`-
   * Leiste, die die letzte Karte zudeckt; „verdeckt nichts" allein bestuende
   * die alte Leiste am Ende der Liste. Gemessen wird oben, nach einem Sprung
   * ans Ende, und dort am Abstand zur letzten Karte.
   */
  test("bei 390px steht die Abschlussleiste von jeder Scrollposition aus im Bild", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await inventurseite(page);

    const leiste = page.locator('[data-rolle="abschlussleiste"]');
    const imBild = async (): Promise<void> => {
      const kasten = await leiste.boundingBox();
      expect(kasten, "Abschlussleiste hat keinen Kasten").not.toBeNull();
      expect(kasten!.y, "Leiste beginnt über dem Schirm").toBeGreaterThanOrEqual(0);
      expect(kasten!.y + kasten!.height, "Leiste ragt unter den Schirm").toBeLessThanOrEqual(844 + 1);
    };
    await imBild();
    await expect(page.getByLabel("Kommentar", { exact: true })).toBeInViewport();
    await expect(page.locator("button[data-rolle='abschluss']")).toBeInViewport();

    await ansEnde(page);
    await imBild();
    const letzte = await page.locator(KARTEN).locator("article").last().boundingBox();
    const unten = await leiste.boundingBox();
    expect(letzte!.y + letzte!.height, "die Leiste deckt die letzte Karte zu").toBeLessThanOrEqual(unten!.y + 1);
  });

  /*
   * IDA-237 — SUCHE, ENTER, „STIMMT", IN BEIDEN DARSTELLUNGEN.
   *
   * ⚠️ WAS JSDOM HIER NICHT SIEHT: welches der beiden Zaehlfelder Enter
   * fokussiert. Jede Zeile steht zweimal im DOM (Karte und Tabelle), und nur
   * der Browser weiss, welche die Media Query zeigt (`checkVisibility`). Der
   * Rollen-Greifer loest nur das sichtbare auf — `toBeFocused` daran beweist
   * also, dass der Sprung im richtigen Feld landet.
   */
  for (const [breite, hoehe] of [[390, 844], [1280, 720]] as const) {
    test(`bei ${breite}px springt Enter ins Zählfeld, und „Stimmt“ zählt ohne die Zahl zu ändern`, async ({ page }) => {
      await page.setViewportSize({ width: breite, height: hoehe });
      await inventurseite(page);

      const suche = page.getByRole("searchbox", { name: "Artikel oder Fach suchen…" });
      await suche.fill("Verbandpäckchen");
      await suche.press("Enter");
      const feld = page.getByRole("spinbutton", { name: "Ist-Bestand E2E Verbandpäckchen", exact: true });
      await expect(feld).toBeFocused();
      const vorher = await feld.inputValue();

      const fortschritt = page.locator('[data-rolle="fortschritt"]');
      const stimmt = page.getByRole("button", { name: "Ist-Bestand E2E Verbandpäckchen stimmt", exact: true });
      await stimmt.click();
      await expect(stimmt).toHaveAttribute("aria-pressed", "true");
      await expect(feld).toHaveValue(vorher);
      await expect(fortschritt).toContainText(/^1 von \d+ erfasst · 0 Abweichungen$/);
      // Und zurück: ein Fehltipp lässt sich aufheben.
      await stimmt.click();
      await expect(fortschritt).toContainText(/^0 von \d+ erfasst/);
    });
  }

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

    // IDA-237 — die Leiste steht auch hier im Bild, und am Ende der Seite
    // liegt die letzte Tabellenzeile ÜBER ihr, nicht unter ihr (Falle 16).
    const leiste = page.locator('[data-rolle="abschlussleiste"]');
    await expect(leiste).toBeInViewport({ ratio: 1 });
    await ansEnde(page);
    await expect(leiste).toBeInViewport({ ratio: 1 });
    const letzte = await page.locator(BREIT).locator("tbody tr[data-row-key]").last().boundingBox();
    const kasten = await leiste.boundingBox();
    expect(letzte!.y + letzte!.height, "die Leiste deckt die letzte Zeile zu").toBeLessThanOrEqual(kasten!.y + 1);
  });
});
