import { expect, test, type Page } from "@playwright/test";
import { devLogin } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";
import { RADIO_ADMIN_GRUPPE, RADIO_HOST, radioUrl } from "./helpers/radio";
import { UAV_ADMIN_GRUPPE, UAV_HOST, uavUrl } from "./helpers/uav";

/*
 * DIE SCHUBLADEN-BREITE — hier und nirgends sonst pruefbar (DRK-296).
 *
 * ⚠️ WARUM DIESE DATEI KEIN VITEST-TEST IST. Die Zusage lautet „die
 * Schublade passt ins Fenster und ist breit genug fuer ihren Inhalt", und
 * jede Haelfte davon ist eine LAYOUTBOX. jsdom rechnet keine — dort liefert
 * `getBoundingClientRect()` ueberall Nullen, `min()` und `vw` wertet es gar
 * nicht aus, und `scrollHeight` ist 0. Ein Vitest-Test koennte hier nur
 * behaupten, welche Zeichenkette an `size` steht; ob der Browser sie
 * ueberhaupt annimmt, entscheiden ZWEI FREMDPAKETE hintereinander
 * (`antd/es/drawer/Drawer.js:93-98`, dann
 * `@rc-component/drawer/es/util.js:3-14`), und beide lesen eine
 * Zeichenkette als Zahl, sobald sie wie eine aussieht. Dieselbe Klasse wie
 * Falle 8 in `docs/design/README.md`: die Zahl kennt nur ein echter Browser.
 *
 * DER AUSFALL, DEN DIESE DATEI FESTHAELT (gemessen 13.09.2026, echter
 * Chromium, vor der Abhilfe):
 *
 *   Artikeldetails, `size={520}` als nackte Zahl
 *     bei 480 px Fensterbreite: linke Kante -26 px, Schliessen-Knopf -2 px
 *                               (antds `max-width: 100vw` griff, war dort
 *                               aber 506 px breit — die Seite lief ueber)
 *     bei 1280x720:             Inhalt 1862 px hoch auf 663 px Sichtflaeche,
 *                               daneben 760 px ungenutzter Hintergrund
 *
 * Host, Gruppe und URLs kommen aus `e2e/helpers/*` (Festlegung H9) — kein
 * zweites Literal.
 */

/** Die Breiten, ueber die jede Schublade gefuehrt wird: vom grossen
 *  Schreibtisch bis unter ihre eigene Wunschbreite. */
const BREITEN = [1440, 1280, 1024, 800, 640, 480] as const;

/**
 * Misst die offene Schublade rechts. `null`, wenn keine offen ist — der
 * Aufrufer soll daran scheitern und nicht still eine leere Messung bestehen.
 */
async function vermesseSchublade(page: Page) {
  return page.evaluate(() => {
    const rahmen = document.querySelector<HTMLElement>(
      ".ant-drawer-right .ant-drawer-content-wrapper",
    );
    const schliessen = document.querySelector<HTMLElement>(
      ".ant-drawer-right .ant-drawer-close",
    );
    const inhalt = document.querySelector<HTMLElement>(".ant-drawer-right .ant-drawer-body");
    if (!rahmen || !schliessen || !inhalt) return null;
    const r = rahmen.getBoundingClientRect();
    return {
      fenster: window.innerWidth,
      linkeKante: Math.round(r.left),
      breite: Math.round(r.width),
      schliessenLinks: Math.round(schliessen.getBoundingClientRect().left),
      inhaltHoehe: inhalt.scrollHeight,
      sichtHoehe: inhalt.clientHeight,
    };
  });
}

/**
 * DIE ZUSAGE, DIE FUER JEDE SCHUBLADE GILT: nichts waechst aus dem Bild.
 *
 * Geprueft wird die linke Kante UND der Schliessen-Knopf einzeln. Nur die
 * Kante zu pruefen reichte nicht: sie ist die aeussere Huelle, der Knopf
 * sitzt mit Innenabstand darin — ein Rahmen, der bei -2 px beginnt, sieht
 * fast richtig aus und hat den Knopf trotzdem schon verloren.
 */
async function erwarteImBild(page: Page, breiten: readonly number[]) {
  for (const breite of breiten) {
    await page.setViewportSize({ width: breite, height: 720 });
    // Der Browser wertet `min()` beim Umbau neu aus; ein Bild reicht dafuer.
    await page.waitForTimeout(200);
    const mass = await vermesseSchublade(page);
    expect(mass, `keine offene Schublade bei ${breite} px`).not.toBeNull();
    expect(mass!.linkeKante, `linke Kante bei ${breite} px`).toBeGreaterThanOrEqual(0);
    expect(mass!.schliessenLinks, `Schliessen-Knopf bei ${breite} px`).toBeGreaterThan(0);
    expect(mass!.breite, `Breite bei ${breite} px`).toBeLessThanOrEqual(breite);
  }
}

test("Artikeldetails: passt ins Fenster und nutzt den Platz, der da ist", async ({ page }) => {
  await devLogin(page, {
    host: LAGERBUCH_HOST,
    groups: LAGERBUCH_ADMIN_GRUPPE,
    callbackPath: "/verwaltung",
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(lagerbuchUrl("/verwaltung/artikel"));
  await page.waitForLoadState("networkidle");
  /*
   * ⚠️ `[data-row-key]` UND NICHT `tbody tr` (DRK-334). Eine virtualisierte
   * rc-table hat KEIN `tbody` und KEINE `tr`: sie rendert ihre Zeilen als
   * `div`s (`@rc-component/table@1.11.1`, `VirtualTable/BodyLine.js:40` —
   * `getComponent(['body','row'], 'div')`), und die tragen auch kein
   * `role="row"`. Seit der E2E-Seed 200 Lastartikel traegt, virtualisiert die
   * Artikeltabelle tatsaechlich, und ein `tbody tr`-Greifer findet schlicht
   * nichts mehr. `data-row-key` setzt rc-table in BEIDEN Betriebsarten.
   */
  await page.getByLabel("Artikel und Bestand").locator("[data-row-key]").first().click();
  await expect(page.locator(".ant-drawer-right .ant-drawer-content-wrapper")).toBeVisible();

  /*
   * DIE FACHLICHE ZUSAGE AUS DRK-296, und sie steht bewusst VOR der
   * Geometrie: auf einem 1280x720-Schirm — dem kleinen Dienst-Notebook —
   * muss die zweite Buchungsaktion zu sehen sein, OHNE zu scrollen. Vorher
   * lag „Entnahme buchen" rund 1 000 px unterhalb der Sichtkante.
   *
   * ⛔ `toBeInViewport` und NICHT `toBeVisible`: `toBeVisible` ist auch fuer
   * ein Element wahr, das im Rollbereich der Schublade weit unterhalb der
   * Sichtkante haengt — es bestaende also genau in dem Zustand, den dieser
   * Test ausschliessen soll.
   */
  await expect(
    page.getByRole("button", { name: "Entnahme buchen" }),
  ).toBeInViewport();

  const weit = await vermesseSchublade(page);
  expect(weit).not.toBeNull();
  /*
   * 520 war die alte feste Breite. Die Grenze steht als „deutlich mehr als
   * vorher" und nicht als exakte 880, damit eine spaetere Feinjustierung der
   * Wunschbreite diesen Test nicht rot macht — rot werden soll er beim
   * RUECKFALL auf eine feste, schmale Zahl.
   */
  expect(weit!.breite).toBeGreaterThan(520);
  // Und der Hintergrund bleibt sichtbar: eine Schublade ist kein Vollbild.
  expect(weit!.breite).toBeLessThan(1280);

  await erwarteImBild(page, BREITEN);
});

test("uav-Katalog: die Aufgaben-Schublade passt ins Fenster", async ({ page }) => {
  await devLogin(page, {
    host: UAV_HOST,
    groups: UAV_ADMIN_GRUPPE,
    callbackPath: "/admin/katalog",
  });
  await page.goto(uavUrl("/admin/katalog"));
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Aufgabe anlegen" }).first().click();
  await expect(page.locator(".ant-drawer-right .ant-drawer-content-wrapper")).toBeVisible();

  await erwarteImBild(page, BREITEN);
});

/*
 * ⚠️ DIESE SCHUBLADE TRAEGT `flyinBreite` NICHT — und der Fall steht trotzdem
 * hier, weil genau das die Aussage ist.
 *
 * Gemessen (13.09.2026) kappt sie sich mit ihren 360 px von allein: bei
 * 320 px Fensterbreite misst sie 320 und der Schliessen-Knopf steht bei
 * +24 px. Sie hat den Mangel aus DRK-296 also nicht, und das Modul `radio`
 * verbietet `size=` auf JEDER seiner `.tsx`
 * (`_ui/AusleihRahmen.test.tsx`, Falle 4) — eine Ausnahme dort waere ein
 * Loch fuer einen Defekt, den es hier nicht gibt.
 *
 * Der Fall bewacht deshalb die BEOBACHTUNG, nicht die Abhilfe: kippt das
 * Kappverhalten mit einem antd-Sprung, wird er rot, und dann ist die
 * Ausnahme belegt statt behauptet.
 */
test("radio-Filter: passt ins Fenster auch ohne eigenen Deckel", async ({ page }) => {
  await devLogin(page, {
    host: RADIO_HOST,
    groups: RADIO_ADMIN_GRUPPE,
    callbackPath: "/admin/geraete",
  });
  await page.goto(radioUrl("/admin/geraete"));
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Filter/ }).first().click();
  await expect(page.locator(".ant-drawer-right .ant-drawer-content-wrapper")).toBeVisible();

  await erwarteImBild(page, BREITEN);
});
