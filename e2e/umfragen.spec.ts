import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";

/**
 * DER EINZIGE BEWEIS FÜR DEN EINGESCHALTETEN ZWEIG.
 *
 * Die normale E2E-Suite fährt mit leeren `SUITE_FORMBRICKS_*` (siehe die
 * Begründung in `playwright.config.ts`) — jeder andere Test der Suite läuft
 * also durch den AUSGESCHALTETEN Zweig. Ohne diese Datei wäre der
 * eingeschaltete von gar keinem Tor gedeckt: `typecheck` und `build` sehen eine
 * gültige Komponente, und **Vitest kann die Server-/Client-Grenze strukturell
 * nicht sehen** (dort ist `"use client"` ein wirkungsloser String, Falle 6/7).
 *
 * ⚠️ DAS SKRIPT WIRD ABGEFANGEN, NICHT GELADEN. Kein Aufruf verlässt die
 * Maschine — der Test soll die Verdrahtung messen, nicht die Erreichbarkeit
 * eines fremden Servers. Der Ersatz meldet jeden Aufruf in `window.__umfragen`,
 * und damit misst diese Datei mehr als ein vorhandenes `<script>`-Element: sie
 * misst, dass `setup()` mit der richtigen Workspace-ID ANKOMMT.
 */

const SKRIPT = "**/js/formbricks.umd.cjs";
const WORKSPACE = "e2e-workspace";

type Aufruf = [string, unknown?];
declare global {
  interface Window {
    __umfragen?: Aufruf[];
  }
}

/** Ersetzt das echte Formbricks durch eine Attrappe, die nur mitschreibt. */
async function skriptAbfangen(seite: import("@playwright/test").Page) {
  await seite.route(SKRIPT, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
        window.__umfragen = window.__umfragen || [];
        window.formbricks = {
          setup: (o) => window.__umfragen.push(["setup", o]),
          registerRouteChange: () => window.__umfragen.push(["route"]),
        };
      `,
    }),
  );
}

const aufrufe = (seite: import("@playwright/test").Page) =>
  seite.evaluate(() => window.__umfragen ?? []);

test("Arbeitsfläche: das Skript lädt und setup() kommt mit der Workspace-ID an", async ({
  page,
}) => {
  await skriptAbfangen(page);
  await devLogin(page, { host: "portal.localtest.me", port: 3102 });

  // ⚠️ Zuerst der Status: ein HTTP 500 aus Falle 6/7 wäre sonst nur ein
  // fehlendes Skript-Element, und die Meldung zeigte auf die falsche Ursache.
  const antwort = await page.goto("http://portal.localtest.me:3102/");
  expect(antwort?.status(), "Arbeitsfläche antwortet").toBe(200);

  await expect
    .poll(() => aufrufe(page), { message: "setup() wurde gerufen" })
    .toContainEqual(["setup", expect.objectContaining({ workspaceId: WORKSPACE })]);

  // POSITIVKONTROLLE für die Abwesenheits-Fälle weiter unten: derselbe Greifer
  // findet hier etwas. Ohne diese Zeile wären jene Fälle auch dann grün, wenn
  // der Selektor nie auf irgendetwas passte — sie prüften dann nichts.
  await expect(page.locator('script[src*="formbricks"]')).toHaveCount(1);
});

test("weicher Seitenwechsel meldet sich — sonst feuert eine Umfrage nur einmal", async ({
  page,
}) => {
  await skriptAbfangen(page);
  await devLogin(page, { host: "portal.localtest.me", port: 3102 });
  await page.goto("http://portal.localtest.me:3102/");
  await expect.poll(() => aufrufe(page)).toContainEqual(["setup", expect.anything()]);

  // Ein Klick im Portal, nicht `goto`: nur der weiche Wechsel ist der Fall, den
  // Formbricks von sich aus NICHT bemerkt.
  await page.getByRole("link", { name: /Neuigkeiten/i }).first().click();
  await expect(page).toHaveURL(/neuigkeiten/);

  await expect
    .poll(() => aufrufe(page), { message: "registerRouteChange() nach weichem Wechsel" })
    .toContainEqual(["route"]);
});

test.describe("Flächen, die frei bleiben", () => {
  test("Kiosk trägt kein Umfragen-Skript", async ({ page }) => {
    await skriptAbfangen(page);
    const antwort = await page.goto("http://kioskdemo.localtest.me:3102/");
    expect(antwort?.status()).toBe(200);
    await expect(page.locator('script[src*="formbricks"]')).toHaveCount(0);
  });

  test("die schmale Ansicht (QR-Codes) trägt kein Umfragen-Skript", async ({ page }) => {
    await skriptAbfangen(page);
    const antwort = await page.goto("http://qr.localtest.me:3102/");
    expect(antwort?.status()).toBe(200);
    await expect(page.locator('script[src*="formbricks"]')).toHaveCount(0);
  });
});
