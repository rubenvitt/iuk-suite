import { test, expect } from "@playwright/test";

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

  // Login-Seite des Portal-Hosts rendert das beta-Layout nicht -> kein Link.
  await page.goto(`${PORTAL}/`);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
  const regs = await page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope),
  );
  expect(regs).not.toContain(`${PORTAL}/`);
});
