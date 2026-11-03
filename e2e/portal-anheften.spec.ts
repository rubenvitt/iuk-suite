import { test, expect } from "@playwright/test";
import { devLogin, E2E_PORT, warteAufGestreamteInhalte } from "./fixtures";

/*
 * IDA-338: wer viele Apps sieht, bekommt oben Angeheftet und Zuletzt, der Rest steht geordnet
 * hinter „Alle Apps & Dienste“. Eigene E-Mail, damit die Zeile in `launcher_vorlieben` nur
 * diesem Test gehört — die anderen Specs teilen sich `dev@localtest.me`.
 */
const VIELE_GRUPPEN = [
  "admin", "lagerbuch-admin", "files-admin", "feedback-admin", "kommplan-admin", "helfer-nutzer",
  "fahrzeuge-nutzer", "schichtplan-nutzer", "gemeinschaft-admin", "lagemonitor-admin", "uav-admin",
  "einsatzbuch-nutzer", "aufgaben-nutzer", "radio-admin", "wartung-admin",
].join(",");

test("angeheftet steht nach dem Neuladen oben und im Umschalter eines anderen Moduls", async ({ page }, testInfo) => {
  // Je Versuch eine eigene Person: ein Wiederholungslauf fände sonst die Nadel des ersten vor.
  const EMAIL = `anheften-${testInfo.retry}-${Date.now()}@localtest.me`;
  await devLogin(page, { host: "portal.localtest.me", email: EMAIL, groups: VIELE_GRUPPEN });
  await warteAufGestreamteInhalte(page);

  // Noch nichts angeheftet, nichts geöffnet: „Alle“ steht gleich offen, nach Bereichen geordnet.
  await expect(page.getByTestId("portal-alle-liste")).toBeVisible();
  await expect(page.getByTestId("portal-angeheftet")).toHaveCount(0);
  await expect(page.getByTestId("portal-abschnitt").filter({ hasText: "Material & Technik" })).toBeVisible();

  const zeile = page.getByTestId("portal-zeile").filter({ hasText: "Lagerbuch" });
  const gespeichert = page.waitForResponse((r) => r.request().method() === "POST" && r.ok());
  await zeile.getByTestId("anheften").click();
  await gespeichert;
  await expect(zeile.getByTestId("anheften")).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await warteAufGestreamteInhalte(page);
  await expect(page.getByTestId("portal-angeheftet").getByTestId("service-tile").filter({ hasText: "Lagerbuch" })).toHaveCount(1);
  await expect(page.getByTestId("portal-alle")).toHaveAttribute("aria-expanded", "false");

  // Ein anderes Modul: sein Aufruf landet unter Zuletzt, das Angeheftete steht darüber.
  await page.goto(`http://qr.localtest.me:${E2E_PORT}/`);
  await warteAufGestreamteInhalte(page);
  await page.getByTestId("app-umschalter").click();
  const panel = page.getByTestId("app-panel");
  await expect(panel.getByTestId("app-abschnitt")).toHaveText(["Angeheftet", "Zuletzt"]);
  await expect(panel.getByRole("link", { name: "Lagerbuch" })).toBeVisible();
  await expect(panel.getByRole("link", { name: "QR-Codes" })).toBeVisible();
  await expect(panel.getByTestId("app-alle")).toHaveAttribute("aria-expanded", "false");
});
