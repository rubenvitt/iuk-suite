import { test, expect } from "@playwright/test";
import { devLogin, oeffneMenue } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * Der echte Abruf zu Plan B: die Lagerbuch-Verwaltung bekommt fünf Abschnitte
 * in einer Seitenleiste statt fünfzehn gleichrangiger Einträge in einer
 * umbrechenden Zeile. Seit 2026-08-13 (Navigations-Umbau) bekommt JEDES Modul
 * mit Navigation dieselbe Leiste, ob mit oder ohne Abschnitte — nur ein Modul
 * ganz ohne Navigation bleibt ohne sie. Seit dem Menue (IDA-347, Etappe 2) steht
 * sie als Seitenliste im Menue von `MenueRahmen`. Beides hängt an einem laufenden
 * Server (echtes CSS am Breakpoint 768px) —
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
   * tatsächlich im DOM steht (die Seitenleiste wird unter 768px NICHT
   * weggelassen, siehe `SuiteLeiste` in `Navigator.tsx` — die Umschaltung läuft
   * rein über CSS). Erst danach sagt `toBeHidden()` etwas darüber, dass sie dort
   * unsichtbar bleibt.
   */
  await expect(leiste).toHaveCount(1);
  await expect(leiste).toBeHidden();

  const drawer = await oeffneMenue(page);
  await expect(drawer.getByTestId("modulleiste-drawer").getByTestId("nav-abschnitt")).toHaveText([
    "Bestand",
    "Einheiten & Geräte",
    "Prüfungen",
    "Protokoll",
    "Einrichtung",
  ]);
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
  // Muster in lagerbuch-etiketten.spec.ts, Fall „antwortet ohne Lagerbuch-Gruppe
  // genau wie eine Arbeitsseite", in feedback.spec.ts, Faelle „IDOR-Guard:
  // groupleader ohne Zuordnung …" und „Gruppenleiter: der Einstieg landet …",
  // und in files-fileshare.spec.ts, Fall „5 — entsperrt laedt der Download …".
  await page.context().clearCookies();
  /*
   * `gamma` und nicht mehr `portal`. Hier stand bis zu den Release Notes das
   * Portal ohne Verwaltungsrecht — `navFuerPortal` lieferte dann eine leere
   * Liste, und die Seitenliste haengt an `nav.length > 0` (`Navigator.tsx`). Seit
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
 * DAS LANGE MENUE — „Springen zu" statt Filter und aufklappbarer Abschnitte.
 *
 * Bis zum Menue (IDA-347, Etappe 2) trug die Leiste ab zwoelf Eintraegen ein
 * Filterfeld (`nav-filter`) und zuklappbare Abschnitte. Beides ist entfallen:
 * die Abschnitte sind Ueberschriften, und gesucht wird im Feld „Springen zu"
 * ueber dem Menue (`befehle.ts`) — Seiten dieser App zuerst, dann Apps und die
 * suiteweite Suche. Die drei Faelle zum Aufklappzustand (zugeklappt verborgen,
 * Seitenwechsel, Leiste und Drawer gleich) haben damit keinen Gegenstand mehr
 * und sind entfallen; die Filterzusage lebt hier am neuen Feld weiter.
 */
test("„Springen zu“ findet Seiten mitten im Wort und mit ausgeschriebenem Umlaut", async ({ page }) => {
  await devLogin(page, {
    host: LAGERBUCH_HOST,
    groups: LAGERBUCH_ADMIN_GRUPPE,
    callbackPath: "/verwaltung",
  });

  const menue = await oeffneMenue(page);
  const vorher = await menue.getByTestId("nav-link").count();
  expect(vorher).toBeGreaterThan(12);
  const feld = menue.getByTestId("befehlspalette-eingabe");
  // Seiten-Treffer sind `next/link` auf einen relativen Pfad; Apps und die
  // suiteweite Suche tragen eine volle Adresse.
  const seiten = menue.locator('[data-testid="befehl"][href^="/"]');

  /*
   * „etiketten" trifft BEIDE Etikettenseiten — der Fall, für den die Suche
   * mitten im Wort sucht und nicht nur am Anfang.
   *
   * ⚠️ „Ortsetiketten" ZUERST, und das ist keine Sortierung, sondern die
   * QUELLREIHENFOLGE: `befehle` lässt sie unangetastet, und im Abschnitt
   * „Einrichtung" steht die Ortskarte seit DRK-406 bewusst vor dem
   * Artikeletikett.
   */
  await feld.fill("etiketten");
  await expect(seiten).toHaveText([/^Ortsetiketten/, /^Artikeletiketten/]);
  // Waehrend gesucht wird, steht statt der Ebenen die Trefferliste.
  await expect(menue.getByTestId("nav-link")).toHaveCount(0);

  // Umlaut ausgeschrieben — die Schreibweise ohne Umlauttaste muss dasselbe
  // finden wie „Prüfungen" (der Abschnitt der vier Seiten).
  await feld.fill("pruef");
  await expect(seiten).toHaveText([/^Mängel/, /^Checks/, /^Check durchführen/, /^BZ-Kontrolle/]);

  await feld.fill("");
  await expect(menue.getByTestId("nav-link")).toHaveCount(vorher);
});
