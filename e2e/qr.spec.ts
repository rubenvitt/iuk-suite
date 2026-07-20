import { test, expect, type Page } from "@playwright/test";
import { devLogin } from "./fixtures";
import { decodeQr } from "./helpers/decode-qr";

/**
 * E2E fuer das Modul `qr`. Die QR-Tests dekodieren den angezeigten Code
 * zurueck, statt nur die Anwesenheit eines `<svg>` zu pruefen — nur so faellt
 * auf, wenn der Code den falschen Inhalt traegt.
 */

const QR = "http://qr.localtest.me:3100";

/**
 * `QrDisplay` erzeugt das SVG in einem Effekt; bis die Promise aufloest, ist die
 * Box leer. Ohne dieses Warten liefert `innerHTML()` den leeren String, und der
 * Test schlaege mit "konnte nicht dekodiert werden" fehl statt mit dem echten
 * Vergleich.
 */
async function readQrSvg(page: Page): Promise<string> {
  const box = page.getByTestId("qr-display");
  await expect(box.locator("svg")).toBeVisible();
  return box.innerHTML();
}

test("anonym: URL eingeben erzeugt einen lesbaren QR-Code", async ({ page }) => {
  await page.goto(`${QR}/`);
  await page.getByLabel("Link oder Text").fill("https://drk.de");
  await page.getByRole("button", { name: /erzeugen/i }).click();
  expect(await decodeQr(await readQrSvg(page))).toBe("https://drk.de");
});

test("anonym: WLAN-Formular erzeugt den korrekten WIFI:-String", async ({ page }) => {
  await page.goto(`${QR}/wifi`);
  await page.getByLabel("SSID").fill("DRK-Test");
  await page.getByLabel("Passwort").fill("geheim");
  await page.getByRole("button", { name: /erzeugen/i }).click();
  expect(await decodeQr(await readQrSvg(page))).toBe("WIFI:T:WPA;S:DRK-Test;P:geheim;H:false;;");
});

test("anonym sieht keine Presets, sondern den Anmelde-Hinweis", async ({ page }) => {
  await page.goto(`${QR}/`);
  await expect(page.getByTestId("qr-login-hint")).toBeVisible();
  await expect(page.getByTestId("preset-grid")).toHaveCount(0);
});

test("eingeloggt sieht das Preset-Grid mit dem Seed-Preset", async ({ page }) => {
  await devLogin(page, { host: "qr.localtest.me", groups: "" });
  await page.goto(`${QR}/`);
  await expect(page.getByTestId("preset-grid")).toBeVisible();
  await expect(page.getByText("Beispiel-Link")).toBeVisible();
});

test("Admin-Route ist ohne die Gruppe nicht vorhanden (404, nicht 403)", async ({ page }) => {
  await devLogin(page, { host: "qr.localtest.me", groups: "drk-qr-user" });
  const res = await page.goto(`${QR}/admin`);
  expect(res?.status()).toBe(404);
});

test("drk-qr-admin kann ein Preset anlegen", async ({ page }) => {
  await devLogin(page, {
    host: "qr.localtest.me",
    groups: "drk-qr-admin",
    callbackPath: "/admin",
  });
  await expect(page.getByTestId("qr-admin")).toBeVisible();
  await page.getByLabel("Bezeichnung").fill("Neues Preset");
  // Die Art steht per Vorgabe auf "Web-Adresse"; das Wertfeld traegt dessen
  // Namen. Ueber die Rolle adressiert, weil `getByLabel` zusaetzlich die
  // Art-Auswahl traefe — deren Label schliesst die Optionstexte mit ein.
  await page.getByRole("textbox", { name: "Web-Adresse" }).fill("https://neu.example");
  await page.getByRole("button", { name: /anlegen/i }).click();
  // Auf die Liste eingegrenzt, nicht per getByText: die Ueberschrift "Neues
  // Preset anlegen" enthaelt denselben Text und machte die Zusicherung
  // mehrdeutig — sie wuerde auch dann gruen, wenn nichts angelegt wurde.
  await expect(page.getByTestId("preset-row").filter({ hasText: "Neues Preset" })).toHaveCount(1);
});

test("der QR-URL-Vertrag funktioniert direkt", async ({ page }) => {
  // Dieser Link-Aufbau ist im Umlauf (gebookmarkt, geteilt) — er muss halten.
  await page.goto(`${QR}/qr?data=${encodeURIComponent("https://drk.de")}&label=Test&kind=url`);
  expect(await decodeQr(await readQrSvg(page))).toBe("https://drk.de");
});
