import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST } from "./helpers/lagerbuch";

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

test("mobil: der App-Wechsel hängt am Umschalter der Kopfzeile, nicht am Menü", async ({
  page,
}) => {
  /*
   * Die alte Modulknopfreihe (`modulzeile`) ist ersatzlos entfallen, und mit
   * ihr auch die Modulliste im Drawer — der App-Wechsel hängt seit dem
   * Navigations-Umbau am Umschalter der Kopfzeile, UND ZWAR AUF JEDER GRÖSSE
   * (SuiteHeader.tsx, `AppUmschalter` trägt kein `.nurDesktop`/`.nurMobil`).
   * Anders als der Menü-Knopf (`.nurMobil`, mobil-only) ist der Umschalter
   * hier also direkt erreichbar, ohne den Drawer erst zu öffnen.
   */
  await devLogin(page, { host: "portal.localtest.me", groups: "alpha-users" });
  await expect(page.getByTestId("suite-header")).toBeVisible();
  await page.getByTestId("app-umschalter").click();
  await expect(
    page.getByTestId("app-panel").getByRole("link", { name: /Alpha/ }),
  ).toBeVisible();
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

test("mobil: die Modulnavigation steht nicht im Weg", async ({ page }) => {
  /*
   * Seit 2026-08-13 liegt die Modulnavigation in der Seitenleiste
   * (`SuiteRahmen`, `.sider`), nicht mehr in einer eigenen Zeile UNTER der
   * Kopfzeile. Unterhalb von 768px steht `.sider` auf `display: none`
   * (shell.module.css) — der Hoehentest darueber misst `suite-header` und
   * sieht die Leiste damit ohnehin nicht mehr; hier wird zusaetzlich
   * nachgewiesen, dass sie wirklich unsichtbar bleibt und die Kopfzeile nicht
   * aufblaeht.
   *
   * `qr` statt `portal`, weil `portal` den `nav`-Slot nicht befuellt — dort
   * gaebe es nichts zu verbergen. Anonym erreichbar (`requiresAuth: false`).
   */
  await page.goto("http://qr.localtest.me:3100/");
  await expect(page.getByTestId("modulleiste")).toBeHidden();
  const gesamt = await page.evaluate(
    () => document.querySelector('[data-testid="suite-header"]')!.getBoundingClientRect().bottom,
  );
  console.log(`Unterkante der Kopfzeile mit Modulleiste-Slot bei 390x844: ${gesamt}px`);
  expect(gesamt).toBeLessThanOrEqual(72);
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
 *
 * NACHTRAG 2026-08-13: `.modulnav` (die zweite Zeile) ist ersatzlos entfallen,
 * die Modulnavigation liegt seither in der Seitenleiste (`modulleiste`,
 * `SuiteRahmen`). Die Messungen oben bleiben als historischer Befund stehen —
 * die Zusagen unten pruefen dieselbe Struktur (Leiste beginnt links, unterhalb
 * der Kopfzeile, keine seitliche Ueberschreitung) an der neuen Bauform.
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
      await expect(page.getByTestId("modulleiste")).toBeVisible();

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
         * NICHT zwingend die Breite des `<strong>` selbst — das waere eine
         * Messung, die den Defekt nicht sieht, WENN das Element, das klippt,
         * ein anderes ist. Ursprünglich (anonym, `.titel`-Link um den Titel)
         * traf genau das zu: `.titel` trug `overflow: hidden`, bei 768px mass
         * der `<strong>` unveraendert 68px, waehrend der Link 0px breit war —
         * `toBeVisible()` allein war deshalb auch VOR dem Fix gruen.
         *
         * SEIT DEM APP-UMSCHALTER IST DER TITEL ANGEMELDET KEIN `<a>` MEHR,
         * SONDERN EIN `<strong>` IN EINEM `<button>` (`AppUmschalter.tsx`).
         * `el.closest("a")` findet dort nichts, `link` bleibt `null`, und der
         * Fallback `?? el` misst den `<strong>` direkt — das ist jetzt richtig
         * so: `.umschalterAusloeser strong` (`shell.module.css`) traegt seit
         * dem Umbau selbst `overflow: hidden; text-overflow: ellipsis`, ist
         * also SELBST der klippende Kasten, nicht mehr sein Elternknoten. Die
         * Zusicherung haelt aus einem anderen Grund als hier urspruenglich
         * gemessen: `.closest("a")` bleibt fuer den ANONYMEN Zweig noetig
         * (`SuiteHeader.tsx` rendert dort weiterhin `<Link className={s.titel}>`),
         * greift dort aber nicht, wenn die Person angemeldet ist.
         */
        const link = el.closest("a");
        return Math.round((link ?? el).getBoundingClientRect().width);
      });
      console.log(`${breite}px: sichtbare Titelbreite ${sichtbar}px`);
      expect(sichtbar).toBeGreaterThan(0);

      /*
       * Und die Struktur selbst, nicht nur ihr Symptom. Die beiden Zusagen
       * darueber waeren auch mit der Leiste als drittem Flex-Kind DER
       * KOPFZEILE erfuellbar, sobald es zufaellig passt — dann faellt die
       * Kopfzeile beim naechsten Modul mit einem Eintrag mehr wieder um. Die
       * Modulnavigation gehoert UNTER die Kopfzeile, als eigene Seitenleiste
       * (`SuiteRahmen`), nicht als Kind von `.kopf`.
       */
      const kopf = (await page.getByTestId("suite-header").boundingBox())!;
      const nav = (await page.getByTestId("modulleiste").boundingBox())!;
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
  // Desktop-Viewport (Standard), weil `.sider`/`modulleiste` dort sichtbar ist.
  test.use({ viewport: { width: 1280, height: 720 } });

  test("steht als Seitenleiste UNTER der Kopfzeile, nicht neben dem Avatar", async ({ page }) => {
    /*
     * Die letzte Zeile der Messtabelle aus dem Fundbericht: bei 1280px stand
     * die Modulnavigation RECHTS NEBEN dem Avatar (x=981, y=-1) statt unter der
     * Kopfzeile. Das war schon auf dem Desktop nicht der Entwurf (§4, Tabelle
     * "zweite Zeile") — nur fiel es dort nicht auf, weil genug Platz da war.
     * Seit 2026-08-13 ist die Modulnavigation keine Zeile mehr, sondern die
     * Seitenleiste (`modulleiste`) — die Zusage bleibt dieselbe: sie beginnt
     * links, unterhalb der Kopfzeile, nicht daneben.
     *
     * Ohne diese Zusage waere die Struktur ungeprueft: bei 1280px scrollt auch
     * eine fehlerhafte Fassung nicht seitwaerts und der Titel ist breit genug.
     * Ein Rueckbau in ein drittes Flex-Kind der Kopfzeile waere gruen
     * durchgelaufen.
     */
    await devLogin(page, {
      host: "feedback.localtest.me",
      groups: "da-feedback-admin",
      callbackPath: "/",
    });
    const kopf = (await page.getByTestId("suite-header").boundingBox())!;
    const nav = (await page.getByTestId("modulleiste").boundingBox())!;
    console.log(`1280px: Kopf ${JSON.stringify(kopf)}, Modulleiste ${JSON.stringify(nav)}`);
    // Beginnt links am selben Rand und liegt vollstaendig unterhalb.
    expect(nav.x).toBeLessThan(kopf.x + 32);
    expect(nav.y).toBeGreaterThanOrEqual(kopf.y + kopf.height - 1);

    // Und die beiden Zusagen der Mittelbreiten gelten hier ebenso.
    const quer = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(quer.scrollWidth).toBeLessThanOrEqual(quer.innerWidth);
    // `closest("a")` findet hier nichts mehr (angemeldeter Titel = `<strong>`
    // in einem `<button>`, nicht in einem `<a>`) — der Fallback `?? el` misst
    // dann den `<strong>` selbst, und der klippt seit dem App-Umschalter
    // wieder korrekt ueber `.umschalterAusloeser strong`. Ausfuehrliche
    // Begruendung am ersten Vorkommen dieser Messung oben in dieser Datei.
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
    const aktiv = page.locator('[data-testid="modulleiste"] a[aria-current="page"]');
    await expect(aktiv).toHaveCount(1);
    await expect(aktiv).toHaveText("Vergleich");
  });

  test("markiert die Uebersicht auf der Modulwurzel", async ({ page }) => {
    await devLogin(page, {
      host: "feedback.localtest.me",
      groups: "da-feedback-admin",
      callbackPath: "/",
    });
    const aktiv = page.locator('[data-testid="modulleiste"] a[aria-current="page"]');
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
    const nav = page.locator('[data-testid="modulleiste"]');
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(0);
    await expect(nav.locator('a[aria-current="true"]')).toHaveText("Generator");
  });
});

/**
 * TASK 10 — DIE WIRKUNG BELEGEN, NICHT NUR DEN QUELLTEXT.
 *
 * Alles bisherige in Teil A bis D ist per Regeltext geprueft (shell-css.test.ts
 * & co.): "die Klasse traegt die richtige Deklaration". Das beweist nicht, dass
 * ein Element gerendert wird, dass es gegen antds spaeter geladenes Stylesheet
 * gewinnt, oder dass eine Media Query auf einem echten Viewport greift — genau
 * DAS haben in diesem Projekt schon drei Regeln vorgetaeuscht, waehrend sie
 * nichts bewirkten (`.nurMobil` gegen `.ant-btn`, `.kopf`-Polsterung gegen
 * `.ant-layout-header`, `--font-display` nirgends deklariert). Nur ein echter
 * Browser wertet Kaskade UND Media Query aus — das leisten die Tests hier.
 *
 * DER STREIFEN HAT KEIN `data-testid`. Er ist ein Geschwister VOR `<Header
 * data-testid="suite-header">` innerhalb von antds `<Layout>` (SuiteHeader.tsx,
 * SuiteRahmen.tsx) — `Layout` fuegt zwischen seinen Kindern kein zusaetzliches
 * Element ein, der Streifen bleibt also der unmittelbare vorangehende
 * Geschwisterknoten der Kopfzeile im DOM. Ein `xpath`-Achsenausdruck greift ihn
 * darueber, ohne auf `[aria-hidden="true"]` angewiesen zu sein — antd setzt das
 * Attribut an eigenen Knoten (z. B. Icons), und `.first()` waere dort der
 * falsche Treffer. Keine Markup-Aenderung noetig.
 */
function streifenLocator(page: import("@playwright/test").Page) {
  return page.locator('xpath=//*[@data-testid="suite-header"]/preceding-sibling::*[1]');
}

test.describe("Task 10 — Wirkungsnachweis Streifen, Aktivfarbe, Display-Schrift", () => {
  test.describe("Desktop 1280x720", () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test("der Markenstreifen ist gerendert, 5px hoch und traegt Markenrot", async ({ page }) => {
      // KEIN Zustand aus dem Seed noetig — jede angemeldete Seite reicht.
      await devLogin(page, { host: "portal.localtest.me", groups: "" });
      const streifen = streifenLocator(page);
      await expect(streifen).toBeVisible();
      await expect(streifen).toHaveCSS("height", "5px");
      await expect(streifen).toHaveCSS("background-color", "rgb(200, 0, 15)");
    });

    test("der aktive Navigationseintrag traegt den 3px-Linksakzent in Markenrot, plus Gewicht 600", async ({
      page,
    }) => {
      // `.navLink[aria-current]` lebt in der Seitenleiste (`modulleiste`). Die
      // Apps haengen am Umschalter der Kopfzeile (`.umschalter`) und tragen
      // eine eigene Klasse (`.appEintrag`) — der Selektor unten kann sie also
      // nicht mitgreifen. feedback-admin auf der Modulwurzel markiert die
      // Uebersicht mit `aria-current="page"` — derselbe Aufbau wie im
      // bestehenden Test "markiert die Uebersicht auf der Modulwurzel" oben.
      //
      // DIESER BLOCK PRUEFTE FRUEHER "Schrift UND Unterkante", und beides war
      // falsch geworden:
      //
      // Die Unterkante zuerst. `.navLink` setzt nur `border-inline-start`;
      // `border-bottom-style` ist `none`, die Breite 0, und
      // `border-bottom-color` faellt damit auf `currentcolor` zurueck — also
      // auf genau die `color`, die eine Zeile darueber schon zugesichert war.
      // Die Zusicherung konnte nicht fallen: wer den Linksakzent ersatzlos
      // loescht, haette hier weiterhin Gruen bekommen. Damit war die sichtbare
      // Aktivmarkierung der Seitenleiste im Browser nirgends belegt, nur als
      // Regeltext in `shell-css.test.ts`.
      //
      // Die Schriftfarbe danach: sie ist mit der Kontrast-Korrektur des
      // Schlussreviews entfallen (`#e45a66` auf der getoenten Flaeche ergab im
      // Dunkeln 3.96:1). `.navLink[aria-current]` traegt keine eigene `color`
      // mehr; eine Zusicherung darauf haette die Regression festgehalten.
      //
      // Zugesichert wird deshalb der Traeger, der wirklich da ist: Farbe UND
      // Breite des linken Akzents. Beide einzeln, weil eine allein nicht
      // reicht — ohne die Breite bliebe der Ausfall von `border-inline-start`
      // unbemerkt, ohne die Farbe der Ausfall von `--iuk-marke`.
      //
      // `border-inline-start-*` meldet sich in `getComputedStyle` unter der
      // physischen Eigenschaft — Schreibmodus der Suite ist horizontal-tb/ltr,
      // "inline-start" ist dort "left".
      await devLogin(page, {
        host: "feedback.localtest.me",
        groups: "da-feedback-admin",
        callbackPath: "/",
      });
      const aktiv = page.locator('[data-testid="modulleiste"] a[aria-current]');
      await expect(aktiv).toHaveCount(1);
      await expect(aktiv).toHaveCSS("border-left-color", "rgb(200, 0, 15)");
      await expect(aktiv).toHaveCSS("border-left-width", "3px");
      await expect(aktiv).toHaveCSS("font-weight", "600");
    });

    test("die Display-Familie kommt im Modultitel an", async ({ page }) => {
      await devLogin(page, { host: "portal.localtest.me", groups: "" });
      const titel = page.getByTestId("module-title");
      const familie = await titel.evaluate((el) => getComputedStyle(el).fontFamily);
      // "Barlow" statt exakt "Barlow Condensed": der Fallback-Pfad war frueher
      // "Arial Narrow" (--font-display nirgends deklariert), das enthaelt kein
      // "Barlow" — die Zusicherung faengt genau diesen Rueckfall.
      expect(familie, `Modultitel rendert in: ${familie}`).toContain("Barlow");
    });
  });

  test("mobil bleibt die Kopfzeile 64px hoch — der Streifen davor dehnt sie nicht", async ({
    page,
  }) => {
    // Viewport 390x844 kommt vom Datei-weiten `test.use` oben.
    //
    // DER 390er LAUF IST NICHT DIE ZUGABE, sondern der Gegenpart zum
    // Desktop-Streifentest: haenge der Streifen versehentlich INNERHALB des
    // `<Header>` statt davor, waere `suite-header` 69px hoch statt 64 — und
    // bei 1280px faellt das niemandem auf (dort ist reichlich Luft).
    await devLogin(page, { host: "portal.localtest.me", groups: "" });
    const kopf = page.getByTestId("suite-header");
    const box = await kopf.boundingBox();
    expect(box?.height).toBe(64);
  });

  test("im Dunkelmodus loest --iuk-marke zu #e45a66 auf, nicht zum hellen Wert", async ({
    page,
  }) => {
    /*
     * WEG FUER DIESE ZUSICHERUNG: `setAttribute("data-theme", "dark")` im
     * Browser. Das reicht fuer EIGENE CSS-Variablen — sie haengen an
     * `:root[data-theme="dark"]` in globals.css und werten das Attribut direkt
     * aus. Es deckt NICHT antds eigene Tokens (Layout.headerBg etc.): die
     * kommen aus dem serverseitig gewaehlten Algorithmus (Cookie `iuk-theme`,
     * `core/theme/mode.ts`), ein client-seitig gesetztes Attribut aendert daran
     * nichts. Fuer die reine `--iuk-marke`-Zusicherung ist das die richtige,
     * schlankere Wahl — ein Cookie-Umweg mit Neuladen waere hier Mehraufwand
     * ohne zusaetzliche Deckung.
     *
     * #e45a66 ist NICHT der Wert aus dem urspruenglichen Task-10-Brief
     * (#e04452) — der wurde in Task 6 angehoben, weil #e04452 die AA-Schwelle
     * gegen #141414 riss (4.49:1 statt 4.5). Der aktuelle Wert ist in Task 6
     * gemessen (5.22:1 gegen #141414, 5.00:1 gegen #16191c) und in
     * globals.css dokumentiert — diese Messung wird hier NICHT wiederholt.
     *
     * Ohne diese Zusicherung faellt der Dunkelzweig still auf den hellen Wert
     * zurueck, sobald ihn jemand beim Aufraeumen entfernt: `--iuk-marke` waere
     * dann in beiden Modi #c8000f, und kein Regeltext-Scan saehe das — die
     * Deklaration stuende weiterhin da, nur der Selektor griffe nicht mehr.
     */
    await devLogin(page, { host: "portal.localtest.me", groups: "" });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));

    const marke = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--iuk-marke").trim(),
    );
    expect(marke).toBe("#e45a66");
  });
});

/**
 * AUFGABE 6 — DER EINE GEBUENDELTE PLAYWRIGHT-LAUF.
 *
 * Alle fuenf vorangegangenen Aufgaben (App-Umschalter, SuiteRahmen, klebende
 * Kopfzeile, Seitenleiste, Arbeitsdichte) sind per Regeltext geprueft und
 * committet, aber KEINE davon ist im Browser belegt: antd spritzt seine
 * Regeln zur Laufzeit ueber cssinjs ein, und die stehen in keiner Datei
 * dieses Repos — kein Quelltext-Scan und kein jsdom sieht sie. Nur dieser
 * Lauf beweist, dass etwas davon tatsaechlich wirkt.
 */
test.describe("Wirkungsnachweis Navigation und Dichte — Desktop 1280x720", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("die Kopfzeile vererbt dem Umschalter keine Zeilenhöhe mehr", async ({ page }) => {
    /*
     * DIE EINZIGE STELLE, DIE DAS BEWEISEN KANN. antd setzt auf
     * `.ant-layout-header` ein `line-height: 64px` (layout/style/index.js:50)
     * und spritzt die Regel zur Laufzeit über cssinjs ein — sie steht in
     * keiner Datei dieses Repos. `shell-css.test.ts` hält fest, dass die
     * Gegenmaßnahme DASTEHT; ob sie WIRKT, weiß nur der Browser.
     *
     * Gemessen wird der Auslöser und nicht das Panel, weil er auch
     * geschlossen existiert — und weil er es war, der mit 76px in einer 64px
     * hohen Kopfzeile stand.
     */
    await devLogin(page, { host: "portal.localtest.me", groups: "" });

    const ausloeser = page.getByTestId("app-umschalter");
    await expect(ausloeser).toBeVisible();
    expect(await ausloeser.evaluate((el) => getComputedStyle(el).lineHeight)).not.toBe("64px");
    expect((await ausloeser.boundingBox())!.height).toBeLessThan(56);
  });

  test("ein Panel-Eintrag ist eine Zeile, keine Fläche", async ({ page }) => {
    await devLogin(page, { host: "portal.localtest.me", groups: "" });
    await page.getByTestId("app-umschalter").click();

    const eintrag = page.getByTestId("app-eintrag").first();
    await expect(eintrag).toBeVisible();
    expect((await eintrag.boundingBox())!.height).toBeLessThan(56);
  });

  test("das offene Panel liegt über der Seitenleiste", async ({ page }) => {
    /*
     * DIE EINE MESSUNG ZUM STAPELKONTEXT, den dieser Umbau NEU einführt.
     *
     * `.kopfBlock` bekommt `position: sticky` und `z-index: 100` und wird damit
     * zum Stapelkontext. Darin liegen `.umschalterFang` (900) und
     * `.umschalterPanel` (901) — ihre Zahlen gelten ab sofort nur noch
     * INNERHALB dieses Kontexts, nicht mehr gegen die ganze Seite. Die
     * Seitenleiste ist ebenfalls `position: sticky`, aber ohne `z-index`
     * (`auto`) und außerhalb des Kontexts: sie malt über nicht-positionierten
     * Inhalt und unter `.kopfBlock`.
     *
     * Das ist das gewünschte Ergebnis — und genau deshalb wird es gemessen.
     * Das Panel klappt nach UNTEN auf und deckt dabei die obersten Zeilen der
     * Leiste ab; kippte die Reihenfolge, wäre der erste Eintrag des Panels
     * unklickbar, und keine der anderen fünf Messungen sähe das.
     *
     * `hit-testable` und nicht nur `visible`: ein verdeckter Knoten ist im
     * Sinne von Playwright weiterhin sichtbar. `click` mit kurzem Timeout
     * schlägt fehl, sobald ein anderer Knoten den Punkt abfängt („intercepts
     * pointer events") — das ist die Aussage, die hier gebraucht wird.
     */
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
    await expect(page.getByTestId("modulleiste")).toBeVisible();

    await page.getByTestId("app-umschalter").click();
    const ersterEintrag = page.getByTestId("app-eintrag").first();
    await expect(ersterEintrag).toBeVisible();
    await ersterEintrag.click({ trial: true, timeout: 2000 });
  });

  test("die Leiste trägt die Navigation, es gibt keine zweite Zeile", async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });

    await expect(page.getByTestId("modulleiste")).toBeVisible();
    await expect(page.getByTestId("modulnav")).toHaveCount(0);
  });

  test("die Kopfzeile bleibt stehen und lässt kein Loch über der Leiste", async ({ page }) => {
    /*
     * Der Defekt war NICHT sichtbar, solange man nicht scrollte: die Leiste
     * klebte bei 64px unter einer Kopfzeile, die mitscrollte. Deshalb das
     * `wheel` — ohne es sagen die richtige und die kaputte Fassung dasselbe.
     */
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
    await expect(page.getByTestId("modulleiste")).toBeVisible();
    /*
     * ERST WENN DIE LEISTE WIRKLICH KLEBT, DANN SCROLLEN. `next dev` reicht
     * antds cssinjs-Regeln nach; bis dahin steht die Seitenleiste UEBER dem
     * Inhalt statt daneben und traegt `position: relative`. Eine Messung in
     * diesem Zustand beschriebe eine andere Seite als die, ueber die dieser
     * Test etwas sagt — und `toHaveCSS` faellt LAUT, falls die Regel gar nicht
     * kommt, statt still den falschen Zustand zu vermessen. (Genau diese Regel
     * ist der Befund dieses Umbaus: antds `.ant-layout-sider` traegt
     * `position: relative`, gleiche Spezifitaet, spaeter im Dokument — deshalb
     * `.sider.sider` in `shell.module.css`.)
     */
    await expect(page.locator(".ant-layout-sider")).toHaveCSS("position", "sticky");
    await page.mouse.wheel(0, 600);
    /*
     * AUF DAS SCROLLEN WARTEN, NICHT NUR ES AUSLOESEN — und das ist ein Befund,
     * kein vorsorgliches Warten. `mouse.wheel` schickt das Ereignis ab; das
     * Scrollen selbst passiert danach. Ohne dieses Warten stand `window.scrollY`
     * in DREI von drei Wiederholungen (`--repeat-each=3`) noch auf 0, und die
     * Messung unten beschrieb die UNGESCROLLTE Seite. Dort steht die Leiste
     * ohnehin an der Unterkante der Kopfzeile — die Zusicherung war also gruen,
     * ohne je die Aussage zu pruefen, fuer die es sie gibt („die richtige und
     * die kaputte Fassung sagen ohne Scrollen dasselbe", Absatz oben).
     */
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    /*
     * BEIDE KAESTEN IN EINEM LESEVORGANG. Zwei `boundingBox()`-Aufrufe sind
     * zwei Playwright-Rundlaeufe und damit zwei Zeitpunkte; verglichen wuerden
     * sie, als waeren sie derselbe Zustand. Auf einer Seite MIT Seitenleiste
     * ist das nachweislich falsch — in `e2e/files-mobil.spec.ts` (`kaesten`)
     * steht der gemessene Fall ausgeschrieben, dort verschob derselbe
     * Zwischenzustand einen Knopf um 240px waagerecht und 180px senkrecht.
     * Ein `evaluate` ist EIN Layout-Lesevorgang.
     */
    const mass = await page.evaluate(() => {
      const kopf = document.querySelector('[data-testid="suite-header"]')!.getBoundingClientRect();
      const leiste = document.querySelector('[data-testid="modulleiste"]')!.getBoundingClientRect();
      return {
        scrollY: window.scrollY,
        kopfUnterkante: kopf.y + kopf.height,
        leisteOberkante: leiste.y,
      };
    });
    console.log(`Kopf/Leiste nach wheel(0,600): ${JSON.stringify(mass)}`);
    // Ohne echtes Scrollen sagen die richtige und die kaputte Fassung dasselbe —
    // die Messung muss also zuerst belegen, dass ueberhaupt gescrollt wurde.
    expect(mass.scrollY).toBeGreaterThan(0);
    expect(mass.leisteOberkante).toBeGreaterThanOrEqual(mass.kopfUnterkante - 1);
    expect(mass.leisteOberkante).toBeLessThan(mass.kopfUnterkante + 8);
  });

  test("Arbeitsflächen sind dichter als Einsatzformulare", async ({ page }) => {
    /*
     * Die eine Messung, die die zweite Bediendichte belegt. `theme.test.ts`
     * hält fest, WAS `ARBEITSDICHTE` setzt; dass antd das Elterntheme
     * tatsächlich mischt und die 40px unten ankommen, weiß nur der Browser.
     *
     * KORREKTUR GEGENUEBER DEM BRIEF: `button.ant-btn` ohne Einschraenkung
     * traf nicht den beabsichtigten Arbeitsflaechen-Knopf, sondern den ERSTEN
     * `.ant-btn` im DOM ueberhaupt — das ist der mobile Menue-Knopf in der
     * Kopfzeile (`SuiteNav.tsx`, `data-testid="menue-knopf"`, Klasse
     * `.nurMobil`). Er steht bei 1280px auf `display:none` und ist trotzdem
     * IMMER im Markup (dasselbe Muster wie ueberall in dieser Suite: „beide
     * Auspraegungen stehen im DOM, CSS blendet eine aus"). `boundingBox()`
     * auf einem unsichtbaren Knoten liefert `null`, `.height` darauf ein
     * `TypeError` — kein Befund ueber die Bediendichte, sondern ein zu weiter
     * Selektor. Und selbst ein sichtbarer erster Treffer waere hier falsch
     * gewesen: die Kopfzeile traegt bewusst NICHT die Arbeitsdichte
     * (`theme.ts`-Kommentar zu Aufgabe 5: „nicht ueber der Kopfzeile, die in
     * jedem Modul gleich aussehen soll") — ein Kopfzeilen-Knopf haette immer
     * ~56px gemessen, unabhaengig davon, ob `ARBEITSDICHTE` wirkt.
     * `.ant-layout-content` (antd, `Content` aus `SuiteRahmen.tsx`) grenzt
     * zuverlaessig auf den Inhaltsbereich ein, in dem `FullShell`/
     * `MinimalShell` ihre jeweilige Dichte anlegen.
     */
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung/artikel",
    });
    /*
     * DIE SCHRANKEN SIND `>= 44` UND `< 56`, NICHT MEHR `> 36` UND `< 44` — und
     * die Korrektur kam aus genau diesem Lauf.
     *
     * `ARBEITSDICHTE` stand auf `controlHeight: 40`, weil der Plan die
     * Shell-VARIANTE mit dem Zeigergeraet gleichgesetzt hatte. `FullShell`
     * rendert aber auch bei 390px, und dort unterschritten die 40px die
     * Mindest-Tapflaeche: drei Zusicherungen fielen gleichzeitig
     * (`lagerbuch-mobil.spec.ts:312`, `mobil-admin.spec.ts:304` und `:413`).
     * Der Wert steht seither auf 44 (WCAG 2.5.5), und diese Schranken ziehen
     * nach.
     *
     * SIE UNTERSCHEIDEN WEITERHIN: 56 ist `TAP` (Einsatzmasz, unten gemessen),
     * 72 ist `TAP_XL`. Ein `< 56` faellt also, sobald die Arbeitsdichte
     * ausbleibt oder das Elterntheme durchschlaegt — genau die Aussage, die
     * hier gebraucht wird. Gemessen auf `/verwaltung/artikel`: „Excel-Liste"
     * 127x44, „Neuer Artikel" 140x44.
     */
    const arbeit = (
      await page.locator(".ant-layout-content button.ant-btn").first().boundingBox()
    )!.height;
    expect(arbeit).toBeGreaterThanOrEqual(44);
    expect(arbeit).toBeLessThan(56);

    await page.goto("http://qr.localtest.me:3100/");
    const einsatz = (
      await page.locator(".ant-layout-content button.ant-btn").first().boundingBox()
    )!.height;
    expect(einsatz).toBeGreaterThanOrEqual(56);
  });
});

test.describe("Wirkungsnachweis Navigation und Dichte — Mittelband 820px", () => {
  /*
   * 820px, nicht nur 390 und 1280. `docs/design/README.md` ist dazu
   * ausdrücklich: die beiden letzten Shell-Defekte lagen BEIDE im Mittelband
   * und waren an beiden Enden unsichtbar — die Knopfregel bei 600 statt 768,
   * und die Kopfzeile mit 904px Mindestbreite zwischen 768 und 903.
   *
   * Die Datei hat dafür schon einen Block (`Mittelbreite ${breite}px`); dieser
   * hier misst die Leiste, die es dort vorher nicht gab.
   */
  test.use({ viewport: { width: 820, height: 900 } });

  test("kein waagerechter Überlauf, und der Titel behält Breite", async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });

    const breiten = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(breiten.scroll).toBeLessThanOrEqual(breiten.client + 1);
    expect((await page.getByTestId("module-title").boundingBox())!.width).toBeGreaterThan(0);
  });
});
