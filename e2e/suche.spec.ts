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

  // Dasselbe aus „Springen zu“ (IDA-391), und zwar in einem ANDEREN Modul als dem Portal: die
  // Treffer stehen unter den Menütreffern und führen ins Modul.
  await darf.goto(url(FAHRZEUGE, "/"));
  await darf.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(darf);
  const springen = darf.getByTestId("befehlspalette-eingabe");
  await klickeWennRuhig(springen);
  await springen.pressSequentially(kennzeichen);
  const inhalt = darf.getByTestId("befehl").filter({ hasText: funkrufname });
  await expect(inhalt).toHaveCount(1);
  await expect(inhalt).toHaveAttribute("href", url(FAHRZEUGE, "/"));
  await expect(darf.getByTestId("befehl").filter({ hasText: "Alle Treffer zeigen" })).toHaveAttribute(
    "href",
    url(PORTAL, `/suche?q=${encodeURIComponent(kennzeichen)}`),
  );
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

test("Strg+K springt nach „Springen zu“: springen, und ohne Treffer sagt es das (IDA-303)", async ({ page }) => {
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

  // Seit dem Menue (IDA-347, Etappe 2) gibt es keinen eigenen Palettenknopf
  // mehr: „Springen zu" steht dauerhaft oben in der Seitenleiste.
  await klickeWennRuhig(feld);
  await expect(feld).toBeFocused();
  await expect(feld).toHaveValue("");
  // Ohne Gruppen findet auch die Inhaltssuche nichts (IDA-391): erst wenn die Module geantwortet
  // haben, steht „Keine Treffer“ da — vorher die Zeile, dass gesucht wird.
  await feld.pressSequentially("UE-RK 831");
  await expect(page.getByText("Keine Treffer")).toBeVisible();
  await expect(page.getByTestId("befehl")).toHaveCount(0);
});
