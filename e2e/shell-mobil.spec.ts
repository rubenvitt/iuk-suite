import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";

/**
 * Der einzige Ort, der Media Queries wirklich auswertet. Was `shell-css.test.ts`
 * als Regel festhaelt ("die Klasse traegt die richtige Media Query"), belegt
 * dieser Lauf als Ergebnis ("man sieht es nicht").
 *
 * UND DER EINZIGE ORT, DER DIE KASKADE AUSWERTET. Das ist nicht dasselbe: die
 * Regel `.nurMobil { display: none }` ab 768px war vorhanden und matchte, verlor
 * aber gegen antds `.ant-btn { display: inline-flex }` — gleiche Spezifitaet
 * (0,1,0), antds Stylesheet spaeter im Dokument. Der Menue-Knopf stand bei
 * 1280px sichtbar in der Kopfzeile, und JEDER Test war gruen: der 390px-Lauf
 * kann es nicht sehen (dort ergeben beide Kandidaten "sichtbar"), und eine
 * Regeltext-Pruefung findet eine Kollision strukturell nicht. Deshalb steht
 * unten ein Desktop-Lauf.
 *
 * 390x844 ist das Mass, mit dem die feedback-Specs schon arbeiten.
 */
test.use({ viewport: { width: 390, height: 844 } });

test("mobil: Modulknoepfe stehen nicht im Kopf, das Menue oeffnet sie", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "alpha-users" });
  await expect(page.getByTestId("suite-header")).toBeVisible();
  // Die Knopfreihe ist im DOM, aber per CSS ausgeblendet — genau das ist der
  // Unterschied, den jsdom nicht sehen kann.
  await expect(page.getByTestId("modulzeile")).toBeHidden();

  await page.getByTestId("menue-knopf").click();
  await expect(page.getByTestId("suite-drawer").getByRole("link", { name: /Alpha/ })).toBeVisible();
});

test("mobil: die Kopfzeile bleibt einzeilig", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "alpha-users" });
  const kopf = page.getByTestId("suite-header");
  const hoehe = await kopf.evaluate((el) => el.getBoundingClientRect().height);
  console.log(`Kopfzeilenhoehe bei 390x844: ${hoehe}px`);
  // 64px ist `Layout.headerHeight`. Bricht die Leiste um, wird sie hoeher —
  // genau der Defekt, den der alte `overflow: hidden` kaschierte.
  expect(hoehe).toBeLessThanOrEqual(72);
});

test("mobil: der Drawer fuehrt in ein anderes Modul", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "alpha-users" });
  await page.getByTestId("menue-knopf").click();
  await page.getByTestId("suite-drawer").getByRole("link", { name: /Alpha/ }).click();
  await expect(page.getByTestId("alpha-content")).toBeVisible();
});

test("mobil: abmelden haengt am Nutzermenue, nicht mehr im Drawer", async ({ page }) => {
  // Der Nutzerblock ist aus dem Drawer ans Avatar-Menue gewandert, damit es ihn
  // auf BEIDEN Groeszen genau einmal gibt (siehe SuiteNav.tsx). Ein zweiter
  // Knoten mit derselben testId waere hier eine Strict-Mode-Verletzung — genau
  // das prueft die erste Zusicherung mit.
  await devLogin(page, { host: "portal.localtest.me", groups: "" });
  await page.getByTestId("menue-knopf").click();
  await expect(page.getByTestId("suite-drawer")).toBeVisible();
  await expect(page.getByTestId("suite-drawer").getByTestId("abmelden")).toHaveCount(0);

  /*
   * Erst schlieszen, DANN das Nutzermenue. Und zwar mit einer Zusicherung
   * dazwischen, nicht bloss mit einem `press`: der Drawer hat eine Maske, und
   * eine noch ausblendende Maske faengt Klicks weiterhin ab. Ohne das Warten
   * haengt der Test daran, dass die Animation schneller fertig ist als der
   * naechste Klick — gruen auf dem Entwicklerrechner, rot auf einem kalten
   * CI-Runner.
   *
   * Nebenbei die Zusage, dass `aria-expanded` am Oeffner nach dem Schlieszen
   * wieder stimmt: `setOffen(false)` haengt an `Drawer.onClose`, und Escape
   * laeuft ueber genau diesen Weg. Faende es nicht statt, meldete der Knopf
   * dauerhaft "offen".
   */
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("suite-drawer")).toBeHidden();
  await expect(page.getByTestId("menue-knopf")).toHaveAttribute("aria-expanded", "false");

  await page.getByTestId("nutzermenue").click();
  await expect(page.getByTestId("abmelden")).toBeVisible();
});

test("mobil: anonym steht der Anmelden-Weg in der Kopfzeile", async ({ page }) => {
  // `qr` ist `requiresAuth: false` — die einzige Modulseite, die sich ohne
  // Sitzung ueberhaupt aufrufen laesst.
  await page.goto("http://qr.localtest.me:3100/");
  await expect(page.getByTestId("anmelden")).toBeVisible();
  await expect(page.getByTestId("nutzermenue")).toHaveCount(0);

  // Dieselbe Grenze wie beim angemeldeten Lauf oben, und hier neu noetig: der
  // Anmelden-Knopf traegt SCHRIFT und ist damit deutlich breiter als der
  // Avatar-Knopf, den er ersetzt. Bricht die Leiste um, wird sie hoeher.
  const hoehe = await page
    .getByTestId("suite-header")
    .evaluate((el) => el.getBoundingClientRect().height);
  console.log(`Kopfzeilenhoehe anonym bei 390x844: ${hoehe}px`);
  expect(hoehe).toBeLessThanOrEqual(72);
});

test.describe("Desktop — was ohne Drawer erreichbar sein muss", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("desktop: kein Menue-Knopf, Abmelden ueber das Nutzermenue", async ({ page }) => {
    /*
     * DIESER TEST HAETTE DEN KASKADENFEHLER GEFANGEN. `.nurMobil` und antds
     * `.ant-btn` sind gleich spezifisch (beide 0,1,0); die Media-Query-Regel
     * matchte und verlor trotzdem, weil antds Stylesheet spaeter kommt. Der
     * 390px-Test kann das nicht sehen — dort ergeben beide Kandidaten
     * "sichtbar", und die Zusage lautet dort ohnehin "der Knopf IST da".
     *
     * `toBeHidden` und nicht `toHaveCount(0)`: der Knopf bleibt im DOM (beide
     * Auspraegungen werden immer gerendert, nur CSS entscheidet), die Zusage
     * ist also "man sieht ihn nicht" und nicht "es gibt ihn nicht".
     *
     * Und der zweite Teil ist die Kopplung, die den Fix erst noetig machte:
     * verschwindet der Knopf, verschwindet der Drawer — und mit ihm bis zu
     * diesem Vorhaben der einzige Abmeldeweg.
     */
    await devLogin(page, { host: "portal.localtest.me", groups: "alpha-users" });
    await expect(page.getByTestId("suite-header")).toBeVisible();
    await expect(page.getByTestId("menue-knopf")).toBeHidden();

    // Vor dem Oeffnen gibt es das Menue gar nicht (kein `forceRender` — das
    // Portal darf serverseitig nicht entstehen, siehe SuiteNav.tsx).
    await expect(page.getByTestId("abmelden")).toHaveCount(0);
    await page.getByTestId("nutzermenue").click();
    await expect(page.getByTestId("abmelden")).toBeVisible();
  });

  test("desktop: anonym fuehrt der Anmelden-Knopf der Kopfzeile auf /login", async ({ page }) => {
    // Anonym gibt es keinen Avatar (`userName` ist null) und ab 768px auch
    // keinen Drawer — ohne diesen Knopf haette ein abgemeldeter Besucher auf
    // dem Desktop gar keinen Anmeldeweg in der Oberflaeche.
    await page.goto("http://qr.localtest.me:3100/");
    await expect(page.getByTestId("menue-knopf")).toBeHidden();
    await page.getByTestId("anmelden").click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Modulnavigation am laufenden Server", () => {
  // Desktop-Viewport (Standard), weil `.modulnav` dort sichtbar ist.
  test.use({ viewport: { width: 1280, height: 720 } });

  test("markiert genau einen Eintrag als aktuelle Seite", async ({ page }) => {
    // DER EINZIGE ORT, DER DAS BEWEISEN KANN. Der Unit-Test mockt
    // `usePathname()`; was die Funktion unter dem Proxy-Rewrite (`/vergleich`
    // -> `/m/feedback/vergleich`) tatsaechlich liefert, haengt an der
    // Next-Version. Waere die Aufloesung falsch, wuerde schlicht nie etwas
    // markiert — ein stiller Fehlschlag, den kein Unit-Test sieht.
    await devLogin(page, {
      host: "feedback.localtest.me",
      groups: "da-feedback-admin",
      callbackPath: "/vergleich",
    });
    const aktiv = page.locator('[data-testid="modulnav"] a[aria-current="page"]');
    await expect(aktiv).toHaveCount(1);
    await expect(aktiv).toHaveText("Vergleich");
  });

  test("markiert die Uebersicht auf der Modulwurzel", async ({ page }) => {
    await devLogin(page, {
      host: "feedback.localtest.me",
      groups: "da-feedback-admin",
      callbackPath: "/",
    });
    const aktiv = page.locator('[data-testid="modulnav"] a[aria-current="page"]');
    await expect(aktiv).toHaveCount(1);
    await expect(aktiv).toHaveText("Übersicht");
  });

  test("sagt auf einer Seite ohne eigenen Eintrag NICHT `page`, sondern `true`", async ({
    page,
  }) => {
    /*
     * DER FUND AUS DEM ABSCHLUSSREVIEW, am laufenden Server. `/wifi` hat keinen
     * Navigationseintrag; der Wurzel-Fallback markierte dort trotzdem
     * „Generator" (Link auf `/`) mit `aria-current="page"` — „aktuelle Seite"
     * ueber eine Seite, die es nicht ist. Betroffen waren sechs Routen
     * (`/wifi`, `/tel`, `/contact`, `/groups/17`, `/trend`, `/auswertung`).
     *
     * Hier und nicht nur im Unit-Test, weil der Unit-Test `usePathname()` mockt:
     * ob die Modulwurzel unter dem Rewrite als `/` oder als `/m/qr` ankommt,
     * entscheidet erst der Server — und davon haengt ab, welcher der beiden
     * Werte herauskommt.
     *
     * `qr` braucht keine Anmeldung (`requiresAuth: false`).
     */
    await page.goto("http://qr.localtest.me:3100/wifi");
    const nav = page.locator('[data-testid="modulnav"]');
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(0);
    await expect(nav.locator('a[aria-current="true"]')).toHaveText("Generator");
  });
});
