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

test("mobil: die Modulnavigation steht nicht als zweite Zeile im Weg", async ({ page }) => {
  /*
   * NEU NOETIG, seit die Modulnavigation eine eigene Zeile UNTER der Kopfzeile
   * ist: der Hoehentest darueber misst `suite-header` und sieht sie damit gar
   * nicht mehr. Zeigte sie sich mobil, kaeme sie zu den 64px der Kopfzeile
   * hinzu und niemand faende es.
   *
   * `qr` statt `portal`, weil `portal` den `nav`-Slot nicht befuellt — dort
   * gaebe es nichts zu verbergen. Anonym erreichbar (`requiresAuth: false`).
   */
  await page.goto("http://qr.localtest.me:3100/");
  await expect(page.getByTestId("modulnav")).toBeHidden();
  const gesamt = await page.evaluate(
    () => document.querySelector('[data-testid="suite-header"]')!.getBoundingClientRect().bottom,
  );
  console.log(`Unterkante der Kopfzeile mit Modulnav-Slot bei 390x844: ${gesamt}px`);
  expect(gesamt).toBeLessThanOrEqual(72);
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

/**
 * Der Bereich, der gefehlt hat: 390 und 1280 waren geprueft, 768-903 nicht —
 * und genau dort hatte die Kopfzeile eine Mindestbreite von 904px, sodass jede
 * Seite seitwaerts scrollte und der Modultitel auf 0px schrumpfte.
 *
 * Gemessen wurde die Ausgangslage bei 768px auf genau dieser Route:
 * Polsterung 90px je Seite (nicht 16 — siehe unten), `.titel` 0px,
 * `.rechts` 573px, `.modulnav` 209px, rechte Kante 904px.
 *
 * ZWEI URSACHEN, jede fuer sich notwendig, keine allein hinreichend:
 *
 * 1. `.modulnav` war ein drittes Flex-Kind der Kopfzeile statt einer zweiten
 *    Zeile darunter (Entwurf §4). Sie behielt ihre Inhaltsbreite, `.rechts`
 *    steht auf `flex: 0 0 auto` — nachgeben konnte nur der Titel.
 * 2. Die Polsterung der Kopfzeile stand auf 90px je Seite. `.kopf` deklariert
 *    16px, verliert aber gegen antds `.ant-layout-header` bei gleicher
 *    Spezifitaet; und antd LEITET den Wert aus `controlHeightLG * 1.25` ab —
 *    mit dem Tap-Ziel der Suite (72) also 90 statt 50. Das Tap-Ziel hat die
 *    Kopfzeile stillschweigend um 80px verengt.
 *
 * Nur (1) zu beheben liesze den Titel bei 768px weiterhin auf 0px stehen
 * (736px Inhalt gegen 573 + 16 Abstand = 589 fuer `.rechts` allein), nur (2)
 * liesze die Seite weiter seitwaerts scrollen. Deshalb pruefen die Zusagen
 * unten BEIDES.
 */
for (const breite of [768, 820, 900]) {
  test.describe(`Mittelbreite ${breite}px`, () => {
    test.use({ viewport: { width: breite, height: 800 } });

    test(`bei ${breite}px scrollt nichts seitwaerts und der Modultitel bleibt lesbar`, async ({
      page,
    }) => {
      // feedback-Admin, weil diese Route den `nav`-Slot befuellt — auf einer
      // Seite ohne Modulnavigation kann der Defekt gar nicht auftreten.
      await devLogin(page, {
        host: "feedback.localtest.me",
        groups: "da-feedback-admin",
        callbackPath: "/",
      });
      await expect(page.getByTestId("modulnav")).toBeVisible();

      const quer = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      console.log(`${breite}px: scrollWidth ${quer.scrollWidth}, innerWidth ${quer.innerWidth}`);
      expect(quer.scrollWidth).toBeLessThanOrEqual(quer.innerWidth);

      const titel = page.getByTestId("module-title");
      await expect(titel).toBeVisible();
      const sichtbar = await titel.evaluate((el) => {
        /*
         * NICHT die Breite des `<strong>` selbst — das waere eine Messung, die
         * den Defekt nicht sieht. `.titel` (der Link darum) traegt
         * `overflow: hidden`; bei 768px mass der `<strong>` unveraendert 68px,
         * waehrend der Link 0px breit war. `toBeVisible()` allein war deshalb
         * auch VOR dem Fix gruen. Gemessen wird der KLIPPENDE Kasten, denn nur
         * der sagt, wie viel vom Titel jemand sieht.
         */
        const link = el.closest("a");
        return Math.round((link ?? el).getBoundingClientRect().width);
      });
      console.log(`${breite}px: sichtbare Titelbreite ${sichtbar}px`);
      expect(sichtbar).toBeGreaterThan(0);

      /*
       * Und die Struktur selbst, nicht nur ihr Symptom. Die beiden Zusagen
       * darueber waeren auch mit `.modulnav` als drittem Flex-Kind erfuellbar,
       * sobald es zufaellig passt — dann faellt die Kopfzeile beim naechsten
       * Modul mit einem Eintrag mehr wieder um. Die Modulnavigation gehoert
       * UNTER die Kopfzeile (Entwurf §4, "zweite Zeile").
       */
      const kopf = (await page.getByTestId("suite-header").boundingBox())!;
      const nav = (await page.getByTestId("modulnav").boundingBox())!;
      expect(nav.y).toBeGreaterThanOrEqual(kopf.y + kopf.height - 1);
    });
  });
}

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

  test("steht als zweite Zeile UNTER der Kopfzeile, nicht neben dem Avatar", async ({ page }) => {
    /*
     * Die letzte Zeile der Messtabelle aus dem Fundbericht: bei 1280px stand
     * die Modulnavigation RECHTS NEBEN dem Avatar (x=981, y=-1) statt unter der
     * Kopfzeile. Das war schon auf dem Desktop nicht der Entwurf (§4, Tabelle
     * "zweite Zeile") — nur fiel es dort nicht auf, weil genug Platz da war.
     *
     * Ohne diese Zusage waere die Struktur ungeprueft: bei 1280px scrollt auch
     * die alte Fassung nicht seitwaerts und der Titel ist breit genug. Der
     * Rueckbau in ein drittes Flex-Kind waere gruen durchgelaufen.
     */
    await devLogin(page, {
      host: "feedback.localtest.me",
      groups: "da-feedback-admin",
      callbackPath: "/",
    });
    const kopf = (await page.getByTestId("suite-header").boundingBox())!;
    const nav = (await page.getByTestId("modulnav").boundingBox())!;
    console.log(`1280px: Kopf ${JSON.stringify(kopf)}, Modulnav ${JSON.stringify(nav)}`);
    // Beginnt links am selben Rand und liegt vollstaendig unterhalb.
    expect(nav.x).toBeLessThan(kopf.x + 32);
    expect(nav.y).toBeGreaterThanOrEqual(kopf.y + kopf.height - 1);

    // Und die beiden Zusagen der Mittelbreiten gelten hier ebenso.
    const quer = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(quer.scrollWidth).toBeLessThanOrEqual(quer.innerWidth);
    const sichtbar = await page
      .getByTestId("module-title")
      .evaluate((el) => Math.round((el.closest("a") ?? el).getBoundingClientRect().width));
    console.log(`1280px: scrollWidth ${quer.scrollWidth}, sichtbare Titelbreite ${sichtbar}px`);
    expect(sichtbar).toBeGreaterThan(0);
  });

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
