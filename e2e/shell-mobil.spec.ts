import { test, expect } from "@playwright/test";
import {
  devLogin,
  E2E_PORT,
  oeffneAlleApps,
  oeffneMenue,
  oeffneNutzermenue,
  warteAufSpaltenaufteilung,
} from "./fixtures";
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

test("mobil: der App-Wechsel steht im Blatt hinter dem Ort-Knopf", async ({ page }) => {
  /*
   * Seit dem Menue (IDA-347, Etappe 2) gibt es am Telefon EINEN Einstieg: den
   * Ort-Knopf (`menue-knopf`). Er oeffnet das Blatt mit derselben ersten Ebene
   * wie die Seitenleiste am Desktop; der App-Knopf darin schiebt „Alle Apps"
   * herein. Einen zweiten Umschalter in einer Kopfzeile gibt es nicht mehr.
   */
  await devLogin(page, { host: "portal.localtest.me", groups: "alpha-users" });
  await expect(page.getByTestId("suite-header")).toBeVisible();
  await expect(page.getByTestId("app-umschalter")).toBeHidden();
  const panel = await oeffneAlleApps(page);
  await expect(panel.getByRole("link", { name: /Alpha/ })).toBeVisible();
});

test("mobil: das offene Panel fuellt die Bildschirmbreite und scrollt nicht seitwaerts", async ({
  page,
}) => {
  /*
   * DER EINZIGE ORT, DER DEN GEMELDETEN DEFEKT SEHEN KANN.
   *
   * `.umschalterPanel` trug `inset-inline: 0` und `shell-css.test.ts` sicherte
   * das als „vollbreite Flaeche" zu — die Deklaration meinte aber den falschen
   * Kasten: solange `.umschalter` `position: relative` trug, war ER der
   * enthaltende Block, und das Panel wurde so breit wie der Modultitel
   * (gemessen ~124px bei 390px Bildschirm). Der Inhalt passte nicht hinein,
   * `overflow-y: auto` zog das `overflow-x` daneben auf `auto` hoch, und das
   * Panel liesz sich waagerecht schieben.
   *
   * Kein Quelltext-Scan findet das: die Regel stand richtig da. Erst die
   * ausgerechnete Geometrie zeigt, worauf sie sich bezog.
   *
   * `scrollWidth > clientWidth` am Panel ist die direkte Uebersetzung von „ich
   * kann es nach links und rechts bewegen"; die Breitenmessung daneben belegt
   * die Ursache und nicht nur das Symptom (ein Panel koennte auch ohne
   * Ueberlauf zu schmal sein).
   */
  await devLogin(page, { host: "portal.localtest.me", groups: "alpha-users" });
  // Seit dem Menue ist das Panel die zweite Ebene im Blatt (`app-panel-drawer`);
  // die Zusage — vollbreit, nichts seitwaerts — gilt dort unveraendert.
  await oeffneAlleApps(page);

  const mass = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="app-panel-drawer"]') as HTMLElement;
    return {
      breite: Math.round(panel.getBoundingClientRect().width),
      scrollWidth: panel.scrollWidth,
      clientWidth: panel.clientWidth,
      innerWidth: window.innerWidth,
      dokument: document.documentElement.scrollWidth,
    };
  });
  console.log(`Panel bei 390x844: ${JSON.stringify(mass)}`);

  // Vollbreit: nicht mehr die Breite des Ausloesers (die lag bei ~124px).
  expect(Math.abs(mass.breite - mass.innerWidth)).toBeLessThanOrEqual(1);
  // Und nichts, was sich seitwaerts schieben liesze — weder im Panel noch auf
  // der Seite dahinter.
  expect(mass.scrollWidth).toBeLessThanOrEqual(mass.clientWidth);
  expect(mass.dokument).toBeLessThanOrEqual(mass.innerWidth);
});

test("desktop: „Alle Apps“ bleibt ab 768px in der Seitenleiste", async ({ page }) => {
  /*
   * Die Gegenprobe zur Zusage darueber. Bis zum Menue (IDA-347, Etappe 2) war
   * das Panel am Desktop ein Popover am Ausloeser in der Kopfzeile; jetzt ist
   * es die zweite Ebene der Seitenleiste und ersetzt dort die Seitenliste. Es
   * darf also weder ueber die Leiste hinausragen noch den Inhalt daneben
   * ueberdecken — das saehe die 390px-Messung nicht, dort ist das Blatt ohnehin
   * vollbreit.
   */
  await page.setViewportSize({ width: 1280, height: 720 });
  await devLogin(page, { host: "portal.localtest.me", groups: "alpha-users" });
  await oeffneAlleApps(page);

  const mass = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="app-panel"]')!.getBoundingClientRect();
    const leiste = document.querySelector('[data-testid="suite-header"]')!.getBoundingClientRect();
    return {
      panelLinks: Math.round(panel.left),
      panelRechts: Math.round(panel.right),
      leisteLinks: Math.round(leiste.left),
      leisteRechts: Math.round(leiste.right),
    };
  });
  console.log(`Alle Apps bei 1280x720: ${JSON.stringify(mass)}`);
  expect(mass.leisteRechts).toBeLessThan(400);
  expect(mass.panelLinks).toBeGreaterThanOrEqual(mass.leisteLinks);
  expect(mass.panelRechts).toBeLessThanOrEqual(mass.leisteRechts);
});

test("mobil: der Drawer schlieszt sich nach der Wahl eines Navigationsziels", async ({ page }) => {
  /*
   * DER ZWEITE GEMELDETE DEFEKT. `next/link` navigiert clientseitig — die Seite
   * wird nicht neu geladen, und `Drawer.onClose` feuert nur bei Maske,
   * Schlieszkreuz und Escape. Ohne ein eigenes `setOffen(false)` stand der
   * Drawer nach dem Klick weiter ueber der frisch aufgerufenen Seite.
   *
   * feedback-Admin und NICHT das anonyme `qr`, obwohl letzteres billiger waere:
   * `qr` traegt abgemeldet GENAU EINEN Navigationseintrag („Generator", href
   * `/`) — ein Klick darauf verlaesst die Modulwurzel nicht, und ohne echten
   * Seitenwechsel bewiese der Test nicht, was er behauptet (gemessen: der
   * Locator auf den zweiten Eintrag lief in den Timeout). `feedback` hat
   * „Uebersicht" UND „Vergleich", dieselbe Route wie die Aktivmarkierungs-Tests
   * weiter unten in dieser Datei.
   *
   * `toBeHidden` und nicht `toHaveCount(0)`: der Drawer traegt `forceRender`,
   * sein Inhalt bleibt im DOM. Und die Zusage endet nicht an der Sichtbarkeit —
   * die MASKE ist es, die die Seite unbenutzbar machte; `click` auf einen
   * Seiteninhalt schlaegt fehl, solange sie Zeiger abfaengt.
   */
  await devLogin(page, {
    host: "feedback.localtest.me",
    groups: "feedback-admin",
    callbackPath: "/",
  });
  const blatt = await oeffneMenue(page);

  await blatt
    .getByTestId("nav-link")
    .filter({ hasText: "Vergleich" })
    .click();

  await expect(page).toHaveURL(/\/vergleich$/);
  await expect(page.getByTestId("suite-drawer")).toBeHidden();
  await expect(page.getByTestId("menue-knopf")).toHaveAttribute("aria-expanded", "false");
  // Die Seite darunter ist wieder bedienbar — keine Maske, die Klicks frisst.
  // `trial` klickt nicht wirklich, sondern prueft nur, ob der Punkt getroffen
  // wuerde ("intercepts pointer events") — dieselbe Bauform wie beim
  // Stapelkontext-Test weiter unten.
  await page.getByTestId("menue-knopf").click({ trial: true, timeout: 2000 });
});

test("mobil: die Ort-Zeile bleibt einzeilig", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "alpha-users" });
  const kopf = page.getByTestId("suite-header");
  const mass = await kopf.evaluate((el) => ({
    kopf: el.getBoundingClientRect().height,
    knopf: document.querySelector('[data-testid="menue-knopf"]')!.getBoundingClientRect().height,
  }));
  console.log(`Ort-Zeile bei 390x844: ${JSON.stringify(mass)}`);
  // Der Ort-Knopf ist ein Tap-Ziel (mindestens 44px, Falle 4) und die Zeile EINE
  // Zeile: bricht sie um oder waechst ein zweiter Block hinein, wird sie hoeher.
  expect(mass.knopf).toBeGreaterThanOrEqual(44);
  expect(mass.kopf).toBeLessThanOrEqual(72);
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
  await page.goto(`http://qr.localtest.me:${E2E_PORT}/`);
  await expect(page.getByTestId("modulleiste")).toBeHidden();
  const gesamt = await page.evaluate(
    () => document.querySelector('[data-testid="suite-header"]')!.getBoundingClientRect().bottom,
  );
  console.log(`Unterkante der Kopfzeile mit Modulleiste-Slot bei 390x844: ${gesamt}px`);
  expect(gesamt).toBeLessThanOrEqual(72);
});

test("mobil: abmelden haengt am Nutzermenue am Fuss des Blatts", async ({ page }) => {
  /*
   * Seit dem Menue (IDA-347, Etappe 2) steht das Nutzermenue am Telefon am Fuss
   * des Blatts (`nutzermenue-drawer`) — die Ort-Zeile traegt nur den Ort-Knopf.
   * Das Menue selbst entsteht erst beim Oeffnen (kein `forceRender`), vorher
   * gibt es `abmelden` nicht.
   *
   * Zuerst die Zusage, dass `aria-expanded` am Ort-Knopf nach dem Schlieszen
   * wieder stimmt: `setOffen(false)` haengt an `Drawer.onClose`, und Escape
   * laeuft ueber genau diesen Weg. Faende es nicht statt, meldete der Knopf
   * dauerhaft "offen". Mit einer Zusicherung dazwischen, nicht bloss mit einem
   * `press`: eine noch ausblendende Maske faengt Klicks weiterhin ab.
   */
  await devLogin(page, { host: "portal.localtest.me", groups: "" });
  await oeffneMenue(page);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("suite-drawer")).toBeHidden();
  await expect(page.getByTestId("menue-knopf")).toHaveAttribute("aria-expanded", "false");

  await expect(page.getByTestId("abmelden")).toHaveCount(0);
  await oeffneNutzermenue(page);
  await expect(page.getByTestId("abmelden")).toBeVisible();
});

test("mobil: anonym steht der Anmelden-Weg in der Kopfzeile", async ({ page }) => {
  // `qr` ist `requiresAuth: false` — die einzige Modulseite, die sich ohne
  // Sitzung ueberhaupt aufrufen laesst.
  await page.goto(`http://qr.localtest.me:${E2E_PORT}/`);
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
        groups: "feedback-admin",
        callbackPath: "/",
      });
      await expect(page.getByTestId("modulleiste")).toBeVisible(); await warteAufSpaltenaufteilung(page);

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
       * Und die Struktur selbst, nicht nur ihr Symptom. Seit dem Menue
       * (IDA-347, Etappe 2) gibt es keine Kopfzeile mehr: die Seitenliste
       * steht IN der Leiste links (`suite-header`), und der Inhalt beginnt
       * rechts davon. In EINEM Lesevorgang gemessen (Begruendung am
       * Scroll-Test unten).
       */
      const mass = await page.evaluate(() => {
        const kopf = document.querySelector('[data-testid="suite-header"]')!.getBoundingClientRect();
        const nav = document.querySelector('[data-testid="modulleiste"]')!.getBoundingClientRect();
        const inhalt = document.querySelector(".ant-layout-content")!.getBoundingClientRect();
        return { kopfLinks: kopf.left, kopfRechts: kopf.right, navLinks: nav.left, navRechts: nav.right, inhalt: inhalt.left };
      });
      expect(mass.navLinks).toBeGreaterThanOrEqual(mass.kopfLinks);
      expect(mass.navRechts).toBeLessThanOrEqual(mass.kopfRechts + 1);
      expect(mass.inhalt).toBeGreaterThanOrEqual(mass.kopfRechts - 1);
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
    await page.goto(`http://qr.localtest.me:${E2E_PORT}/`);
    await expect(page.getByTestId("menue-knopf")).toBeHidden();
    await page.getByTestId("anmelden").click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Modulnavigation am laufenden Server", () => {
  // Desktop-Viewport (Standard), weil `.sider`/`modulleiste` dort sichtbar ist.
  test.use({ viewport: { width: 1280, height: 720 } });

  test("steht als Seitenleiste links in voller Hoehe, ohne Kopfzeile darueber", async ({ page }) => {
    /*
     * Bis zum Menue (IDA-347, Etappe 2) stand hier „UNTER der Kopfzeile, nicht
     * neben dem Avatar" — der Befund von damals (die Modulnavigation rechts
     * neben dem Avatar bei x=981, y=-1) betraf eine Kopfzeile, die es in
     * `FullShell` nicht mehr gibt. Die Zusage an die neue Bauform: das Menue
     * ist eine Spalte am linken Rand ueber die volle Fensterhoehe, die
     * Seitenliste steht darin, und nichts liegt darueber.
     */
    await devLogin(page, {
      host: "feedback.localtest.me",
      groups: "feedback-admin",
      callbackPath: "/",
    });
    await expect(page.getByTestId("modulleiste")).toBeVisible();
    const mass = await page.evaluate(() => {
      const kopf = document.querySelector('[data-testid="suite-header"]')!.getBoundingClientRect();
      const nav = document.querySelector('[data-testid="modulleiste"]')!.getBoundingClientRect();
      return { kopf: { x: kopf.x, y: kopf.y, w: kopf.width, h: kopf.height }, navX: nav.x, navRechts: nav.right, fenster: window.innerHeight };
    });
    console.log(`1280px: ${JSON.stringify(mass)}`);
    expect(mass.kopf.x).toBe(0);
    expect(mass.kopf.y).toBe(0);
    expect(Math.round(mass.kopf.h)).toBe(mass.fenster);
    expect(mass.kopf.w).toBeLessThan(400);
    expect(mass.navX).toBeGreaterThanOrEqual(0);
    expect(mass.navRechts).toBeLessThanOrEqual(mass.kopf.w + 1);

    // Und die beiden Zusagen der Mittelbreiten gelten hier ebenso.
    await warteAufSpaltenaufteilung(page); const quer = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(quer.scrollWidth).toBeLessThanOrEqual(quer.innerWidth);
    // `closest("a")` findet hier nichts (angemeldeter Titel = `<strong>` im
    // App-Knopf, einem `<button>`) — der Fallback `?? el` misst dann den
    // `<strong>` selbst, der in `.appKnopfText strong` klippt. Ausfuehrliche
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
      groups: "feedback-admin",
      callbackPath: "/vergleich",
    });
    const aktiv = page.locator('[data-testid="modulleiste"] a[aria-current="page"]');
    await expect(aktiv).toHaveCount(1);
    await expect(aktiv).toHaveText("Vergleich");
  });

  test("markiert die Uebersicht auf der Modulwurzel", async ({ page }) => {
    await devLogin(page, {
      host: "feedback.localtest.me",
      groups: "feedback-admin",
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
    await page.goto(`http://qr.localtest.me:${E2E_PORT}/wifi`);
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
 * SEIT DEM MENUE (IDA-347, Etappe 2) TRAEGT NUR NOCH `MinimalShell` DEN
 * STREIFEN (`SuiteRahmen`, `qr`); `FullShell` hat keine Kopfzeile und keinen
 * Streifen mehr (Haarlinie). Beides wird unten belegt.
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

    test("der Markenstreifen steht nur noch ueber MinimalShell, 5px hoch in Markenrot", async ({
      page,
    }) => {
      // `qr` (MinimalShell, `SuiteRahmen`) traegt ihn unveraendert, anonym erreichbar.
      await page.goto(`http://qr.localtest.me:${E2E_PORT}/`);
      const streifen = streifenLocator(page);
      await expect(streifen).toBeVisible();
      await expect(streifen).toHaveCSS("height", "5px");
      await expect(streifen).toHaveCSS("background-color", "rgb(200, 0, 15)");

      // `FullShell` (`MenueRahmen`): die Leiste ist das erste Kind des Rahmens,
      // davor steht nichts — und nichts in Markenrot.
      await devLogin(page, { host: "portal.localtest.me", groups: "" });
      await expect(page.getByTestId("suite-header")).toBeVisible();
      await expect(streifenLocator(page)).toHaveCount(0);
    });

    test("der aktive Navigationseintrag ist eine leise Flaeche mit Gewicht 600, ohne rote Kante", async ({
      page,
    }) => {
      /*
       * Haarlinie (IDA-347, Etappe 2): `.eintrag[aria-current]` in
       * `menue.module.css` traegt `--iuk-flaeche-aktiv` als Hintergrund, Tinte
       * als Schrift und Gewicht 600 — keinen roten Linksakzent mehr (der 3px-
       * Akzent der alten Seitenleiste ist entfallen). Zugesichert werden die
       * drei Traeger einzeln, weil einer allein nicht reicht: ohne den
       * Hintergrund bliebe der Ausfall von `--iuk-flaeche-aktiv` unbemerkt,
       * ohne den Vergleich mit dem Nachbarn ein Wert, der zufaellig auf jedem
       * Eintrag steht.
       *
       * feedback-admin auf der Modulwurzel markiert die Uebersicht mit
       * `aria-current="page"`.
       */
      await devLogin(page, {
        host: "feedback.localtest.me",
        groups: "feedback-admin",
        callbackPath: "/",
      });
      const aktiv = page.locator('[data-testid="modulleiste"] a[aria-current]');
      await expect(aktiv).toHaveCount(1);
      await expect(aktiv).toHaveCSS("font-weight", "600");
      await expect(aktiv).toHaveCSS("border-left-width", "0px");
      const farben = await page.evaluate(() => {
        const a = document.querySelector('[data-testid="modulleiste"] a[aria-current]')!;
        const b = document.querySelector('[data-testid="modulleiste"] a:not([aria-current])')!;
        return {
          aktiv: getComputedStyle(a).backgroundColor,
          andere: getComputedStyle(b).backgroundColor,
          aktivSchrift: getComputedStyle(a).color,
          andereSchrift: getComputedStyle(b).color,
        };
      });
      console.log(`Aktivmarkierung: ${JSON.stringify(farben)}`);
      expect(farben.aktiv).not.toBe("rgba(0, 0, 0, 0)");
      expect(farben.aktiv).not.toBe(farben.andere);
      expect(farben.aktivSchrift).not.toBe(farben.andereSchrift);
      expect(farben.aktiv).not.toBe("rgb(200, 0, 15)");
    });

    test("die Display-Familie kommt im Modultitel an", async ({ page }) => {
      await devLogin(page, { host: "portal.localtest.me", groups: "" });
      const titel = page.getByTestId("module-title");
      const familie = await titel.evaluate((el) => getComputedStyle(el).fontFamily);
      // Seit der Haarlinie (IDA-347) ist die Display-Rolle Geist. Der Fallback-Pfad
      // war frueher "Arial Narrow" (--font-display nirgends deklariert); die erste
      // Familie im Stapel faengt genau diesen Rueckfall.
      expect(familie.split(",")[0], `Modultitel rendert in: ${familie}`).toContain("Geist");
    });
  });

  test("mobil steht die Ort-Zeile ganz oben — kein Streifen davor", async ({ page }) => {
    // Viewport 390x844 kommt vom Datei-weiten `test.use` oben.
    //
    // DER 390er LAUF IST DER GEGENPART ZUM DESKTOP-STREIFENTEST: am Telefon ist
    // `suite-header` die Ort-Zeile ueber dem Inhalt. Stuende davor noch ein
    // Streifen, laege sie nicht bei y=0.
    await devLogin(page, { host: "portal.localtest.me", groups: "" });
    const box = (await page.getByTestId("suite-header").boundingBox())!;
    expect(box.y).toBe(0);
    expect(box.width).toBe(390);
    await expect(streifenLocator(page)).toHaveCount(0);
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

  test("das Menue erbt dem App-Knopf keine 64px-Zeilenhoehe", async ({ page }) => {
    /*
     * Falle 8: antd setzt auf `.ant-layout-header` ein `line-height: 64px` und
     * vererbt es jedem Kind. `MenueRahmen` nimmt keinen antd-`Header` mehr,
     * `.kopf` setzt trotzdem `line-height: normal` am gemeinsamen Vorfahren.
     * Ob das wirkt, weiss nur der Browser — gemessen am App-Knopf, weil er
     * zweizeilig ist (App und Bereich) und eine geerbte Zeilenhoehe ihn auf
     * ueber 128px aufblaehte.
     */
    await devLogin(page, { host: "portal.localtest.me", groups: "" });

    const knopf = page.getByTestId("app-umschalter");
    await expect(knopf).toBeVisible();
    expect(await knopf.evaluate((el) => getComputedStyle(el).lineHeight)).not.toBe("64px");
    const hoehe = (await knopf.boundingBox())!.height;
    expect(hoehe).toBeGreaterThanOrEqual(44);
    expect(hoehe).toBeLessThan(72);
  });

  test("ein Panel-Eintrag ist eine Zeile, keine Fläche", async ({ page }) => {
    await devLogin(page, { host: "portal.localtest.me", groups: "" });
    const panel = await oeffneAlleApps(page);

    const eintrag = panel.getByTestId("app-eintrag").first();
    await expect(eintrag).toBeVisible();
    expect((await eintrag.boundingBox())!.height).toBeLessThan(56);
  });

  test("nur die gezeigte Ebene ist bedienbar", async ({ page }) => {
    /*
     * Bis zum Menue (IDA-347, Etappe 2) stand hier „das offene Panel liegt
     * ueber der Seitenleiste" — ein Stapelkontext zwischen Kopfzeile und Leiste,
     * den es nicht mehr gibt. Die Frage dahinter bleibt: ist das, was man
     * sieht, auch das, was man trifft? Beide Ebenen stehen nebeneinander in der
     * Spur; die verdeckte ist `inert`. Nach dem Wechsel muss der erste
     * App-Eintrag treffbar sein und ein Seiten-Eintrag NICHT mehr.
     *
     * `trial` klickt nicht wirklich, sondern prueft nur, ob der Punkt getroffen
     * wuerde. Fuer den verdeckten Eintrag zusaetzlich `inert` am Vorfahren:
     * eine fehlschlagende Probe allein saehe gleich aus wie ein langsamer Test.
     */
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
    await expect(page.getByTestId("modulleiste")).toBeVisible();
    await page.getByTestId("nav-link").first().click({ trial: true, timeout: 2000 });

    const panel = await oeffneAlleApps(page);
    const ersterEintrag = panel.getByTestId("app-eintrag").first();
    await expect(ersterEintrag).toBeVisible();
    await ersterEintrag.click({ trial: true, timeout: 2000 });
    expect(
      await page.getByTestId("nav-link").first().evaluate((el) => !!el.closest("[inert]")),
    ).toBe(true);
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

  test("die Leiste bleibt beim Scrollen in voller Hoehe stehen", async ({ page }) => {
    /*
     * Bis zum Menue (IDA-347, Etappe 2) hiess dieser Test „die Kopfzeile bleibt
     * stehen und laesst kein Loch ueber der Leiste": die Leiste klebte bei 64px
     * unter einer Kopfzeile, die mitscrollte. Die Kopfzeile ist entfallen; die
     * Zusage an die neue Bauform ist, dass die Leiste (`suite-header`,
     * `.kopf`: `position: sticky`, `100dvh`) nach dem Scrollen weiter bei y=0
     * beginnt und das Fenster ganz fuellt. Der Defekt waere auch hier ohne
     * Scrollen unsichtbar — deshalb das `wheel`.
     */
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
    await expect(page.getByTestId("modulleiste")).toBeVisible();
    // `toHaveCSS` faellt LAUT, falls die Regel gar nicht kommt (CSS-Modul unter
    // `next dev` nachgereicht), statt still den falschen Zustand zu vermessen.
    await expect(page.getByTestId("suite-header")).toHaveCSS("position", "sticky");
    await page.mouse.move(900, 400);
    await page.mouse.wheel(0, 600);
    /*
     * AUF DAS SCROLLEN WARTEN, NICHT NUR ES AUSLOESEN — und das ist ein Befund,
     * kein vorsorgliches Warten. `mouse.wheel` schickt das Ereignis ab; das
     * Scrollen selbst passiert danach. Ohne dieses Warten stand `window.scrollY`
     * in DREI von drei Wiederholungen (`--repeat-each=3`) noch auf 0, und die
     * Messung unten beschrieb die UNGESCROLLTE Seite.
     */
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    /*
     * EIN LESEVORGANG fuer alle Werte. Zwei `boundingBox()`-Aufrufe sind zwei
     * Playwright-Rundlaeufe und damit zwei Zeitpunkte; in `e2e/files-mobil.spec.ts`
     * (`kaesten`) steht der gemessene Fall ausgeschrieben.
     */
    const mass = await page.evaluate(() => {
      const kopf = document.querySelector('[data-testid="suite-header"]')!.getBoundingClientRect();
      return { scrollY: window.scrollY, oben: kopf.top, hoehe: kopf.height, fenster: window.innerHeight };
    });
    console.log(`Leiste nach wheel(0,600): ${JSON.stringify(mass)}`);
    expect(mass.scrollY).toBeGreaterThan(0);
    expect(Math.abs(mass.oben)).toBeLessThanOrEqual(1);
    expect(Math.abs(mass.hoehe - mass.fenster)).toBeLessThanOrEqual(1);
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
     * Kopfzeile (heute die Ort-Zeile, `Navigator.tsx`, `data-testid="menue-knopf"`,
     * Klasse `.nurMobil`). Er steht bei 1280px auf `display:none` und ist trotzdem
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
     * (`lagerbuch-mobil.spec.ts:312`, `mobil-admin.spec.ts`, Test „kein
     * Bedienelement ist schmaler oder niedriger als 44px").
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

    await page.goto(`http://qr.localtest.me:${E2E_PORT}/`);
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
    }); await warteAufSpaltenaufteilung(page);

    const breiten = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(breiten.scroll).toBeLessThanOrEqual(breiten.client + 1);
    expect((await page.getByTestId("module-title").boundingBox())!.width).toBeGreaterThan(0);
  });
});

/*
 * DAS SCHMALSTE REAL VERBREITETE GERAET (320px, iPhone SE 1. Generation und
 * jedes Geraet, das sich so meldet). Es ist nicht dasselbe wie 390: dort passt
 * die Kopfzeile, hier nicht mehr von selbst.
 *
 * GEMESSEN am 2026-08-29, anonym: `.rechts` trug `min-width: 0` und schrumpfte
 * damit unter seine Inhaltsbreite — der Anmelden-Knopf tat es NICHT und stand
 * mit seiner rechten Kante bei 330px in einem 320px-Fenster
 * (`documentElement.scrollWidth` 330). Zoom ist suiteweit gesperrt
 * (`app/layout.tsx`), ein waagerechter Ueberlauf also unheilbar. Die
 * Gegenmassnahme steht in `core/shell/shell.module.css`; dass sie WIRKT, kann
 * nur ein Browser sagen — ein Quelltext-Scan kennt die Breite eines Knopfes
 * nicht.
 *
 * Anonym, weil genau dieser Zustand den breiten Knopf zeigt: angemeldet steht
 * dort ein runder Avatar von 56px, und der Defekt tritt gar nicht auf.
 */
test.describe("Schmalstes Geraet (320px)", () => {
  test.use({ viewport: { width: 320, height: 844 } });

  test("anonym scrollt bei 320px nichts seitwaerts und der Anmelden-Knopf bleibt im Fenster", async ({
    page,
  }) => {
    // `qr` ist `requiresAuth: false` — dieselbe Begruendung wie beim
    // 390px-Lauf oben.
    await page.goto(`http://qr.localtest.me:${E2E_PORT}/`);
    await expect(page.getByTestId("anmelden")).toBeVisible();

    const quer = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      knopfRechts: Math.round(
        document.querySelector("[data-testid='anmelden']")!.getBoundingClientRect().right,
      ),
    }));
    console.log(
      `320px anonym: scrollWidth ${quer.scrollWidth}, innerWidth ${quer.innerWidth}, Anmelden-Kante ${quer.knopfRechts}`,
    );
    expect(quer.scrollWidth).toBeLessThanOrEqual(quer.innerWidth);
    expect(quer.knopfRechts).toBeLessThanOrEqual(quer.innerWidth);

    // Und der Titel gibt nach, statt den Knopf hinauszuschieben — er bleibt
    // sichtbar (ellipsiert), wird aber nie 0.
    const titel = await page
      .getByTestId("module-title")
      .evaluate((el) => Math.round((el.closest("a") ?? el).getBoundingClientRect().width));
    console.log(`320px anonym: sichtbare Titelbreite ${titel}px`);
    expect(titel).toBeGreaterThan(0);
  });
});

test.describe("Seitenleiste auf dem Tablet", () => {
  // 768×1024 = iPad hochkant: die kleinste Breite, an der die Leiste steht.
  test.use({ viewport: { width: 768, height: 1024 } });

  test("gibt jeder Zeile und dem App-Knopf 44px (ARBEITSDICHTE)", async ({ page }) => {
    /*
     * DRK-420, Betreiberentscheidung 2026-09-24. Die Leiste lief auf 40px mit
     * der Begründung, sie werde mit Maus bedient — ab 768px steht sie aber auch
     * auf dem Tablet unter dem Finger. Ob die 44 nach Polsterung, Rahmen und
     * Kaskade im Browser ANKOMMEN, weiß nur der Browser.
     *
     * Seit dem Menue (IDA-347, Etappe 2) sind die Abschnitte keine Schalter mehr,
     * sondern Ueberschriften (`nav-abschnitt`, ein `div`): sie zaehlen nicht als
     * Bedienelement und duerfen kein Knopf sein. Das Lagerbuch, weil nur seine
     * Leiste (21 Einträge) Abschnitte trägt.
     */
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
    const leiste = page.getByTestId("modulleiste");
    await expect(leiste).toBeVisible();
    const zeilen = await leiste.locator('[data-testid="nav-link"]').evaluateAll((els) =>
      els
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => Math.round(el.getBoundingClientRect().height)),
    );
    const knopf = (await page.getByTestId("app-umschalter").boundingBox())!.height;
    console.log(`768px: Zeilen ${JSON.stringify(zeilen)}, App-Knopf ${knopf}`);
    expect(zeilen.length).toBeGreaterThan(0);
    expect(Math.min(...zeilen)).toBeGreaterThanOrEqual(44);
    expect(knopf).toBeGreaterThanOrEqual(44);
    expect(await leiste.getByTestId("nav-abschnitt").count()).toBeGreaterThan(0);
    await expect(leiste.locator('button[data-testid="nav-abschnitt"]')).toHaveCount(0);
  });
});
