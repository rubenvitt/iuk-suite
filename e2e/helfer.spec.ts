import { expect, test, type Page } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";

/**
 * Modul helfer (IDA-249) im Demo-Modus: Abgleich mit Vorschau, Übernehmen, Freigabe in der Liste,
 * Rechte und die Vorschau im Einsatzbuch. Die Demo-Quelle ist die Vorgabe einer frischen Datenbank;
 * der Abgleich ist idempotent, Wiederholungen gegen dieselbe Datenbank laufen also durch.
 *
 * Greifer: Kartentabelle rendert Tabelle UND Karten (Falle 14) — Zeilen über die benannte Tabelle und
 * `[data-row-key]`.
 */
const HOST = "helfer.localtest.me";
const url = (p: string) => `http://${HOST}:${E2E_PORT}${p}`;
const ADMIN = "helfer-nutzer,helfer-admin";

async function oeffne(page: Page, pfad: string): Promise<void> {
  await page.goto(url(pfad));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);
}

async function demoAbgleichen(page: Page): Promise<void> {
  await oeffne(page, "/abgleich");
  await klickeWennRuhig(page.getByRole("button", { name: "Vorschau aus der Demo-Quelle" }));
  await expect(page.getByTestId("abgleich-summe")).toContainText("38 gelesen");
  await klickeWennRuhig(page.getByRole("button", { name: "Übernehmen" }));
  // Liegt noch ein Bestand vor, der wegfällt, fragt ein Dialog nach.
  const dialog = page.getByRole("button", { name: "Übernehmen und löschen" });
  if (await dialog.isVisible().catch(() => false)) await dialog.click();
  await expect(page.getByText(/neu, \d+ geändert, \d+ gelöscht/)).toBeVisible();
}

test("Demo-Modus: Vorschau zeigt Ausgefilterte nur als Zahl, Übernehmen füllt die Liste", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  for (const pfad of ["/", "/abgleich", "/einstellungen"]) {
    const antwort = await page.goto(url(pfad));
    expect(antwort?.status(), pfad).toBe(200);
    expect(antwort?.headers()["cache-control"], pfad).toContain("no-store");
    expect(antwort?.headers()["x-robots-tag"], pfad).toContain("noindex");
    await expect(page.getByTestId("demo-hinweis")).toBeVisible();
  }

  await oeffne(page, "/abgleich");
  await klickeWennRuhig(page.getByRole("button", { name: "Vorschau aus der Demo-Quelle" }));
  await expect(page.getByTestId("abgleich-summe")).toContainText("38 gelesen");
  const gruende = page.getByRole("list", { name: "Ausgefiltert nach Grund" });
  await expect(gruende).toContainText("2 Konto gesperrt");
  await expect(gruende).toContainText("2 ausgetreten");
  // Ausgefilterte Personen stehen nicht mit Namen in der Vorschau (Timo Fricke ist gesperrt).
  await expect(page.getByRole("table", { name: "Vorschau des Abgleichs" })).not.toContainText("Fricke, Timo");

  await demoAbgleichen(page);
  await oeffne(page, "/");
  const tabelle = page.getByRole("table", { name: "Helfer" });
  await expect(tabelle.locator("[data-row-key]").filter({ hasText: "Albers, Jana" })).toHaveCount(1);
  await expect(tabelle).not.toContainText("Fricke, Timo");
});

test("Freigabe fürs Einsatzbuch umschalten; ohne Admin-Gruppe nur lesend", async ({ page, browser }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await demoAbgleichen(page);
  await oeffne(page, "/");
  const schalter = page.getByRole("switch", { name: "Jana Albers fürs Einsatzbuch freigeben" }).first();
  const vorher = await schalter.getAttribute("aria-checked");
  await klickeWennRuhig(schalter);
  await expect(schalter).toHaveAttribute("aria-checked", vorher === "true" ? "false" : "true");
  await klickeWennRuhig(schalter);
  await expect(schalter).toHaveAttribute("aria-checked", vorher ?? "true");

  const leser = await browser.newPage();
  await devLogin(leser, { host: HOST, groups: "helfer-nutzer", email: "leser@localtest.me", callbackPath: "/" });
  await oeffne(leser, "/");
  await expect(leser.getByRole("table", { name: "Helfer" })).toContainText("Albers, Jana");
  await expect(leser.getByRole("switch")).toHaveCount(0);
  await oeffne(leser, "/abgleich");
  await expect(leser.getByRole("button", { name: /Vorschau/ })).toHaveCount(0);
  await leser.close();
});

test("ohne Zugangsgruppe kein Zugang — auch nicht als Suite-Admin", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "admin", email: "admin@localtest.me", callbackPath: "/" });
  const antwort = await page.goto(url("/"));
  expect(antwort?.status()).not.toBe(200);
  await expect(page.getByRole("table", { name: "Helfer" })).toHaveCount(0);
});

test("das Einsatzbuch zeigt Demo-Helfer in der Vorschau, übernimmt sie aber nicht", async ({ page }) => {
  // Eine Anmeldung mit beiden Gruppen: die Sitzung gilt über die gemeinsame Cookie-Domain auf beiden Hosts.
  await devLogin(page, { host: HOST, groups: `${ADMIN},einsatzbuch-nutzer`, callbackPath: "/" });
  await demoAbgleichen(page);
  const eb = "einsatzbuch.localtest.me";
  await page.goto(`http://${eb}:${E2E_PORT}/stammdaten?reiter=personal`);
  await page.waitForLoadState("networkidle");
  await klickeWennRuhig(page.getByRole("button", { name: "Aus Helferverzeichnis abgleichen" }));
  await expect(page.getByTestId("helfer-abgleich-summe")).toContainText(/\d+ Demo/);
  await expect(page.getByText("Das Helferverzeichnis läuft im Demo-Modus")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Übernehmen" })).toBeDisabled();
});

test("im Einsatzbuch lässt sich eine HiOrg-Qualifikation einem Kürzel zuordnen (IDA-250)", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: `${ADMIN},einsatzbuch-nutzer`, callbackPath: "/" });
  await demoAbgleichen(page);
  await page.goto(`http://einsatzbuch.localtest.me:${E2E_PORT}/stammdaten?reiter=personal`);
  await page.waitForLoadState("networkidle");
  await klickeWennRuhig(page.getByRole("button", { name: "Aus Helferverzeichnis abgleichen" }));
  const dialog = page.getByRole("dialog");
  const ersthelfer = dialog.getByTestId("quali-zuordnung").getByRole("listitem").filter({ hasText: "Ersthelfer" });
  await expect(ersthelfer).toContainText("Automatisch: nicht zuordnen");
  const speichern = dialog.getByRole("button", { name: "Zuordnung speichern" });
  await expect(speichern).toBeDisabled();

  // Zuordnen und speichern; danach zurück auf „Automatisch“, damit Wiederholungen gleich starten.
  for (const [wahl, sichtbar] of [["SanH – Sanitätshelfer", "SanH – Sanitätshelfer"], [/^Automatisch/, "Automatisch: nicht zuordnen"]] as const) {
    await ersthelfer.getByRole("combobox").click();
    await page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option", { hasText: wahl }).click();
    const antwort = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/stammdaten"));
    await klickeWennRuhig(speichern);
    expect((await antwort).ok()).toBe(true);
    await expect(page.getByText("Zuordnung gespeichert.", { exact: false })).toBeVisible();
    await expect(ersthelfer).toContainText(sichtbar);
    await expect(speichern).toBeDisabled();
  }
});
