import { test, expect, type APIRequestContext } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";
import { ZEICHEN_PAUSIERT } from "../src/app/m/zeichen/_lib/verfuegbarkeit";

test.skip(!ZEICHEN_PAUSIERT, "Die App ist wieder freigegeben");

const ZEICHEN = "http://zeichen.localtest.me:3100";
const PORTAL = "http://portal.localtest.me:3100";
const MELDUNG = "Taktische Zeichen ist vorübergehend nicht verfügbar.";
const PFADE = [
  ZEICHEN + "/",
  ZEICHEN + "/katalog",
  ZEICHEN + "/offline",
  ZEICHEN + "/manifest.webmanifest",
  ZEICHEN + "/verwaltung/lernsets",
  PORTAL + "/m/zeichen",
  PORTAL + "/m/zeichen/katalog",
  PORTAL + "/m/zeichen/api/merkliste",
  "http://qr.localtest.me:3100/m/zeichen/katalog",
];

async function pruefeSperre(request: APIRequestContext) {
  for (const url of PFADE) {
    const res = await request.get(url, { maxRedirects: 0 });
    expect(res.status(), url).toBe(503);
    expect(res.headers()["cache-control"]).toBe("no-store");
    expect(await res.text()).toBe(MELDUNG);
  }
  // GET oben waermt den Pfad vor dem ersten POST (Projektregel, Falle 10).
  const post = await request.post(PORTAL + "/m/zeichen/api/merkliste", { data: {} });
  expect(post.status()).toBe(503);
  expect(await post.text()).toBe(MELDUNG);
}

test("sperrt anonyme Direktaufrufe auf Modul- und Fremdhosts", async ({ request }) => {
  await pruefeSperre(request);
});

test("sperrt auch angemeldete Administratoren und entfernt beide Einstiege", async ({ page }) => {
  await devLogin(page, { host: "portal.localtest.me", groups: "iuk-zeichen-admin,iuk-admin" });
  await pruefeSperre(page.request);
  await expect(page.locator('a[href*="zeichen.localtest.me"]')).toHaveCount(0);
  await klickeWennRuhig(page.getByTestId("app-umschalter"));
  await expect(page.getByTestId("app-panel")).toBeVisible();
  await expect(page.locator('a[href*="zeichen.localtest.me"]')).toHaveCount(0);
  const antwort = await page.goto(ZEICHEN + "/katalog");
  expect(antwort?.status()).toBe(503);
  await expect(page.locator("body")).toHaveText(MELDUNG);
});

test("liefert den Abraeum-Worker ohne Sitzung und laesst andere Module erreichbar", async ({ request }) => {
  for (const url of [ZEICHEN + "/sw.js", PORTAL + "/m/zeichen/sw.js"]) {
    const res = await request.get(url, { maxRedirects: 0 });
    expect(res.status(), url).toBe(200);
    expect(res.headers()["content-type"]).toContain("javascript");
    expect(res.headers()["cache-control"]).toBe("no-cache");
    const worker = await res.text();
    expect(worker).toContain("self.registration.unregister()");
    expect(worker).toContain("caches.delete(n)");
    expect(worker).not.toContain('addEventListener("fetch"');
  }
  expect((await request.get("http://qr.localtest.me:3100/")).status()).toBe(200);
});
