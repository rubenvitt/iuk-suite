import { expect, test, type Page } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig } from "./fixtures";

/**
 * Stufe 2 des Einsatzbuchs: Stammdaten und Einstellungen über die Oberfläche.
 *
 * Die Spec legt ihre Stammdaten (Fahrzeuge, Personal) selbst an und hängt an jede Kennung und
 * jeden Namen eine Laufnummer, damit Wiederholungen gegen dieselbe Datenbank nicht an „gibt es
 * schon“ scheitern.
 *
 * ⚠️ SEIT TASK 4 SEEDET `e2e/seed-einsatzbuch.ts` (vor `next dev`, `playwright.config.ts`) DAS
 * ECHTE SCHLÜSSELPAAR mit dem Entwicklungs-KEK — die Anmeldeseite braucht ein echtes Paar für
 * `art=echt`, sonst antwortet `einrichten` mit `503 kein_echtes_paar`. Der KEK-Hinweis auf der
 * Übersicht verschwindet dadurch: `schluesselStatus` liefert `kek: "ok"`, `paar: "ok"`, und
 * `entwicklungsKekInProduktion` bleibt unter `next dev` (`NODE_ENV=development`) `false`
 * (`_lib/schluessel/status.ts`). Der erste Testfall unten prüft deshalb bewusst das GEGENTEIL
 * seines ursprünglichen Namens: der Hinweis steht NICHT mehr da.
 *
 * Greifer:
 * - Kartentabelle rendert Tabelle UND Karten ins HTML (CSS schaltet). Zeilen deshalb über die
 *   benannte Tabelle und `[data-row-key]` (Falle 14), Texte in einer Zeile ebenso — ein
 *   bloßes `getByText` träfe die verborgene Karte mit.
 * - Die Vorschau im Import trägt eigene `[data-row-key]`; die Personalzeile nach „Übernehmen“
 *   wird deshalb in der Tabelle „Personal“ gesucht, sonst träfe der Greifer während der
 *   Schließanimation auch die Vorschauzeile.
 * - Labels exakt: ab acht Zeilen hat die Schmalsteuerung Felder wie „Typ filtern“.
 */
const HOST = "einsatzbuch.localtest.me";
const url = (p: string) => `http://${HOST}:${E2E_PORT}${p}`;

/** Eingaben erst nach der Hydrierung — sonst landet `fill` im Server-HTML und der State bleibt alt. */
async function oeffne(page: Page, pfad: string): Promise<void> {
  await page.goto(url(pfad));
  await page.waitForLoadState("networkidle");
}

test.beforeEach(async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "einsatzbuch-verwaltung", callbackPath: "/" });
});

test("Übersicht, Stammdaten und Einstellungen antworten mit 200; mit echtem Paar und gültigem KEK bleibt der Hinweis aus", async ({ page }) => {
  for (const pfad of ["/", "/stammdaten", "/stammdaten?reiter=personal", "/einstellungen"]) {
    expect((await page.goto(url(pfad)))?.status(), pfad).toBe(200);
  }
  await page.goto(url("/"));
  await expect(page.getByTestId("kek-hinweis")).toHaveCount(0);
});

test("Stammdaten-Durchlauf: Fahrzeug anlegen, bearbeiten, deaktivieren; Personal per CSV", async ({ page }) => {
  const kennung = `99-83-${Date.now() % 100000}`;
  await oeffne(page, "/stammdaten");
  await klickeWennRuhig(page.getByRole("button", { name: "Fahrzeug anlegen" }));
  await page.getByLabel("Typ", { exact: true }).fill("RTW");
  await page.getByLabel("Kennung", { exact: true }).fill(kennung);
  await page.getByLabel("Funkrufname", { exact: true }).fill(`Rotkreuz Probe ${kennung}`);
  await page.getByLabel("Standort", { exact: true }).fill("Probe");
  await page.getByRole("button", { name: "Speichern" }).click();
  const zeile = page.getByRole("table", { name: "Fahrzeuge" }).locator("[data-row-key]", { hasText: kennung });
  await expect(zeile).toBeVisible();

  await zeile.getByRole("button", { name: "Bearbeiten" }).click();
  await page.getByLabel("Funkrufname", { exact: true }).fill(`Rotkreuz Probe ${kennung} neu`);
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(zeile).toContainText("neu");
  await zeile.getByRole("button", { name: "Deaktivieren" }).click();
  await expect(zeile).toContainText("inaktiv");
  await expect(zeile.getByRole("button", { name: "Aktivieren" })).toBeVisible();

  await page.getByRole("tab", { name: /Personal/ }).click();
  await expect(page).toHaveURL(/reiter=personal/);
  await klickeWennRuhig(page.getByRole("button", { name: "CSV importieren" }));
  const name = `Probe${Date.now() % 100000}, Jürgen`;
  await page.getByLabel("CSV-Datei").setInputFiles({
    name: "personal.csv", mimeType: "text/csv",
    buffer: Buffer.from(`name;quali;ov\n${name};SanH;Uelzen\nOhne Komma;SanH;Uelzen\n`, "utf8"),
  });
  await expect(page.getByText("1 neu")).toBeVisible();
  await expect(page.getByText("1 mit Fehler")).toBeVisible();
  const vorschau = page.getByRole("table", { name: "Vorschau des Imports" });
  await expect(vorschau.getByText("Name bitte als „Nachname, Vorname“")).toBeVisible();
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await expect(page.getByText("1 angelegt, 0 geändert.")).toBeVisible();
  await expect(page.getByRole("table", { name: "Personal" }).locator("[data-row-key]", { hasText: name })).toBeVisible();
  // Die Fehlerzeile ist nicht geschrieben worden.
  await expect(page.getByRole("table", { name: "Personal" }).locator("[data-row-key]", { hasText: "Ohne Komma" })).toHaveCount(0);

  // Die URL bleibt die Quelle: „Stammdaten“ in der Seitenleiste (ohne `?reiter=`) führt zurück auf Fahrzeuge.
  await page.getByRole("link", { name: "Stammdaten" }).click();
  await expect(page).not.toHaveURL(/reiter=/);
  await expect(page.getByRole("tab", { name: /Fahrzeuge/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Fahrzeug anlegen" })).toBeVisible();
});

test("Einstellungen: speichern, neu laden, ungültige Frist wird abgelehnt", async ({ page }) => {
  await oeffne(page, "/einstellungen");
  const frist = page.getByLabel("Änderungsfrist nach dem Absenden");
  await frist.fill("30");
  await klickeWennRuhig(page.getByRole("button", { name: "Speichern" }));
  await expect(page.getByText("Gespeichert.")).toBeVisible();

  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(frist).toHaveValue("30");
  await frist.fill("121");
  await klickeWennRuhig(page.getByRole("button", { name: "Speichern" }));
  await expect(page.getByText("Höchstens 120 Minuten")).toBeVisible();
  // 121 steht weder still geklemmt als 120 noch sonst wie in der Datenbank.
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(frist).toHaveValue("30");

  await frist.fill("15");
  await klickeWennRuhig(page.getByRole("button", { name: "Speichern" }));
  await expect(page.getByText("Gespeichert.")).toBeVisible();
});
