import { test, expect, type Page } from "@playwright/test";
import { devLogin, E2E_PORT, warteAufGestreamteInhalte } from "./fixtures";

/*
 * RUHEZUSTÄNDE MIT HAARLINIEN-FIGUR (IDA-347, Etappe 3) — was nur ein echter Browser sieht:
 * der Status der Randseiten (404 bleibt 404, „Kein Zugriff" ist 403 MIT Suite-Seite), dass die
 * nachgeladene Figur wirklich zeichnet (eine Insel in einer Server Component, Falle 6), dass ihre
 * Fläche vorher schon reserviert ist, und dass sie bei reduzierter Bewegung den Zeiger nicht nimmt.
 */

const PORTAL = `http://portal.localtest.me:${E2E_PORT}`;

/** Die Figur hat gezeichnet: das Paket hängt ein `<svg>` in die reservierte Fläche. */
async function figurGezeichnet(page: Page, figur: string) {
  const flaeche = page.locator(`[data-figur="${figur}"]`);
  await expect(flaeche).toHaveCount(1);
  await expect(flaeche.locator("svg")).toHaveCount(1);
  const box = await flaeche.boundingBox();
  expect(box && Math.round((box.width / box.height) * 100) / 100, "5:4 wie das Paket").toBe(1.25);
  return flaeche;
}

test("404 bleibt 404 und zeigt die Figur samt einem Weg zurück", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "admin" });
  const antwort = await page.goto(`${PORTAL}/gibt-es-nicht-${Date.now()}`);
  expect(antwort?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Diese Seite gibt es hier nicht." })).toBeVisible();
  await figurGezeichnet(page, "query");
  await expect(page.getByRole("link", { name: "Zur Startseite" })).toHaveAttribute("href", "/");
});

test("404 ohne Modulgruppe: kein Kreis zurück auf dieselbe Seite, sondern ins Portal (IDA-392)", async ({ page }) => {
  // Die Gerätewartung riegelt erst im Modul: ohne Gruppe ist schon ihre Wurzel eine 404.
  await devLogin(page, { host: "wartung.localtest.me", groups: "" });
  const antwort = await page.goto(`http://wartung.localtest.me:${E2E_PORT}/geraete`);
  expect(antwort?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Diese Seite gibt es hier nicht." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Zur Startseite" })).toHaveCount(0);
  const portal = page.getByRole("link", { name: "Zum Portal" });
  // Ohne `AUTH_URL` (e2e) ist das Portal die Moduladresse `portal.localtest.me` — nie der Modul-Host selbst.
  await expect(portal).toHaveAttribute("href", new RegExp(`^http://portal\\.localtest\\.me:${E2E_PORT}/$`));
  await expect(page.getByTestId("zugang-kontakt")).toContainText("Oder dir fehlt der Zugang.");
  await expect(page.getByTestId("zugang-konto")).toHaveText("Angemeldet als dev@localtest.me");

  await portal.click();
  await expect(page.getByTestId("portal-grid").or(page.getByTestId("portal-leer"))).toBeVisible();
});

test("die Fläche der Figur steht schon im Server-HTML — nichts verschiebt sich", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "admin" });
  const html = await (await page.request.get(`${PORTAL}/gibt-es-nicht-ssr`)).text();
  expect(html).toMatch(/<div aria-hidden="true" data-figur="query" class="[^"]+"><\/div>/);
});

test("ohne Zugangsgruppe: 403 mit Suite-Seite, die API behält das nackte 403", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "" });
  const antwort = await page.goto(`http://aufgaben.localtest.me:${E2E_PORT}/`);
  expect(antwort?.status()).toBe(403);
  await expect(page.getByTestId("kein-zugriff")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Kein Zugriff" })).toBeVisible();
  await figurGezeichnet(page, "padlock");
  await expect(page.getByRole("link", { name: "Zum Portal" })).toBeVisible();
  await expect(page.getByTestId("zugang-konto")).toHaveText("Angemeldet als dev@localtest.me");

  const api = await page.request.get(`http://aufgaben.localtest.me:${E2E_PORT}/`, { headers: { accept: "application/json" } });
  expect(api.status()).toBe(403);
  expect(await api.text()).toBe("Forbidden");
});

test("die Anmeldung trägt die Figur und meldet weiter an", async ({ page }) => {
  await page.goto(`${PORTAL}/login`);
  await figurGezeichnet(page, "dish");
  await devLogin(page, { host: "portal.localtest.me", groups: "admin" });
  await expect(page.getByTestId("portal-grid")).toBeVisible();
});

test("Portal ohne Angeheftetes zeigt den Ruhezustand", async ({ page }, testInfo) => {
  const VIELE = [
    "admin", "lagerbuch-admin", "files-admin", "feedback-admin", "kommplan-admin", "helfer-nutzer",
    "fahrzeuge-nutzer", "schichtplan-nutzer", "gemeinschaft-admin", "lagemonitor-admin", "uav-admin",
    "einsatzbuch-nutzer", "aufgaben-nutzer", "radio-admin", "wartung-admin",
  ].join(",");
  // Eine eigene Person: andere Specs heften für `dev@localtest.me` an.
  await devLogin(page, { host: "portal.localtest.me", email: `ruhe-${testInfo.retry}-${Date.now()}@localtest.me`, groups: VIELE });
  await warteAufGestreamteInhalte(page);
  await expect(page.getByTestId("portal-ohne-angeheftet")).toContainText("Noch nichts angeheftet");
  await figurGezeichnet(page, "hub");
});

test.describe("reduzierte Bewegung", () => {
  test.use({ reducedMotion: "reduce" });

  test("die Figur steht still: kein Zeiger erreicht sie", async ({ page }) => {
    await devLogin(page, { host: "portal.localtest.me", groups: "admin" });
    await page.goto(`${PORTAL}/gibt-es-nicht-ruhig`);
    const flaeche = await figurGezeichnet(page, "query");
    expect(await flaeche.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  });
});

test("die Figur nimmt Tinte und Grau der Suite, im Dunkeln wie im Hellen", async ({ page, context }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "admin" });
  const farben = async () => {
    await page.goto(`${PORTAL}/gibt-es-nicht-farbe`);
    const flaeche = await figurGezeichnet(page, "query");
    return flaeche.evaluate((el) => {
      const s = getComputedStyle(el);
      const grund = getComputedStyle(el.closest("main")!).backgroundColor;
      return { hi: s.getPropertyValue("--hairline-hi").trim(), platte: s.getPropertyValue("--hairline-plate").trim(), grund };
    });
  };
  const hell = await farben();
  await context.addCookies([{ name: "iuk-theme-pref", value: "dark", domain: "portal.localtest.me", path: "/" }]);
  const dunkel = await farben();
  expect(hell.hi).toBe("#18181b");
  expect(dunkel.hi).toBe("#fafafa");
  // Die Platten tragen genau den Untergrund, sonst stünde ein Kasten auf der Fläche.
  expect(hell.platte).toBe(hell.grund);
  expect(dunkel.platte).toBe(dunkel.grund);
});
