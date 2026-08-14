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
  /*
   * DER SYNCHRONISATIONSPUNKT, und warum es NICHT die Adresse sein kann.
   *
   * Der Widerruf steht, sobald `signOut` laeuft: `bestaetigt()` in
   * `ProfilAnsicht` ruft ERST die Server Action ab und DANN `signOut`. Die
   * Anfrage an `/api/auth/oidc-signout` ist damit der frueheste Zeitpunkt, an
   * dem der Widerruf sicher geschrieben ist.
   *
   * Auf die ADRESSE zu warten scheitert hier, und zwar gemessen: `oidc-signout`
   * baut sein Ziel aus `AUTH_URL`, das in dieser E2E-Umgebung gar nicht gesetzt
   * ist (`webServer.env` in playwright.config.ts). Der Rueckfall ist
   * `http://localhost:3000`, wo nichts lauscht — `waitForURL` WIRFT dann
   * `net::ERR_CONNECTION_REFUSED`, statt auf dem Praedikat aufzuloesen. Der
   * Test waere an einem Umstand der Testumgebung gescheitert, nicht an der
   * Sache.
   *
   * Der Warteposten wird VOR dem Klick scharf gemacht; danach waere die
   * Anfrage womoeglich schon durch.
   */
  const abgemeldet = seiteA.waitForRequest((req) => req.url().includes("/api/auth/oidc-signout"), {
    timeout: 45_000,
  });
  await seiteA.getByTestId("alle-abmelden-ja").click();
  await abgemeldet;

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
  // Derselbe Warteposten wie oben, aus demselben Grund.
  const abgemeldet = page.waitForRequest((req) => req.url().includes("/api/auth/oidc-signout"), {
    timeout: 45_000,
  });
  await page.getByTestId("alle-abmelden-ja").click();
  await abgemeldet;

  await devLogin(page, { host: "portal.localtest.me", email });
  await page.goto("http://portal.localtest.me:3100/");
  await expect(page).not.toHaveURL(/\/login/);
});
