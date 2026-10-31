import { expect, test, type Page } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";

/**
 * Suiteweite Suche im Portal (IDA-301): ein Fahrzeug, das in der Fahrzeugverwaltung angelegt wird,
 * findet die Suche über sein Kennzeichen — aber nur für eine Sitzung, die das Modul öffnen darf.
 * Kennzeichen mit Zufallsteil, damit Wiederholungen gegen dieselbe Datenbank durchlaufen.
 */
const FAHRZEUGE = "fahrzeuge.localtest.me";
const PORTAL = "portal.localtest.me";
const url = (host: string, p: string) => `http://${host}:${E2E_PORT}${p}`;

async function suche(page: Page, begriff: string): Promise<void> {
  await page.goto(url(PORTAL, `/suche?q=${encodeURIComponent(begriff)}`));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);
}

test("findet ein Fahrzeug über sein Kennzeichen, nur mit Zugang zum Modul", async ({ page, browser }) => {
  const zufall = Date.now() % 100_000;
  const kennzeichen = `UE-SU ${zufall}`;
  const funkrufname = `Rotkreuz Suche ${zufall}`;

  await devLogin(page, { host: FAHRZEUGE, groups: "fahrzeuge-admin", callbackPath: "/" });
  await page.goto(url(FAHRZEUGE, "/"));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Fahrzeug anlegen" }));
  const schublade = page.getByRole("dialog");
  await schublade.getByLabel("Typ").fill("MTW");
  await schublade.getByLabel("Funkrufname").fill(funkrufname);
  await schublade.getByLabel("Kennzeichen").fill(kennzeichen);
  await schublade.getByLabel("Standort").fill("Teststadt");
  await schublade.getByRole("button", { name: "Speichern" }).click();
  await expect(schublade).toBeHidden();

  // Mit Zugang: der Treffer steht im Abschnitt „Fahrzeuge“ und führt ins Modul.
  const darf = await browser.newPage();
  await devLogin(darf, { host: PORTAL, groups: "fahrzeuge-nutzer", callbackPath: "/suche" });
  await suche(darf, kennzeichen.toLowerCase());
  const abschnitt = darf.locator('[data-testid="suche-modul"][data-modul="fahrzeuge"]');
  const treffer = abschnitt.getByTestId("suche-treffer").filter({ hasText: funkrufname });
  await expect(treffer).toHaveCount(1);
  await expect(treffer).toContainText(kennzeichen);
  await expect(treffer).toHaveAttribute("href", url(FAHRZEUGE, "/"));
  await expect(darf.getByTestId("suche-eingabe")).toHaveValue(kennzeichen.toLowerCase());

  // Dasselbe aus dem Suchfeld der Startseite: die Treffer stehen unter den Apps.
  await darf.goto(url(PORTAL, "/"));
  await darf.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(darf);
  await darf.getByTestId("portal-suche").fill(kennzeichen);
  await expect(darf.getByTestId("suche-treffer").filter({ hasText: funkrufname })).toHaveCount(1);
  await darf.close();

  // Ohne Zugang: kein Abschnitt, kein Treffer, sondern „nichts gefunden“.
  const fremd = await browser.newPage();
  await devLogin(fremd, { host: PORTAL, groups: "kommplan-nutzer", callbackPath: "/suche" });
  await suche(fremd, kennzeichen);
  await expect(fremd.getByTestId("suche-ohne-treffer")).toBeVisible();
  await expect(fremd.getByTestId("suche-modul")).toHaveCount(0);
  await fremd.close();
});

test("ein Zeichen ist zu kurz; die Leiste führt zur Suche", async ({ page }) => {
  await devLogin(page, { host: PORTAL, groups: "", callbackPath: "/" });
  await suche(page, "x");
  await expect(page.getByTestId("suche-zu-kurz")).toBeVisible();
  await expect(page.getByRole("link", { name: "Suche", exact: true }).first()).toBeVisible();
});

test("Strg+K öffnet die Befehlspalette: springen und in die Suche weiterreichen (IDA-303)", async ({ page }) => {
  await devLogin(page, { host: PORTAL, groups: "", callbackPath: "/" });
  await page.goto(url(PORTAL, "/"));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);

  await page.keyboard.press("Control+k");
  const feld = page.getByTestId("befehlspalette-eingabe");
  await expect(feld).toBeFocused();
  await feld.pressSequentially("neuig");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(url(PORTAL, "/neuigkeiten"));
  await warteAufGestreamteInhalte(page);

  await klickeWennRuhig(page.getByTestId("befehlspalette-knopf"));
  await expect(feld).toBeFocused();
  await feld.pressSequentially("UE-RK 831");
  await expect(page.getByTestId("befehl")).toHaveText(["In allen Modulen nach „UE-RK 831“ suchen"]);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(url(PORTAL, "/suche?q=UE-RK%20831"));
  await expect(page.getByTestId("suche-eingabe")).toHaveValue("UE-RK 831");
});
