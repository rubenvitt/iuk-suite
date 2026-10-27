import { expect, test } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";

/**
 * Modul lagemonitor (LGM-5): die Vorschau folgt dem Formular vor dem Speichern, ein Zugang holt die
 * gespeicherten Einstellungen und Meldungen ab, ohne Recht gibt es die Seite nicht. Der Zustand entsteht im Test
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

  const radar = page.getByRole("switch", { name: "Regenradar" });
  // Auf „aus“ stellen, nicht blind umschalten: der Ausgangszustand kommt aus der Datenbank.
  if ((await radar.getAttribute("aria-checked")) === "true") await klickeWennRuhig(radar);
  await expect(radar).toHaveAttribute("aria-checked", "false");
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

test("Meldung steht in der Vorschau und im Drahtformat, Beenden nimmt sie weg", async ({ page }) => {
  const text = `Lagebesprechung e2e ${Date.now() % 100_000}`;
  await devLogin(page, { host: HOST, groups: "lagemonitor-admin", callbackPath: "/" });
  await page.goto(url("/"));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);
  // Reste eines abgebrochenen Laufs beenden: mehr als drei laufen nicht.
  const beenden = page.getByRole("button", { name: /^Meldung beenden:/ });
  while ((await beenden.count()) > 0) {
    const vorher = await beenden.count();
    await klickeWennRuhig(beenden.first());
    await expect(beenden).toHaveCount(vorher - 1);
  }

  const vorschau = page.getByTestId("monitor-vorschau");
  const neu = page.getByRole("form", { name: "Neue Meldung" });
  await neu.getByLabel("Text").fill(text);
  await neu.getByLabel("Herunterzählen bis (freiwillig)").fill("23:59");
  // Der Entwurf steht schon in der Vorschau, gestrichelt.
  await expect(page.getByTestId("vorschau-meldung").filter({ hasText: text })).toHaveAttribute("data-entwurf", "true");
  await expect(page.getByTestId("vorschau-erklaerung")).toContainText(`(noch nicht angelegt): „${text}“`);

  // Eine ungespeicherte Änderung an der Anzeige überlebt das Anlegen (neuer Stand vom Server).
  await page.getByLabel("Standort", { exact: true }).fill("Ungespeichert");
  await klickeWennRuhig(neu.getByRole("button", { name: "Meldung anlegen" }));
  const laufend = page.getByRole("list", { name: "Laufende Meldungen" });
  await expect(laufend).toContainText(text);
  await expect(page.getByLabel("Standort", { exact: true })).toHaveValue("Ungespeichert");
  await expect(page.getByTestId("vorschau-meldung").filter({ hasText: text })).toHaveAttribute("data-entwurf", "false");
  await expect(vorschau).toContainText(/in \d+( h)?/);

  await page.getByLabel("Neuer Zugang").fill("Meldungen e2e");
  await klickeWennRuhig(page.getByRole("button", { name: "Zugang anlegen" }));
  const schluessel = /LAGEMONITOR_SUITE_TOKEN=(\S+)/.exec((await page.getByTestId("neuer-schluessel").textContent()) ?? "")?.[1];
  const abholen = async () => (await (await page.request.get(url("/api/konfiguration"), { headers: { authorization: `Bearer ${schluessel}` } })).json()).notices as { text: string; countdownTo: string | null; expiresAt: string }[];
  const notices = await abholen();
  const n = notices.find((x) => x.text === text);
  expect(n?.countdownTo).toMatch(/T\d\d:\d\d:00\.000Z$/);
  // Ohne Angabe 24 Stunden.
  expect(Date.parse(n!.expiresAt) - Date.now()).toBeGreaterThan(23.9 * 3_600_000);

  await klickeWennRuhig(page.getByRole("button", { name: `Meldung beenden: ${text}` }));
  await expect(laufend).toHaveCount(0);
  expect((await abholen()).some((x) => x.text === text)).toBe(false);
});

test("ohne Admin-Gruppe gibt es die Seite nicht", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "fahrzeuge-admin", callbackPath: "/" });
  const antwort = await page.goto(url("/"));
  expect(antwort?.status()).toBe(404);
});
