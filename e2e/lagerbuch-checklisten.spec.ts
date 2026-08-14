import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * DIE FAHRZEUG-CHECKLISTEN ZUM AUSDRUCKEN (`/verwaltung/checklisten`).
 *
 * ⚠️ WARUM DIESE DATEI DER EINZIGE ECHTE NACHWEIS IST. Vier Aussagen ueber
 * diese Seite kann KEIN anderes Tor dieses Repos halten:
 *
 *  1. DASS DIE SEITE UEBERHAUPT ANTWORTET. `page.tsx` ist eine Server
 *     Component; ein antd-Compound-Zugriff (Falle 1) oder ein
 *     `@ant-design/icons`-Import (Falle 7) ergaebe HTTP 500 — bei Falle 7
 *     schon beim IMPORT, nicht beim Rendern —, waehrend `pnpm typecheck`,
 *     `pnpm build` und Vitest alle drei gruen bleiben. Vitest kann es
 *     STRUKTURELL nicht sehen: dort laedt `react` ueber die
 *     `default`-Bedingung, und die Zeichen rendern klaglos.
 *  2. DASS `@media print` WIRKT. `build` und Vitest sehen den Block gar nicht,
 *     Playwright rendert per Vorgabe fuer den Bildschirm. `emulateMedia` ist
 *     der einzige Weg, an dem er ueberhaupt sichtbar wird.
 *  3. DASS BEIDE GROUP-LAYOUTS DENSELBEN RIEGEL TRAGEN. Ein Quelltext-Scan
 *     sieht die Kopplung zwischen zwei Layouts nicht (F3, §6.1.3 Punkt 3).
 *  4. DASS DAS BLATT IM DUNKELMODUS WEISS BLEIBT. `.modul` kippt seinen
 *     `--lb-*`-Satz ueber `data-theme`; ein Blatt, das daran haengt, druckte
 *     helle Schrift auf weisses Papier — und `print-color-adjust: exact`
 *     verbietet dem Browser jede Notrechnung.
 *
 * Host, Admin-Gruppe und URLs kommen ausschliesslich aus
 * `e2e/helpers/lagerbuch.ts` (Festlegung H9, Ruling A9) — kein Literal.
 *
 * Der Seed liefert ZWEI Fahrzeuge (`e2e-fahrzeug` „E2E RTW" mit Soll und
 * Sauerstoffflasche, `e2e-geraete-fahrzeug` „E2E Geräte RTW" mit Soll und
 * Geraet). Beide sind aktiv; die Tests unten rechnen mit genau dieser Lage und
 * stellen jeden weiteren Zustand selbst her.
 */
test.describe("Fahrzeug-Checklisten", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("rendert ohne Auswahl ein Blatt je aktivem Fahrzeug", async ({ page }) => {
    const antwort = await page.goto(lagerbuchUrl("/verwaltung/checklisten"));
    // Die eine Zeile, die Falle 1 und Falle 7 ueberhaupt sichtbar macht.
    expect(antwort!.status(), "HTTP 500 = antd oder Zeichen in der Server Component")
      .toBe(200);

    const blaetter = page.locator(".lb-cl-blatt");
    const n = await blaetter.count();
    expect(n, "der Seed muss mindestens zwei aktive Fahrzeuge liefern")
      .toBeGreaterThan(1);
    await expect(blaetter.nth(0)).toBeVisible();
    await expect(page.getByTestId("lb-cl-zahl")).toContainText(`${n} Fahrzeuge`);
  });

  test("schraenkt ueber ?fz= auf genau ein Fahrzeug ein", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/checklisten?fz=e2e-fahrzeug"));
    await expect(page.locator(".lb-cl-blatt")).toHaveCount(1);
    await expect(page.locator(".lb-cl-blatt")).toContainText("E2E RTW");
  });

  /**
   * ⚠️ EIN LEERES `?fz=` IST DASSELBE WIE GAR KEINS. Ohne die Trimm-Zeile in
   * `page.tsx` suchte `checklistenDaten` nach einem Fahrzeug mit der ID `""`,
   * faende keins und lieferte einen leeren Bogen — eine leere Seite, die wie
   * ein Datenverlust aussieht und keiner ist.
   */
  test("behandelt ein leeres ?fz= wie gar keine Auswahl", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/checklisten?fz="));
    expect(await page.locator(".lb-cl-blatt").count()).toBeGreaterThan(1);
  });

  test("nennt eine ins Leere zeigende Auswahl beim Namen — mit Weg zurueck", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/checklisten?fz=gibtsnicht"));
    await expect(page.locator(".lb-cl-blatt")).toHaveCount(0);
    await expect(page.getByText(/gelöschtes Fahrzeug/)).toBeVisible();
    // §11.7: `DruckRahmen` traegt konstruktionsbedingt keine Navigation.
    await expect(page.locator("a[href='/verwaltung/fahrzeuge']")).toBeVisible();
  });

  test("traegt Kopf, Unterschriftszeile und die drei Abschnitte", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/checklisten?fz=e2e-fahrzeug"));
    const blatt = page.locator(".lb-cl-blatt");
    await expect(blatt.locator(".lb-cl-titel")).toHaveText("E2E RTW");
    await expect(blatt).toContainText("MS-E2E-1");
    await expect(blatt.locator(".lb-cl-signatur .lb-cl-linie")).toHaveCount(3);
    await expect(blatt.locator(".lb-cl-abschnitt")).toContainText(["Bestückung", "Sauerstoff"]);
  });

  /**
   * DIE DRUCK-ZUSAGEN. `emulateMedia` ist der einzige Weg, an dem der
   * `@media print`-Block ueberhaupt sichtbar wird.
   */
  test("blendet im Druck die Bedienleiste aus und behaelt das Blatt", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/checklisten"));
    const leiste = page.getByTestId("lb-cl-leiste");
    await expect(leiste).toBeVisible();

    await page.emulateMedia({ media: "print" });

    await expect(leiste).toBeHidden();
    await expect(page.locator(".lb-cl-blatt").nth(0)).toBeVisible();
    // Ohne Suite-Shell: sonst druckten Kopfzeile und App-Umschalter mit, und
    // `minHeight: 100vh` erzeugte hinter jedem Blatt eine leere Folgeseite.
    await expect(page.getByTestId("suite-header")).toHaveCount(0);

    await page.emulateMedia({ media: "screen" });
  });

  /**
   * DIE KONTROLLE ZUR VORIGEN ZEILE, und ohne sie waere jene ein NO-OP:
   * `toHaveCount(0)` geht auch dann durch, wenn es den Anker gar nicht gibt.
   * Der Anker existiert — `core/shell/SuiteHeader.tsx` setzt ihn am `<Header>`.
   */
  test("dieselbe Kopfzeile ist auf einer Arbeitsseite sehr wohl da", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/fahrzeuge"));
    await expect(page.getByTestId("suite-header")).toHaveCount(1);
    await page.goto(lagerbuchUrl("/verwaltung/checklisten"));
    await expect(page.getByTestId("suite-header")).toHaveCount(0);
  });

  /**
   * ⚠️ DER SEITENUMBRUCH ZWISCHEN ZWEI FAHRZEUGEN. Er haengt an
   * `.lb-cl-blatt + .lb-cl-blatt { break-before: page }` — und der
   * Geschwisterselektor `+` verlangt UNMITTELBARE Nachbarschaft. Am echten
   * Browser laesst sich der Umbruch selbst nicht messen; messbar ist, dass die
   * Regel das zweite Blatt UEBERHAUPT trifft. Faellt die Nachbarschaft weg,
   * ist `break-before` dort wieder `auto` und die Fahrzeuge laufen auf dem
   * Papier ineinander.
   */
  test("setzt den Seitenumbruch am zweiten Blatt, nicht am ersten", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/checklisten"));
    await page.emulateMedia({ media: "print" });

    const blaetter = page.locator(".lb-cl-blatt");
    expect(await blaetter.count(), "der Umbruchtest braucht zwei Blaetter")
      .toBeGreaterThan(1);
    await expect(blaetter.nth(0)).toHaveCSS("break-before", "auto");
    await expect(blaetter.nth(1)).toHaveCSS("break-before", "page");

    await page.emulateMedia({ media: "screen" });
  });

  /**
   * ⚠️ DIE A4-ATTRAPPE MUSS IM DRUCK FALLEN. 210mm IST die volle Blattbreite;
   * bliebe die Kappung stehen, waere die Bahn zusammen mit
   * `@page { margin: 8mm }` um 16mm breiter als der Satzspiegel, und Chrome
   * skalierte still auf rund 92 % herunter — jede Schriftgroesse des
   * Stylesheets stimmte dann nicht mehr.
   */
  test("hebt die A4-Attrappe im Druck auf", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/checklisten?fz=e2e-fahrzeug"));
    const blatt = page.locator(".lb-cl-blatt");
    await expect(blatt).not.toHaveCSS("max-width", "none");
    await page.emulateMedia({ media: "print" });
    await expect(blatt).toHaveCSS("max-width", "none");
    await page.emulateMedia({ media: "screen" });
  });

  /** EIN BLATT PAPIER HAT KEINEN DUNKELMODUS (Falle 2, §6.10.2 Punkt 2). */
  test("bleibt im Dunkelmodus weiss", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/checklisten?fz=e2e-fahrzeug"));
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    const blatt = page.locator(".lb-cl-blatt");
    await expect(blatt).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(blatt).toHaveCSS("color", "rgb(0, 0, 0)");
  });

  /**
   * DIE BLINDZAEHLUNG ENTFERNT DIE ZAHL, SIE VERDECKT SIE NICHT. Am echten
   * Browser ist das der Nachweis, dass die Zahl auch nicht ueber einen
   * Textlayer im PDF landet.
   */
  test("nimmt die Sollmenge bei Blindzaehlung aus dem Blatt", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/checklisten?fz=e2e-fahrzeug"));
    const sollSpalte = page.locator(".lb-cl-blatt tbody .lb-cl-sSoll");
    const vorher = await sollSpalte.nth(0).textContent();
    expect(vorher, "die Sollspalte muss vorher eine Zahl tragen").toMatch(/\d/);

    await page.getByTestId("lb-cl-blind").locator("input").check();

    await expect(sollSpalte.nth(0)).not.toHaveText(vorher!);
    await expect(sollSpalte.nth(0)).not.toContainText(/\d/);
    await expect(page.locator(".lb-cl-blatt thead .lb-cl-sSoll").nth(0))
      .toHaveText("Einheit");
  });

  test("verdichtet die Blaetter ueber den Kompakt-Schalter", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/checklisten?fz=e2e-fahrzeug"));
    const bogen = page.locator(".lb-cl-bogen");
    await expect(bogen).not.toHaveClass(/lb-cl-kompakt/);
    await page.getByTestId("lb-cl-kompakt").locator("input").check();
    await expect(bogen).toHaveClass(/lb-cl-kompakt/);
  });

  /**
   * ⚠️ `waitUntil: "commit"`, UND DAS IST DER GANZE PUNKT DIESER ZWEI FAELLE.
   *
   * `page.waitForURL` wartet in der Vorgabe bis `"load"` — also bis das
   * LADE-EREIGNIS der Zielseite gefeuert hat, nicht bis die Navigation
   * stattgefunden hat. Unter `next dev` ist das zweierlei: die Adresse steht
   * laengst richtig, waehrend die Seite noch Bundles, RSC-Nachzuegler und die
   * HMR-Verbindung offen hat. Genau das stand in der CI-Meldung, und ich habe
   * es zweimal falsch gelesen:
   *
   *     TimeoutError: page.waitForURL: Timeout 45000ms exceeded.
   *     waiting for navigation until "load"
   *
   * ⚠️ DIE ERSTE LESART WAR „ZU KNAPP BEMESSEN" — sie war falsch. Das Budget
   * von 5 s auf 45 s zu heben half NICHT, und das ist der Beleg: gewartet wurde
   * nie auf die Adresse, sondern auf `load`. Eine groessere Zahl vor derselben
   * Bedingung kauft nichts. Der Lauf wurde davon nur laenger (13 min statt 8).
   *
   * ⚠️ DIE ZWEITE LESART WAR „DER KNOPF NAVIGIERT NICHT" — auch falsch, aber
   * teuer: `toHaveURL` (Vorgabe 5 s) faellt mit „14 × unexpected value <alte
   * URL>", weil `page.url()` bis zum Commit die alte Adresse meldet. Das Bild
   * ist ununterscheidbar von einem kaputten Knopf und hat die Suche zuerst auf
   * `ChecklisteKnopf` gelenkt. Dort WAR ein echter Fehler (ein `<button>` im
   * `<a>`, behoben); er war nur nicht die Ursache DIESER Meldung.
   *
   * WAS HIER WIRKLICH ZU ZEIGEN IST: dass der Klick navigiert UND das Blatt
   * ankommt. Das erste sagt `"commit"`, das zweite die Zusicherung darunter,
   * die auf den Inhalt wartet. Auf `load` wartet niemand — kein Nachladen einer
   * Schrift entscheidet, ob dieser Weg funktioniert.
   *
   * Die STRUKTUR des Knopfes (ein Anker, kein Knopf darin, richtiges Ziel)
   * haengt nicht mehr an diesen zwei Faellen: sie steht deterministisch in
   * `verwaltung/(arbeit)/fahrzeuge/ChecklisteKnopf.test.tsx`.
   */
  const NAVIGATION = { timeout: 30_000, waitUntil: "commit" } as const;

  test("die Fahrzeugliste fuehrt auf den Bogen", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/fahrzeuge"));
    await page.getByRole("link", { name: "Checklisten drucken" }).click();
    await page.waitForURL(/\/verwaltung\/checklisten$/, NAVIGATION);
    await expect(page.locator(".lb-cl-blatt").nth(0)).toBeVisible();
  });

  test("das Fahrzeugblatt fuehrt auf genau sein eigenes Blatt", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/fahrzeuge/e2e-fahrzeug"));
    await page.getByRole("link", { name: "Checkliste drucken" }).click();
    await page.waitForURL(/\/verwaltung\/checklisten\?fz=e2e-fahrzeug$/, NAVIGATION);
    await expect(page.locator(".lb-cl-blatt")).toHaveCount(1);
  });

  /**
   * DIE EINZIGE ZUSICHERUNG, DIE DIE KOPPLUNG ZWISCHEN DEN ZWEI GROUP-LAYOUTS
   * PRUEFT (F3, §6.1.3 Punkt 3, §12.4). Faellt `requireLagerbuchAdmin` aus
   * `(druck)/layout.tsx`, liegt die komplette Soll-Bestueckung jeder Flotte
   * offen — und ein Quelltext-Scan sieht das nicht.
   *
   * Bewusst 404 und nicht 403: „ein 403 verriete, dass es die Admin-Route
   * gibt" (`core/auth/guards.ts`).
   */
  test("antwortet ohne Lagerbuch-Gruppe genau wie eine Arbeitsseite", async ({ page }) => {
    // Ohne clearCookies laeuft die zweite devLogin-Anmeldung nicht durchs
    // Formular: `/login` leitet einen angemeldeten Nutzer sofort auf "/" um.
    await page.context().clearCookies();
    await devLogin(page, { host: LAGERBUCH_HOST, groups: "" });

    const checklisten = await page.goto(lagerbuchUrl("/verwaltung/checklisten"));
    const fahrzeuge = await page.goto(lagerbuchUrl("/verwaltung/fahrzeuge"));

    expect(checklisten!.status()).toBe(404);
    expect(checklisten!.status()).toBe(fahrzeuge!.status());

    await page.goto(lagerbuchUrl("/verwaltung/checklisten"));
    await expect(page.locator(".lb-cl-blatt")).toHaveCount(0);
    await expect(page.getByText(/Diese Seite gibt es hier nicht/)).toBeVisible();
  });

  test("antwortet auch ohne jede Sitzung nicht mit dem Bogen", async ({ browser }) => {
    const anonym = await browser.newContext();
    const seite = await anonym.newPage();
    // `page.goto()` folgt dem 307 automatisch und liefert den Status der
    // ZIELseite (200 auf /login). Die tragende Zusicherung ist deshalb die URL
    // nach der Umleitung, nicht ein roher Statuscode.
    await seite.goto(lagerbuchUrl("/verwaltung/checklisten"));
    await expect(seite).toHaveURL(/\/login/);
    await expect(seite.locator(".lb-cl-blatt")).toHaveCount(0);
    await anonym.close();
  });
});
