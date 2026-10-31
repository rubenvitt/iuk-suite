import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { devLogin, warteAufGestreamteInhalte } from "./fixtures";
import {
  E2E_FAHRZEUG_NAME, E2E_TOKEN_FAHRZEUG, LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl,
} from "./helpers/lagerbuch";

/**
 * MÄNGEL MELDEN (IDA-298) — vom Scan bis zur Verwaltung, im echten Browser.
 *
 * Was nur hier sichtbar wird: das Formular verkleinert das Foto im Browser (Canvas), die Route nimmt
 * multipart an, und das Foto kommt in der Verwaltung als Bild zurück. Vitest sieht keinen dieser
 * Schritte.
 *
 * ⚠️ FALLE 10: vor dem POST ein Warmlauf-GET auf die Route (sie antwortet mit 405, ist dann aber
 * kompiliert), und der POST selbst wird per `waitForResponse` geprüft.
 *
 * Schreibt eine Zeile in `maengel` und ein Bild unter DATA_DIR. Additiv; keine andere Spec zählt Mängel.
 */

const BESCHREIBUNG = "E2E: Sitz vorne links eingerissen";

test.describe("Mängel melden", () => {
  test("Helfer meldet am Fahrzeug, die Verwaltung sieht Meldung und Foto", async ({ page, browser }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(lagerbuchUrl(`/t/${E2E_TOKEN_FAHRZEUG}`));
    await page.goto(lagerbuchUrl("/helfer/mangel"));
    await warteAufGestreamteInhalte(page);

    await expect(page.getByTestId("lb-tableiste").getByText("Mangel")).toBeVisible();
    await expect(page.locator("[data-rolle='mangel-ort']")).toContainText(E2E_FAHRZEUG_NAME);

    await page.getByLabel("Verschmutzt").check();
    await page.getByLabel("Beschreibung").fill(BESCHREIBUNG);
    const foto = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#4060a0" } }).jpeg().toBuffer();
    await page.locator("[data-rolle='mangel-foto-feld']").setInputFiles({ name: "schaden.jpg", mimeType: "image/jpeg", buffer: foto });
    await expect(page.locator("[data-rolle='mangel-fotos'] img")).toHaveCount(1);

    if (process.env.MAENGEL_BILDER) {
      mkdirSync(process.env.MAENGEL_BILDER, { recursive: true });
      await page.screenshot({ path: `${process.env.MAENGEL_BILDER}/melden-mobil.png`, fullPage: true });
    }

    await page.request.get(lagerbuchUrl("/helfer/mangel/melden"));
    const antwort = page.waitForResponse((r) => r.url().endsWith("/helfer/mangel/melden") && r.request().method() === "POST");
    await page.locator("[data-rolle='mangel-senden']").click();
    expect((await antwort).status()).toBe(200);
    await expect(page.locator("[data-rolle='mangel-fertig']")).toBeVisible();

    if (process.env.MAENGEL_BILDER) {
      await page.screenshot({ path: `${process.env.MAENGEL_BILDER}/gemeldet-mobil.png` });
    }

    const verwaltung = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const admin = await verwaltung.newPage();
    await devLogin(admin, { host: LAGERBUCH_HOST, groups: LAGERBUCH_ADMIN_GRUPPE, callbackPath: "/verwaltung/maengel" });
    await admin.goto(lagerbuchUrl("/verwaltung/maengel"));
    await warteAufGestreamteInhalte(admin);
    const karte = admin.locator("[data-rolle='mangel-karte']").filter({ hasText: BESCHREIBUNG });
    await expect(karte).toHaveCount(1);
    await expect(karte).toContainText(E2E_FAHRZEUG_NAME);
    await expect(karte).toContainText("Verschmutzt");
    const bild = karte.locator("img").first();
    await expect(bild).toBeVisible();
    // Das Bild kam wirklich an — und ist höchstens 1600 px breit, also neu gerechnet.
    const breite = await bild.evaluate((img: HTMLImageElement) => img.complete ? img.naturalWidth : 0);
    expect(breite).toBeGreaterThan(0);
    expect(breite).toBeLessThanOrEqual(1600);

    if (process.env.MAENGEL_BILDER) {
      await admin.screenshot({ path: `${process.env.MAENGEL_BILDER}/verwaltung-desktop.png`, fullPage: true });
    }

    // Ohne Anmeldung gibt es das Foto nicht.
    const src = await bild.getAttribute("src");
    expect((await page.request.get(lagerbuchUrl(src!))).status()).toBe(404);
    await verwaltung.close();
  });
});
