import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST } from "./helpers/lagerbuch";

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
    "Fahrzeuge & Geräte",
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
  // Muster wie lagerbuch-etiketten.spec.ts:152, feedback.spec.ts:524/749 und
  // files-fileshare.spec.ts:499.
  await page.context().clearCookies();
  // Portal: ohne Verwaltungsrecht liefert `navFuerPortal` eine leere Liste
  // (`layout.tsx`) — die Leiste haengt an `nav.length > 0` (`SuiteRahmen.tsx`),
  // ein Modul ohne Navigation bekommt also gar keine Leiste.
  await devLogin(page, { host: "portal.localtest.me", groups: "", callbackPath: "/" });
  await expect(page.getByTestId("modulleiste")).toHaveCount(0);
});
