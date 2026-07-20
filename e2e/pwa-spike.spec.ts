import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";
import { decodeQr } from "./helpers/decode-qr";

/**
 * Phase-2-Spike: Trägt eine domain-scoped Offline-PWA im Monolithen?
 *
 * Träger ist das Wegwerf-Modul `beta` (anonym, Minimal-Shell) — stellvertretend
 * für das spätere Modul `qr`. Geprüft wird beides: dass die PWA auf ihrem Host
 * funktioniert UND dass sie auf den anderen Hosts nicht existiert.
 *
 * Läuft in eigener Config (`playwright.pwa.config.ts`), weil Service Worker
 * einen sicheren Kontext brauchen und `*.localtest.me` über http keiner ist.
 */

const BETA = "http://beta.localtest.me:3101";
const PORTAL = "http://portal.localtest.me:3101";
const QR = "http://qr.localtest.me:3101";

// Name aus `_lib/sw-source.ts`. Bewusst dupliziert statt importiert: der Test
// soll nach einem Versionssprung auffallen und nicht stillschweigend
// mitwandern. Ein leerer Cache laesst die Poll-Zusicherung unten auflaufen.
const CACHE = "qr-pwa-v2";

test("Modul-Host liefert Manifest, Icon und SW", async ({ page, request }) => {
  await page.goto(`${BETA}/`);

  const link = page.locator('link[rel="manifest"]');
  await expect(link).toHaveAttribute("href", "/manifest.webmanifest");

  const manifest = await request.get(`${BETA}/manifest.webmanifest`);
  expect(manifest.status()).toBe(200);
  const json = await manifest.json();
  expect(json.start_url).toBe("/");
  expect(json.scope).toBe("/");
  expect(json.icons[0].src).toBe("/pwa-icon.svg");

  const icon = await request.get(`${BETA}/pwa-icon.svg`);
  expect(icon.status()).toBe(200);
  expect(icon.headers()["content-type"]).toContain("image/svg+xml");

  const sw = await request.get(`${BETA}/sw.js`);
  expect(sw.status()).toBe(200);
  expect(sw.headers()["content-type"]).toContain("javascript");
});

test("Service Worker registriert sich auf dem Modul-Host", async ({ page }) => {
  await page.goto(`${BETA}/`);
  const scope = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.scope;
  });
  expect(scope).toBe(`${BETA}/`);
});

test("Seite lädt offline aus dem SW-Cache", async ({ page, context }) => {
  await page.goto(`${BETA}/`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Der Navigations-Handler ist network-first: einmal online nachladen, damit
  // die aktuelle Seite im Cache liegt (der install-Handler cached nur "/").
  await page.reload();
  await expect(page.getByTestId("beta-content")).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("beta-content")).toBeVisible();

  // Nicht nur Standbild: die Client-Bundles müssen offline aus dem Cache kommen
  // und hydrieren, sonst trüge die spätere QR-Generierung offline nicht.
  await page.getByLabel("Eingabe").fill("funk");
  await expect(page.getByTestId("probe-output")).toHaveText("knuf");

  await context.setOffline(false);
});

test("anderer Host bleibt sauber: kein Manifest, kein SW, keine Registrierung", async ({
  page,
  request,
}) => {
  // Kernaussage des Spikes. Portal ist auth-pflichtig — die Assets müssen schon
  // *vor* dem Login fehlen, deshalb wird hier bewusst nicht eingeloggt.
  // Nicht auf den Status prüfen: der Portal-Host schickt Anonyme auf /login um,
  // das antwortet mit 200 (HTML). Der Content-Type ist die belastbare Aussage.
  const manifest = await request.get(`${PORTAL}/manifest.webmanifest`);
  expect(manifest.headers()["content-type"] ?? "").not.toContain("manifest");

  const sw = await request.get(`${PORTAL}/sw.js`);
  expect(sw.headers()["content-type"] ?? "").not.toContain("javascript");

  // Anonym: Login-Seite des Portal-Hosts rendert das beta-Layout nicht.
  await page.goto(`${PORTAL}/`);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);

  // Und eingeloggt — das ist die produktiv relevante Oberfläche. Ohne diesen
  // Schritt bewiese der Test nur etwas über die Login-Seite (derselbe blinde
  // Fleck wie bei Post-Cutover-Befund 2, wo ein Verify-Schritt nur prüfte,
  // ob überhaupt etwas lädt).
  await devLogin(page, { host: "portal.localtest.me", port: 3101, groups: "" });
  // Auf Präsenz prüfen, nicht auf Sichtbarkeit: die Spike-DB startet leer, das
  // Kachel-Grid hat dann keine Höhe. Header + Grid belegen, dass hier die
  // eingeloggte Portal-Seite steht und nicht mehr das Login.
  await expect(page.getByTestId("full-shell-header")).toBeVisible();
  await expect(page.getByTestId("portal-grid")).toHaveCount(1);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);

  const regs = await page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope),
  );
  expect(regs).not.toContain(`${PORTAL}/`);
});

/**
 * Ab hier: das echte Modul `qr` statt des Stellvertreters `beta`.
 *
 * Bewusst in dieser Datei und nicht in einer eigenen `qr-pwa.spec.ts` — der
 * Plan laesst beides zu. Diese Datei wird von `playwright.pwa.config.ts` bereits
 * erfasst und von der normalen Config ausgeschlossen; eine neue Datei muesste
 * in BEIDEN Configs nachgetragen werden, und ein vergessenes `testIgnore` liesse
 * die Tests zusaetzlich auf dem Dev-Server ohne Service Worker laufen.
 */

test("QR-Erzeugung funktioniert offline", async ({ page, context }) => {
  await page.goto(`${QR}/`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Einmal online nachladen, damit die Client-Bundles im Cache liegen.
  await page.reload();

  await context.setOffline(true);
  await page.reload();
  await page.getByLabel("Link oder Text").fill("https://offline.example");
  await page.getByRole("button", { name: /erzeugen/i }).click();
  await expect(page.getByTestId("qr-display").locator("svg")).toBeVisible();
  await context.setOffline(false);
});

/**
 * Der Kern-Einsatzfall des Moduls: einen WLAN-Zugang an der Einsatzstelle per
 * QR-Code teilen — genau das, was am haeufigsten ohne Netz gebraucht wird.
 *
 * Der Test daneben deckte nur die URL-Eingabe auf "/" ab. Die drei
 * Formularrouten, die die Startseite verlinkt, lagen deshalb unbemerkt nicht im
 * SW-Cache: der navigate-Zweig fand /wifi nicht und lieferte NAV_FALLBACK aus,
 * die Adresszeile stand auf /wifi und gerendert wurde die Startseite. Kein
 * Fehler, kein Hinweis, nur kein Formular.
 */
test("WLAN-Formular ist offline erreichbar und erzeugt den korrekten Code", async ({
  page,
  context,
}) => {
  await page.goto(`${QR}/`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();

  // Nicht blind offline gehen: der Cache-Write haengt an `waitUntil` und ist
  // nach der Navigation nicht zwingend schon durch. Ohne dieses Warten scheiterte
  // der Test am Timing statt an der Zusage.
  await expect
    .poll(() =>
      page.evaluate(
        async (cacheName) => (await (await caches.open(cacheName)).match("/wifi")) !== undefined,
        CACHE,
      ),
    )
    .toBe(true);

  await context.setOffline(true);
  await page.goto(`${QR}/wifi`);

  // Erst der Beleg, dass hier wirklich das Formular steht und nicht die
  // zurueckgefallene Startseite — sonst schluege der Test unten mit einem
  // nichtssagenden Locator-Timeout fehl.
  await expect(page.getByLabel("SSID")).toBeVisible();

  await page.getByLabel("SSID").fill("DRK-Einsatz");
  await page.getByLabel("Passwort").fill("offline-geheim");
  await page.getByRole("button", { name: /erzeugen/i }).click();

  const box = page.getByTestId("qr-display");
  await expect(box.locator("svg")).toBeVisible();
  expect(await decodeQr(await box.innerHTML())).toBe(
    "WIFI:T:WPA;S:DRK-Einsatz;P:offline-geheim;H:false;;",
  );

  await context.setOffline(false);
});

test("Admin-Seite landet nicht im SW-Cache", async ({ page }) => {
  // Gegenueber dem Plan scharf gestellt. Dort wurde nur anonym "/" aufgerufen
  // und anschliessend auf einen Cache-Key "/admin" geprueft — der Test war aus
  // zwei unabhaengigen Gruenden gruen, egal ob die Zusage haelt: /admin wurde
  // nie besucht und nie eingeloggt, und der Navigations-Zweig legt Antworten
  // ohnehin nur unter "/" ab, nie unter dem angefragten Pfad.
  //
  // Geprueft wird deshalb die Zusage selbst: auch mit aktiver Admin-Session
  // darf im Cache nur die ANONYME Startseite liegen. Sonst laege das
  // Preset-Markup (bei WLAN-Presets samt Passwort) nach dem Logout weiter auf
  // einem geteilten Tablet.
  await devLogin(page, {
    host: "qr.localtest.me",
    port: 3101,
    groups: "drk-qr-admin",
    callbackPath: "/admin",
  });
  await expect(page.getByTestId("qr-admin")).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);

  // Der Cache-Write haengt an `waitUntil` und ist nach der Navigation nicht
  // zwingend schon durch.
  await expect
    .poll(() =>
      page.evaluate(
        async (cacheName) => (await (await caches.open(cacheName)).match("/")) !== undefined,
        CACHE,
      ),
    )
    .toBe(true);

  const cached = await page.evaluate(async (cacheName) => {
    const cache = await caches.open(cacheName);
    const shell = await cache.match("/");
    return {
      paths: (await cache.keys()).map((r) => new URL(r.url).pathname),
      html: shell ? await shell.text() : null,
    };
  }, CACHE);

  expect(cached.paths.some((p) => p.startsWith("/admin"))).toBe(false);
  // Positiver Nachweis, dass die gecachte Fassung die anonyme ist — ohne ihn
  // bliebe der Test auch bei einem leeren, nichtssagenden Dokument gruen.
  expect(cached.html).toContain("qr-login-hint");
  expect(cached.html).not.toContain("qr-admin");
  expect(cached.html).not.toContain("Presets verwalten");
});
