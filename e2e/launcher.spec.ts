import { test, expect } from "@playwright/test";
import { devLogin, oeffneAlleApps, oeffneMenue } from "./fixtures";

test("Umschalter öffnet, filtert und wechselt das Modul", async ({ page }) => {
  await devLogin(page, { host: "alpha.localtest.me", groups: "alpha-users", callbackPath: "/" });

  // Geschlossen steht keine Modulliste im Bild — das ist der ganze Zweck des
  // Umbaus. Seit dem Menue (IDA-347, Etappe 2) steht „Alle Apps" als zweite
  // Ebene schon im Baum, aber `inert` und verdeckt.
  const menue = await oeffneMenue(page);
  await expect(page.getByTestId("modulzeile")).toHaveCount(0);
  await expect(menue.getByTestId("app-umschalter")).toHaveAttribute("aria-expanded", "false");
  await expect(menue.getByTestId("app-panel")).toHaveAttribute("inert", "");

  // Gefiltert wird im Feld „Springen zu" (das alte `app-suche` im Panel ist
  // entfallen): „gamma" trifft genau eine App; Inhalte darf diese Sitzung in
  // keinem durchsuchbaren Modul sehen (IDA-391).
  const feld = menue.getByTestId("befehlspalette-eingabe");
  await feld.fill("gamma");
  await expect(menue.getByTestId("befehl")).toHaveText([/^Gamma/]);
  await feld.fill("");

  // `link`, nicht `menuitem`: das Panel trägt bewusst keine ARIA-Menürollen.
  const panel = await oeffneAlleApps(page);
  await panel.getByRole("link", { name: /Gamma/ }).click();
  await expect(page.getByTestId("gamma-content")).toBeVisible();
  // Der Modultitel folgt dem Modul — sonst wäre der Wechsel nur halb passiert.
  await expect(page.getByTestId("module-title")).toHaveText("Gamma");
});

test("das aktuelle Modul ist im Panel markiert, und zwar genau einmal", async ({ page }) => {
  await devLogin(page, { host: "gamma.localtest.me", groups: "", callbackPath: "/" });
  const panel = await oeffneAlleApps(page);
  await expect(panel.locator("[aria-current]")).toHaveCount(1);
  await expect(panel.locator("[aria-current]")).toContainText("Gamma");
});

test("mobil führt der eine Ort-Knopf zu beiden Ebenen", async ({ page }) => {
  /*
   * Bis zum Menue (IDA-347, Etappe 2) stand hier „mobil öffnen Titel und
   * Menü-Knopf zwei verschiedene Dinge" — App-Umschalter im Titel und Drawer
   * mit der Seitenliste. Jetzt gibt es am Telefon EINEN Einstieg: der Ort-Knopf
   * oeffnet das Blatt auf der ersten Ebene, der App-Knopf darin schiebt die
   * Apps herein, und ein neues Oeffnen beginnt wieder auf der ersten Ebene
   * (`destroyOnHidden`).
   */
  await page.setViewportSize({ width: 390, height: 844 });
  await devLogin(page, { host: "gamma.localtest.me", groups: "", callbackPath: "/" });

  await expect(page.getByTestId("app-umschalter")).toBeHidden();
  const blatt = await oeffneMenue(page);
  await expect(blatt.getByTestId("app-umschalter-drawer")).toHaveAttribute("aria-expanded", "false");

  const panel = await oeffneAlleApps(page);
  expect(await panel.getByTestId("app-eintrag").count()).toBeGreaterThan(0);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("suite-drawer")).toBeHidden();
  await expect(page.getByTestId("menue-knopf")).toHaveAttribute("aria-expanded", "false");

  await oeffneMenue(page);
  await expect(page.getByTestId("app-umschalter-drawer")).toHaveAttribute("aria-expanded", "false");
});

/*
 * Der Rundlauf des Ansprechpartners aus Task 5 — Verwaltung schreibt, Portal
 * liest. Er steht hier und nicht in Task 5, weil er zwei Seiten und einen
 * Neuladevorgang umfasst; nur ein laufender Server kann das belegen.
 *
 * Die Gruppe des Portal-Admins ist die SUITE-Admin-Gruppe: `portal` führt keine
 * eigene (`registry.ts`, `adminGroups: []`), also greift `ADMIN_GROUP` aus
 * `core/groups.ts` — Vorgabe `admin`, und `playwright.config.ts`
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
test("was die Verwaltung als Ansprechpartner pflegt, uebersteht den Rundlauf ueber die Datenbank", async ({
  page,
}) => {
  await devLogin(page, {
    host: "portal.localtest.me",
    groups: "admin",
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
