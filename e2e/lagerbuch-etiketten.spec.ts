import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * DER ETIKETTENBOGEN (Spec §8.4, §6.10.2, §6.1.3, §8.5).
 *
 * Zwei Aussagen dieser Datei werden sonst NIRGENDS geprueft:
 *   1. dass @media print WIRKT — build und Vitest sehen den Block gar nicht,
 *      Playwright rendert per Vorgabe fuer den Bildschirm, und der einzige
 *      heutige Test des Bestands (lagerbuch/e2e/etiketten.spec.ts:11) prueft
 *      das BILDSCHIRM-DOM.
 *   2. dass BEIDE Group-Layouts denselben Riegel tragen. Ein Quelltext-Scan
 *      sieht die Kopplung zwischen zwei Layouts nicht (F3, §6.1.3 Punkt 3).
 *
 * KEIN .first() und kein defensiver Uebersprung (Global Constraints): der
 * benoetigte Zustand wird im Test selbst hergestellt, `.nth(0)` statt
 * `.first()` greift dabei stets auf ein Element, dessen Zustand im selben
 * Test gesetzt wurde.
 *
 * Host, Admin-Gruppe und URLs kommen ausschliesslich aus
 * `e2e/helpers/lagerbuch.ts` (Festlegung H9, Ruling A9) — kein Literal wie
 * "http://lagerbuch.localtest.me:3100" oder `["lagerbuch_nutzer"]`.
 */
test.describe("Etikettenbogen", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("zeigt Kacheln mit eingesetztem SVG, nicht mit <img>", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/etiketten"));
    const qrSvgs = page.locator(".lb-etikettQr > svg");
    const n = await qrSvgs.count();
    expect(n, "der Seed muss mindestens ein Etikett mit QR liefern").toBeGreaterThan(0);
    await expect(qrSvgs.nth(0)).toBeVisible();
    // Der alte Anker ist tot und soll es bleiben (§12.1, Punkt 7).
    await expect(page.locator(".lb-etikett img")).toHaveCount(0);
  });

  /**
   * §8.1, 8-B, Fehlerzustand 2: die Zeile ueber dem Bogen ist der EINZIGE Weg,
   * eine Umsortierung von SUITE_HOST_LAGERBUCH vor dem Papier zu bemerken.
   */
  test("schreibt den verwendeten Host ueber den Bogen", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/etiketten"));
    // Der volle Host, nicht nur das Praefix "http": ein "Alle QR-Codes zeigen
    // auf http" bestuende auch bei einem FALSCHEN Host (genau der Fehlerzustand
    // aus §8.1, 8-B, fuer den dieser Test existiert).
    await expect(page.getByTestId("lb-basis")).toContainText(
      `Alle QR-Codes zeigen auf http://${LAGERBUCH_HOST}`,
    );
  });

  test("waehlt zu Beginn alles aus und schaltet ueber Keine ab", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/etiketten"));
    const kacheln = page.locator(".lb-etikett");
    const n = await kacheln.count();
    expect(n, "der Seed muss mindestens zwei Etiketten liefern").toBeGreaterThan(1);
    await expect(page.getByTestId("lb-drucken")).toContainText(`(${n})`);
    await page.getByTestId("lb-keine").click();
    await expect(page.getByTestId("lb-drucken")).toContainText("(0)");
  });

  /**
   * DIE DREI DRUCK-ZUSAGEN AUS §6.10.2. `emulateMedia` ist der einzige Weg, an
   * dem der @media print-Block ueberhaupt sichtbar wird.
   */
  test("blendet im Druck Kaestchen, abgewaehlte Kachel und Suite-Kopfzeile aus", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/etiketten"));

    // Eigene Vorbedingung, nicht von Test 3 geborgt (verbotene
    // Reihenfolgekopplung): der Kaestchen-Nachweis unten braucht eine ZWEITE,
    // weiterhin GEWAEHLTE Kachel neben der abgewaehlten.
    const n = await page.locator(".lb-etikett").count();
    expect(n, "der Druck-Test braucht mindestens zwei Kacheln").toBeGreaterThan(1);

    // Genau eine Kachel abwaehlen — der Zustand wird im Test hergestellt.
    const ersteWahl = page.locator(".lb-etikettWahl").nth(0);
    await ersteWahl.uncheck();
    const abgewaehlt = page.locator(".lb-etikettAbgewaehlt").nth(0);
    await expect(abgewaehlt).toBeVisible(); // am Bildschirm blass, aber da

    await page.emulateMedia({ media: "print" });

    await expect(abgewaehlt).toBeHidden(); // display:none, nicht opacity
    /**
     * ⚠️ NICHT nth(0) hier: dessen Label traegt bereits lb-etikettAbgewaehlt
     * (display:none seit der Zeile oben), also waere JEDES Kind darunter durch
     * den versteckten VORFAHREN hidden — auch wenn lb-nichtDrucken vom Input
     * selbst verschwaende. Der Nachweis braucht ein Kaestchen auf einer
     * weiterhin SICHTBAREN Kachel, sonst ist er maskiert und ein No-op.
     */
    await expect(page.locator(".lb-etikettWahl").nth(1)).toBeHidden();
    await expect(page.getByTestId("lb-drucken")).toBeHidden();
    /*
     * ⚠️ `toBeHidden`, NICHT `toHaveCount(0)` — seit DRK-406 ist das ein
     * Unterschied und nicht Geschmack. Bis dahin trug der Druckast gar keine
     * Kopfzeile; jetzt steht sie am BILDSCHIRM da (der Druckast war sonst eine
     * Sackgasse ohne Navigation) und faellt im Druck ueber `display: none`
     * weg. Die Zusage der Entscheidung 8-H gilt unveraendert weiter — auf dem
     * PAPIER keine Kopfzeile —, nur beweist man sie jetzt an der Sichtbarkeit
     * statt an der Abwesenheit.
     *
     * Die Zeile darueber haelt den No-op fern, vor dem die naechste
     * Zusicherung warnt: ohne Anker waere sie wahr und wertlos.
     */
    await expect(page.getByTestId("suite-header")).toHaveCount(1);
    await expect(page.getByTestId("suite-header")).toBeHidden();

    await page.emulateMedia({ media: "screen" });
    await expect(page.getByTestId("suite-header")).toBeVisible();
  });

  /**
   * DIE KONTROLLE ZUR VORIGEN ZEILE, und ohne sie waere jene ein NO-OP —
   * seit DRK-406 an einer anderen Stelle, aber aus demselben Grund.
   *
   * ⚠️ FRUEHER STAND HIER „auf dem Druckast gibt es die Kopfzeile nicht",
   * gemessen an `toHaveCount(0)`. Das ist ueberholt: der Druckast traegt sie
   * jetzt am Bildschirm, damit er keine Sackgasse ohne Navigation mehr ist.
   * Die Trennlinie laeuft seither nicht zwischen den SEITEN, sondern zwischen
   * den MEDIEN — und genau die misst dieser Test, auf beiden Seiten
   * nacheinander. Ohne ihn liesse sich die Zusicherung oben durch eine
   * Druckregel erfuellen, die die Kopfzeile ueberall abschaltet.
   */
  test("dieselbe Kopfzeile faellt nur auf dem Druckast weg, und nur im Druck", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/artikel"));
    await expect(page.getByTestId("suite-header")).toBeVisible();
    await page.emulateMedia({ media: "print" });
    await expect(page.getByTestId("suite-header"), "Arbeitsseite: auch auf Papier")
      .toBeVisible();

    await page.emulateMedia({ media: "screen" });
    await page.goto(lagerbuchUrl("/verwaltung/etiketten"));
    await expect(page.getByTestId("suite-header"), "Druckast: am Bildschirm da")
      .toBeVisible();
    await page.emulateMedia({ media: "print" });
    await expect(page.getByTestId("suite-header"), "Druckast: auf Papier weg")
      .toBeHidden();

    await page.emulateMedia({ media: "screen" });
  });

  /**
   * EIN BLATT PAPIER HAT KEINEN DUNKELMODUS. Der Bogen ist hart #fff/#000, und
   * print-color-adjust:exact verbietet dem Browser jede Notrechnung — ohne die
   * Festlegung kaeme weisse Schrift auf weissem Papier heraus, und gedruckt
   * waere nur der QR-Kasten sichtbar (§6.10.2, Punkt 2).
   */
  test("bleibt im Dunkelmodus weiss", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/etiketten"));
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    const bogen = page.locator(".lb-etikettbogen");
    await expect(bogen).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(bogen).toHaveCSS("color", "rgb(0, 0, 0)");
  });

  /**
   * DIE EINZIGE ZUSICHERUNG, DIE DIE KOPPLUNG ZWISCHEN DEN ZWEI GROUP-LAYOUTS
   * PRUEFT (F3, §6.1.3 Punkt 3, §12.4). Faellt requireLagerbuchAdmin aus
   * (druck)/layout.tsx, sind die gedruckten Zugangs-Codes IM KLARTEXT
   * oeffentlich — und ein Quelltext-Scan sieht das nicht.
   *
   * Bewusst 404 und nicht 403: „ein 403 verriete, dass es die Admin-Route gibt"
   * (core/auth/guards.ts:15-17). Fuer eine Verwaltung mit Journal, Klarnamen und
   * Etiketten voller Klartext-Codes ist das keine Formalie.
   */
  test("antwortet ohne Lagerbuch-Gruppe genau wie eine Arbeitsseite", async ({ page }) => {
    // Die beforeEach-Sitzung ist bereits angemeldet (Admin-Gruppe); ohne
    // clearCookies laeuft die zweite devLogin-Anmeldung nicht ein zweites Mal
    // durchs Formular, weil /login einen angemeldeten Nutzer sofort auf "/"
    // umleitet (src/app/login/page.tsx: `if (session?.user) redirect("/")`) —
    // dasselbe Muster in feedback.spec.ts, Faelle „IDOR-Guard: groupleader ohne
    // Zuordnung …" und „Gruppenleiter: der Einstieg landet …", sowie in
    // files-fileshare.spec.ts, Fall „5 — entsperrt laedt der Download …".
    await page.context().clearCookies();
    await devLogin(page, { host: LAGERBUCH_HOST, groups: "" }); // angemeldet, aber ohne Gruppe

    const etiketten = await page.goto(lagerbuchUrl("/verwaltung/etiketten"));
    const artikel = await page.goto(lagerbuchUrl("/verwaltung/artikel"));

    expect(etiketten!.status()).toBe(404);
    expect(etiketten!.status()).toBe(artikel!.status());

    // Und der Inhalt ist die Suite-404, nicht der Bogen: kein Code im Klartext.
    await page.goto(lagerbuchUrl("/verwaltung/etiketten"));
    await expect(page.locator(".lb-etikett")).toHaveCount(0);
    await expect(page.getByText(/Diese Seite gibt es hier nicht/)).toBeVisible();
  });

  test("antwortet auch ohne jede Sitzung nicht mit dem Bogen", async ({ browser }) => {
    const anonym = await browser.newContext();
    const seite = await anonym.newPage();
    // `page.goto()` folgt dem 307 automatisch und liefert den Status der
    // ZIELseite (200 auf /login), nicht des Zwischenschritts — empirisch
    // geprueft, nicht angenommen. Die tragende Zusicherung ist deshalb die
    // URL nach der Umleitung, nicht ein roher Statuscode. Nie mit dem Bogen.
    await seite.goto(lagerbuchUrl("/verwaltung/etiketten"));
    await expect(seite).toHaveURL(/\/login/);
    await expect(seite.locator(".lb-etikett")).toHaveCount(0);
    await anonym.close();
  });
});
