import { expect, test } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";

/**
 * Modul lagemonitor (LGM-5): die Vorschau folgt dem Formular vor dem Speichern, ein Zugang holt die
 * gespeicherten Einstellungen ab, ohne Recht gibt es die Seite nicht. Der Zustand entsteht im Test
 * selbst; die Werte sind so gewählt, dass Wiederholungen gegen dieselbe Datenbank durchlaufen.
 */
const HOST = "lagemonitor.localtest.me";
const url = (p: string) => `http://${HOST}:${E2E_PORT}${p}`;

test("Vorschau folgt dem Formular, Zugang holt das Gespeicherte ab", async ({ page }) => {
  const ort = `Teststadt ${Date.now() % 100_000}`;
  await devLogin(page, { host: HOST, groups: "lagemonitor-admin", callbackPath: "/" });
  await page.goto(url("/"));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);
  await expect(page.getByRole("heading", { name: "Lagemonitor" })).toBeVisible();

  const vorschau = page.getByTestId("monitor-vorschau");
  const erklaerung = page.getByTestId("vorschau-erklaerung");
  await page.getByLabel("Standort", { exact: true }).fill(ort);
  await expect(vorschau).toContainText(`Lagemonitor · ${ort}`);

  // Unwetter: ab „Unwetterwarnung“ kommt der Starkregen ins Band, ab „Extremes Unwetter“ in die Liste.
  // Über das sichtbare Etikett: das Radio selbst ist ein 0 × 0-Input (wie `kommplan-gliederung.spec.ts`).
  const lage = page.getByRole("radiogroup", { name: "Beispiellage" });
  const schwelle = page.getByRole("radiogroup", { name: "Warnschwelle" });
  await klickeWennRuhig(lage.getByText("Unwetter", { exact: true }));
  await klickeWennRuhig(schwelle.getByText("Unwetterwarnung", { exact: true }));
  await expect(vorschau).toContainText("1 WARNUNG · Unwetterwarnung");
  await klickeWennRuhig(schwelle.getByText("Extremes Unwetter", { exact: true }));
  await expect(vorschau).toContainText("RUHE · 2 Warnungen unter Schwelle");
  await expect(erklaerung).toContainText("Kein Band");

  await klickeWennRuhig(page.getByRole("switch", { name: "Regenradar" }));
  await expect(page.getByText(/Ausgeschaltet:.*Regenradar/)).toBeVisible();
  await expect(page.getByText("Ungespeicherte Änderungen", { exact: false })).toBeVisible();

  await klickeWennRuhig(page.getByRole("button", { name: "Speichern" }));
  await expect(page.getByText("Gespeichert. Der Monitor zeigt es spätestens in einer Minute.")).toBeVisible();

  await page.getByLabel("Neuer Zugang").fill("FüKw e2e");
  await klickeWennRuhig(page.getByRole("button", { name: "Zugang anlegen" }));
  const zeilen = await page.getByTestId("neuer-schluessel").textContent();
  const schluessel = /LAGEMONITOR_SUITE_TOKEN=(\S+)/.exec(zeilen ?? "")?.[1];
  expect(schluessel).toMatch(/^[A-Za-z0-9_-]{43}$/);

  // Warmlauf ohne Schlüssel (Falle 10), zugleich die Gegenprobe.
  const ohne = await page.request.get(url("/api/konfiguration"));
  expect(ohne.status()).toBe(401);
  const mit = await page.request.get(url("/api/konfiguration"), { headers: { authorization: `Bearer ${schluessel}` } });
  expect(mit.status()).toBe(200);
  const vertrag = await mit.json();
  expect(vertrag).toMatchObject({ version: 1, warnThreshold: "Extreme", location: { label: ort } });
  expect(vertrag.modules.radar).toBe(false);
});

test("ohne Admin-Gruppe gibt es die Seite nicht", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "fahrzeuge-admin", callbackPath: "/" });
  const antwort = await page.goto(url("/"));
  expect(antwort?.status()).toBe(404);
});
