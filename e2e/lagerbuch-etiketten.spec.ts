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
    await expect(page.getByTestId("suite-header")).toHaveCount(0);

    await page.emulateMedia({ media: "screen" });
  });

  /**
   * DIE KONTROLLE ZUR VORIGEN ZEILE, und ohne sie waere jene ein NO-OP.
   * `expect(getByTestId("suite-header")).toHaveCount(0)` geht auch dann durch,
   * wenn es den Anker gar nicht gibt — dieselbe Bauform wie ein defensiver
   * Uebersprung, nur im anderen Kostuem. Ein No-op ist hier SCHLIMMER als
   * keine Zusicherung, weil er abgehakt wird.
   *
   * Der Anker existiert: core/shell/SuiteHeader.tsx:65 setzt
   * data-testid="suite-header" am <Header>. Auf einer Arbeitsseite ist er da,
   * auf dem Druckast nicht — DAS ist die Aussage von Entscheidung 8-H.
   */
  test("dieselbe Kopfzeile ist auf einer Arbeitsseite sehr wohl da", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/artikel"));
    await expect(page.getByTestId("suite-header")).toHaveCount(1);
    await page.goto(lagerbuchUrl("/verwaltung/etiketten"));
    await expect(page.getByTestId("suite-header")).toHaveCount(0);
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
    // dasselbe Muster wie feedback.spec.ts:522/747 und files-fileshare.spec.ts:499.
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
