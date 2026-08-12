import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";

test("Umschalter öffnet, filtert und wechselt das Modul", async ({ page }) => {
  await devLogin(page, { host: "alpha.localtest.me", groups: "alpha-users", callbackPath: "/" });

  // Geschlossen steht keine Modulliste in der Kopfzeile — das ist der ganze
  // Zweck des Umbaus.
  await expect(page.getByTestId("app-panel")).toHaveCount(0);
  await expect(page.getByTestId("modulzeile")).toHaveCount(0);

  await page.getByTestId("app-umschalter").click();
  const panel = page.getByTestId("app-panel");
  await expect(panel).toBeVisible();

  await panel.getByTestId("app-suche").fill("gamma");
  await expect(panel.getByTestId("app-eintrag")).toHaveCount(1);

  // `link`, nicht `menuitem`: das Panel trägt bewusst keine ARIA-Menürollen —
  // es enthält ein Suchfeld, und das Menümodell verträgt kein Textfeld.
  await panel.getByRole("link", { name: /Gamma/ }).click();
  await expect(page.getByTestId("gamma-content")).toBeVisible();
  // Der Modultitel folgt dem Modul — sonst wäre der Wechsel nur halb passiert.
  await expect(page.getByTestId("module-title")).toHaveText("Gamma");
});

test("das aktuelle Modul ist im Panel markiert, und zwar genau einmal", async ({ page }) => {
  await devLogin(page, { host: "gamma.localtest.me", groups: "", callbackPath: "/" });
  await page.getByTestId("app-umschalter").click();
  const panel = page.getByTestId("app-panel");
  await expect(panel.locator("[aria-current]")).toHaveCount(1);
  await expect(panel.locator("[aria-current]")).toContainText("Gamma");
});

test("mobil öffnen Titel und Menü-Knopf zwei verschiedene Dinge", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await devLogin(page, { host: "gamma.localtest.me", groups: "", callbackPath: "/" });

  await page.getByTestId("app-umschalter").click();
  await expect(page.getByTestId("app-panel")).toBeVisible();
  // Der Drawer bleibt zu — die zwei Öffner teilen sich keinen Zustand.
  await expect(page.getByTestId("suite-drawer")).toBeHidden();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("app-panel")).toHaveCount(0);

  await page.getByTestId("menue-knopf").click();
  await expect(page.getByTestId("suite-drawer")).toBeVisible();
  // Und im Drawer stehen KEINE Apps mehr.
  await expect(page.getByTestId("suite-drawer").getByTestId("app-eintrag")).toHaveCount(0);
});

/*
 * Der Rundlauf des Ansprechpartners aus Task 5 — Verwaltung schreibt, Portal
 * liest. Er steht hier und nicht in Task 5, weil er zwei Seiten und einen
 * Neuladevorgang umfasst; nur ein laufender Server kann das belegen.
 *
 * Die Gruppe des Portal-Admins ist die SUITE-Admin-Gruppe: `portal` führt keine
 * eigene (`registry.ts`, `adminGroups: []`), also greift `ADMIN_GROUP` aus
 * `core/groups.ts` — Vorgabe `dashboard-admins`, und `playwright.config.ts`
 * setzt die Variable nicht, die Vorgabe gilt also.
 *
 * Zum Leerzustand selbst: ihn end-to-end zu erzwingen hieße, einer Sitzung
 * jeden Zugang zu nehmen — `portal` und `qr` sind ohne Gruppenzwang für jeden
 * Angemeldeten sichtbar, das ginge nur über `SUITE_ACCESS_GROUP_*` in der
 * Server-Umgebung und damit für die ganze Suite. Der Leerzustand ist deshalb
 * in `DiensteRaster.test.tsx` (Task 6) abgedeckt, und hier nur der Rundlauf
 * des Wertes, den er anzeigt. Diese Abgrenzung ist Absicht, kein fehlender
 * Test — bitte nicht nachrüsten.
 */
test("was die Verwaltung als Ansprechpartner pflegt, steht im leeren Portal", async ({ page }) => {
  await devLogin(page, {
    host: "portal.localtest.me",
    groups: "dashboard-admins",
    callbackPath: "/admin",
  });

  await page.getByTestId("ansprechpartner-form").getByRole("textbox").fill("IuK-Gruppe — iuk@example.org");
  await page.getByTestId("ansprechpartner-form").getByRole("button", { name: /Speichern/ }).click();

  // Neu laden statt dem Formular zu glauben: der Wert muss die Datenbank
  // erreicht haben, nicht nur den Client-State.
  await page.reload();
  await expect(page.getByTestId("ansprechpartner-form").getByRole("textbox")).toHaveValue(
    "IuK-Gruppe — iuk@example.org",
  );
});
