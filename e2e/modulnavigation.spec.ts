import { test, expect, type Locator } from "@playwright/test";
import { devLogin } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * Der echte Abruf zu Plan B: die Lagerbuch-Verwaltung bekommt fünf Abschnitte
 * in einer Seitenleiste statt fünfzehn gleichrangiger Einträge in einer
 * umbrechenden Zeile. Seit 2026-08-13 (Navigations-Umbau) bekommt JEDES Modul
 * mit Navigation dieselbe Leiste, ob mit oder ohne Abschnitte — nur ein Modul
 * ganz ohne Navigation bleibt ohne sie. Beides hängt an einem laufenden Server
 * (`Sider`-Importpfad, echtes CSS unter den drei Breite-Klassen) —
 * `typecheck`, `pnpm build` und Vitest sehen es nicht.
 *
 * Gruppe und Host kommen aus `./helpers/lagerbuch`, nicht als Literal: dieselbe
 * Konstante steht in `playwright.config.ts` in `webServer.env`
 * (`SUITE_ADMIN_GROUP_LAGERBUCH`). Zwei Literale liefen auseinander, ohne dass
 * ein Lauf rot würde — er wäre GEGENTEILIG grün, weil der Spec ohne passende
 * Gruppe den 404 aus §11.5, Zustand 19 bezeugt statt die Seitenleiste.
 */

test("ab 768px steht die Navigation als Leiste mit Abschnitten", async ({ page }) => {
  await devLogin(page, {
    host: LAGERBUCH_HOST,
    groups: LAGERBUCH_ADMIN_GRUPPE,
    callbackPath: "/verwaltung",
  });

  const leiste = page.getByTestId("modulleiste");
  await expect(leiste).toBeVisible();
  await expect(leiste.getByTestId("nav-abschnitt")).toHaveText([
    "Bestand",
    "Einheiten & Geräte",
    "Prüfungen",
    "Protokoll",
    "Einrichtung",
  ]);
});

test("die Aktivmarkierung steht genau einmal und am richtigen Eintrag", async ({ page }) => {
  await devLogin(page, {
    host: LAGERBUCH_HOST,
    groups: LAGERBUCH_ADMIN_GRUPPE,
    callbackPath: "/verwaltung/import",
  });
  const leiste = page.getByTestId("modulleiste");
  await expect(leiste.locator("[aria-current]")).toHaveCount(1);
  await expect(leiste.locator("[aria-current]")).toHaveText("Import");
  await expect(leiste.locator("[aria-current]")).toHaveAttribute("aria-current", "page");
});

test("unter 768px liegt die Navigation im Drawer, mit denselben Abschnitten", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await devLogin(page, {
    host: LAGERBUCH_HOST,
    groups: LAGERBUCH_ADMIN_GRUPPE,
    callbackPath: "/verwaltung",
  });

  const leiste = page.getByTestId("modulleiste");
  /*
   * NICHT-VAKUÄRE GEGENPROBE. `toBeHidden()` ist in Playwright auch dann wahr,
   * wenn der Knoten gar nicht existiert — bei einem Tippfehler im
   * `data-testid` wäre dieser Test also blind grün und würde nichts über den
   * Breakpoint aussagen. `toHaveCount(1)` beweist zuerst, dass die Leiste
   * tatsächlich im DOM steht (der `Sider` wird unter 768px NICHT weggelassen,
   * siehe `SuiteRahmen.tsx` — die Umschaltung läuft rein über CSS). Erst danach
   * sagt `toBeHidden()` etwas darüber, dass sie dort unsichtbar bleibt.
   */
  await expect(leiste).toHaveCount(1);
  await expect(leiste).toBeHidden();

  await page.getByTestId("menue-knopf").click();
  const drawer = page.getByTestId("suite-drawer");
  await expect(drawer.getByTestId("nav-abschnitt").first()).toHaveText("Bestand");
});

test("ein Modul ohne Navigation bekommt keine Leiste", async ({ page }) => {
  /*
   * GEGENPROBE VOR DER NULL. Ohne diesen ersten Schritt wäre `toHaveCount(0)`
   * weiter unten auch dann grün, wenn der Selektor durch einen verunglückten
   * `data-testid` NIRGENDS mehr träfe — die Null bewiese dann gar nichts.
   */
  await devLogin(page, {
    host: LAGERBUCH_HOST,
    groups: LAGERBUCH_ADMIN_GRUPPE,
    callbackPath: "/verwaltung",
  });
  await expect(page.getByTestId("modulleiste")).toHaveCount(1);

  // clearCookies, sonst leitet /login einen bereits angemeldeten Nutzer sofort
  // auf "/" um (src/app/login/page.tsx: `if (session?.user) redirect("/")`)
  // und die zweite devLogin-Anmeldung liefe nicht durchs Formular — dasselbe
  // Muster wie lagerbuch-etiketten.spec.ts:152, feedback.spec.ts:532/757 und
  // files-fileshare.spec.ts:499.
  await page.context().clearCookies();
  /*
   * `gamma` und nicht mehr `portal`. Hier stand bis zu den Release Notes das
   * Portal ohne Verwaltungsrecht — `navFuerPortal` lieferte dann eine leere
   * Liste, und die Leiste haengt an `nav.length > 0` (`SuiteRahmen.tsx`). Seit
   * `/neuigkeiten` bekommt dort JEDE angemeldete Person zwei Eintraege; das
   * Portal ist damit kein Modul ohne Navigation mehr.
   *
   * Die Zusage dieses Tests gilt unveraendert weiter — sie braucht nur einen
   * Traeger, der sie noch erfuellt. `gamma` uebergibt `<Shell>` gar kein
   * `nav`-Prop (`m/gamma/layout.tsx`), ist angemeldet erreichbar und verlangt
   * keine Gruppe: derselbe Fall, eine Ebene sauberer als vorher (dort war die
   * leere Liste erst abgeleitet).
   */
  await devLogin(page, { host: "gamma.localtest.me", groups: "", callbackPath: "/" });
  await expect(page.getByTestId("modulleiste")).toHaveCount(0);
});

/**
 * DER SCHALTER EINES ABSCHNITTS — ueber testId und Textinhalt, NICHT ueber
 * `getByRole("button", { name })`.
 *
 * ⚠️ DER UNTERSCHIED IST `text-transform: uppercase` (`SCHRIFT.kicker`).
 * Chromium wendet es auf den ZUGAENGLICHEN NAMEN an; eine Rollenabfrage auf
 * „Bestand" faende den Knopf deshalb nicht, und der Fehlschlag laese sich wie
 * „der Schalter fehlt" statt wie „der Name ist gross geschrieben".
 * `hasText` vergleicht den Textinhalt, und der bleibt „Bestand".
 */
function abschnittsSchalter(bereich: Locator, titel: string): Locator {
  return bereich.getByTestId("nav-abschnitt").filter({ hasText: titel });
}

/**
 * DAS LANGE MENUE — Filter und aufklappbare Abschnitte (`NavListe`).
 *
 * WAS NUR EIN ECHTER BROWSER SIEHT, und deshalb stehen diese drei Faelle hier
 * und nicht in Vitest:
 *
 *  1. **Ob `hidden` WIRKT.** jsdom rechnet keine Layoutboxen und wertet die
 *     Kaskade fuer `display` nicht aus — `.navGruppeLinks { display: flex }`
 *     schlaegt die Browservorgabe `[hidden] { display: none }`, und ohne die
 *     Gegenregel klappte der Abschnitt SICHTBAR gar nicht zu, waehrend
 *     `aria-expanded="false"` das Gegenteil ansagt. Der DOM-Test bliebe gruen
 *     (`hidden` steht ja am Knoten), `shell-css.test.ts` haelt nur fest, dass
 *     die Regel DASTEHT. Dass sie gewinnt, weisz nur der Browser.
 *  2. **Dass der Speicher einen echten Seitenwechsel ueberlebt.** In Vitest ist
 *     ein „Neuaufbau" ein zweites `mount` im selben Prozess; hier ist es ein
 *     neues Dokument mit einem neuen React-Baum.
 *  3. **Dass Leiste und Drawer denselben Stand zeigen.** Beide stehen
 *     gleichzeitig im Baum, welche man sieht entscheidet CSS — und genau
 *     deshalb koennen sie auseinanderlaufen.
 */
test("ein zugeklappter Abschnitt verbirgt seine Einträge und übersteht den Seitenwechsel", async ({
  page,
}) => {
  await devLogin(page, {
    host: LAGERBUCH_HOST,
    groups: LAGERBUCH_ADMIN_GRUPPE,
    callbackPath: "/verwaltung/journal",
  });

  const leiste = page.getByTestId("modulleiste");
  const artikel = leiste.getByRole("link", { name: "Artikel", exact: true });
  await expect(artikel).toBeVisible();

  const bestand = abschnittsSchalter(leiste, "Bestand");
  await expect(bestand).toHaveAttribute("aria-expanded", "true");
  await bestand.click();

  // ⚠️ `toBeHidden` UND NICHT `toHaveCount(0)`: der Knoten bleibt im DOM
  // (`aria-controls` zeigt auf ihn). Gemessen wird also die CSS-Wirkung, und
  // das ist genau die Zusage, die kein anderes Tor tragen kann.
  await expect(artikel).toBeHidden();
  await expect(bestand).toBeVisible();

  // Ein echter Seitenwechsel, nicht nur ein Neurendern.
  await page.goto(lagerbuchUrl("/verwaltung/journal"), { waitUntil: "load" });
  await expect(abschnittsSchalter(leiste, "Bestand")).toHaveAttribute("aria-expanded", "false");
});

test("der Abschnitt der aufgerufenen Seite klappt wieder auf", async ({ page }) => {
  await devLogin(page, {
    host: LAGERBUCH_HOST,
    groups: LAGERBUCH_ADMIN_GRUPPE,
    callbackPath: "/verwaltung/journal",
  });

  const leiste = page.getByTestId("modulleiste");
  await abschnittsSchalter(leiste, "Bestand").click();
  await expect(leiste.getByRole("link", { name: "Artikel", exact: true })).toBeHidden();

  /*
   * DIE REGEL, DIE DAS ZUKLAPPEN GEFAHRLOS MACHT: wer per Lesezeichen in einen
   * zugeklappten Abschnitt hineinspringt, saehe sonst eine Seite, deren Platz in
   * der Navigation fehlt — die Orientierung fiele genau dann aus, wenn man sie
   * braucht.
   */
  await page.goto(lagerbuchUrl("/verwaltung/artikel"), { waitUntil: "load" });
  await expect(leiste.getByRole("link", { name: "Artikel", exact: true })).toBeVisible();
  await expect(abschnittsSchalter(leiste, "Bestand")).toHaveAttribute("aria-expanded", "true");
});

test("das Filterfeld grenzt die Leiste ein und nennt die Trefferzahl", async ({ page }) => {
  await devLogin(page, {
    host: LAGERBUCH_HOST,
    groups: LAGERBUCH_ADMIN_GRUPPE,
    callbackPath: "/verwaltung",
  });

  const leiste = page.getByTestId("modulleiste");
  const vorher = await leiste.getByTestId("nav-link").count();
  expect(vorher).toBeGreaterThan(12);

  /*
   * „etiketten" trifft BEIDE Etikettenseiten — der Fall, für den die Suche
   * mitten im Wort sucht und nicht nur am Anfang.
   *
   * ⚠️ „Ortsetiketten" ZUERST, und das ist keine Sortierung, sondern die
   * QUELLREIHENFOLGE: `filtereNav` lässt sie unangetastet, und im Abschnitt
   * „Einrichtung" steht die Ortskarte seit DRK-406 bewusst vor dem
   * Artikeletikett (die Codes, mit denen der Helfer-Weg anfängt, vor dem Bogen,
   * den man einmal beim Einrichten druckt). Wer hier alphabetisch erwartet,
   * misst eine Sortierung, die es nicht gibt — und baut sie beim „Reparieren"
   * womöglich ein.
   */
  await leiste.getByTestId("nav-filter").fill("etiketten");
  await expect(leiste.getByTestId("nav-link")).toHaveText(["Ortsetiketten", "Artikeletiketten"]);
  await expect(leiste.getByTestId("nav-filter-stand")).toHaveText(`2 von ${vorher} Einträgen`);

  // Umlaut ausgeschrieben — die Schreibweise ohne Umlauttaste muss dasselbe
  // finden wie „Prüfungen".
  await leiste.getByTestId("nav-filter").fill("pruef");
  await expect(leiste.getByTestId("nav-link")).toHaveText([
    "Checks",
    "Check durchführen",
    "BZ-Kontrolle",
  ]);

  await leiste.getByTestId("nav-filter").fill("");
  await expect(leiste.getByTestId("nav-link")).toHaveCount(vorher);
});

test("Leiste und Drawer zeigen denselben Aufklappzustand", async ({ page }) => {
  await devLogin(page, {
    host: LAGERBUCH_HOST,
    groups: LAGERBUCH_ADMIN_GRUPPE,
    callbackPath: "/verwaltung",
  });

  await abschnittsSchalter(page.getByTestId("modulleiste"), "Bestand").click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("menue-knopf").click();
  const drawer = page.getByTestId("suite-drawer");
  await expect(abschnittsSchalter(drawer, "Bestand")).toHaveAttribute("aria-expanded", "false");
});
