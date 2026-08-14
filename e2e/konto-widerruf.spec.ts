import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";

/**
 * DIE NAHT, DIE SONST NIEMAND SIEHT.
 *
 * Der Sitzungswiderruf greift im `jwt`-Callback, und der laeuft auf dem
 * Proxy-Pfad (`src/proxy.ts`) bei JEDER Anfrage — dort liest er SQLite. Vitest
 * kann dort nicht hinsehen (kein Server, kein echtes Cookie), `pnpm build`
 * ebensowenig. Nur ein echter Abruf zeigt, ob `better-sqlite3` in dieser
 * Laufzeit ueberhaupt ankommt.
 */
test("die Sitzung ueberlebt eine Navigation — der Widerrufs-Lesevorgang im Proxy traegt", async ({
  page,
}) => {
  await devLogin(page, { host: "portal.localtest.me" });
  await page.goto("http://portal.localtest.me:3100/");
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByTestId("suite-header")).toBeVisible();
});

test("der Widerruf sperrt eine zweite, unabhaengige Sitzung aus", async ({ browser }) => {
  /*
   * ZWEI BROWSER-KONTEXTE, NICHT ZWEI TABS: nur getrennte Kontexte haben
   * getrennte Cookie-Speicher und sind damit wirklich „zwei Geraete". In einem
   * zweiten Tab teilte man dasselbe Cookie, und der Test bewiese nichts.
   */
  const geraetA = await browser.newContext();
  const geraetB = await browser.newContext();
  const seiteA = await geraetA.newPage();
  const seiteB = await geraetB.newPage();

  const email = "widerruf@localtest.me";
  await devLogin(seiteA, { host: "portal.localtest.me", email });
  await devLogin(seiteB, { host: "portal.localtest.me", email });

  // Vorbedingung: B ist wirklich angemeldet, sonst misst der Test nichts.
  await seiteB.goto("http://portal.localtest.me:3100/");
  await expect(seiteB).not.toHaveURL(/\/login/);

  await seiteA.goto("http://portal.localtest.me:3100/profil");
  await seiteA.getByTestId("alle-abmelden").click();
  await seiteA.getByTestId("alle-abmelden-ja").click();
  /*
   * Gewartet wird darauf, dass A die Profilseite VERLAESST — nicht darauf, dass
   * A beim Login ankommt. `signOut` ruft die Server Action ab und navigiert
   * ERST DANACH; der Widerruf steht also, sobald sich die Adresse bewegt.
   *
   * Auf `/login` zu warten waere hier falsch: `oidc-signout` baut sein Ziel aus
   * `AUTH_URL`, und das ist in dieser E2E-Umgebung gar nicht gesetzt (siehe
   * `webServer.env` in playwright.config.ts) — der Rueckfall ist
   * `http://localhost:3000`, wo nichts lauscht. Der Test wuerde an einem
   * Umstand der Testumgebung scheitern statt an der Sache.
   */
  await seiteA.waitForURL((url) => !url.pathname.includes("/profil"), { timeout: 45_000 });

  // B navigiert und landet beim Login — ohne dass B irgendetwas getan haette.
  await seiteB.goto("http://portal.localtest.me:3100/");
  await expect(seiteB).toHaveURL(/\/login/);

  await geraetA.close();
  await geraetB.close();
});

test("nach dem Widerruf traegt eine frische Anmeldung wieder", async ({ page }) => {
  // Sonst waere der Knopf eine Falle: einmal gedrueckt, nie wieder hinein.
  const email = "widerruf-neu@localtest.me";
  await devLogin(page, { host: "portal.localtest.me", email });
  await page.goto("http://portal.localtest.me:3100/profil");
  await page.getByTestId("alle-abmelden").click();
  await page.getByTestId("alle-abmelden-ja").click();
  await page.waitForURL((url) => !url.pathname.includes("/profil"), { timeout: 45_000 });

  await devLogin(page, { host: "portal.localtest.me", email });
  await page.goto("http://portal.localtest.me:3100/");
  await expect(page).not.toHaveURL(/\/login/);
});
