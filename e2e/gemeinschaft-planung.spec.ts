import { expect, test, type Locator, type Page } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";

/**
 * Modul gemeinschaft, Planung (IDA-320): Projekt anlegen, Aufgabe anlegen und abhaken, Event im Projekt mit
 * „Bar belegen“, Konflikt beim zweiten Bar-Event, Kalender, Übersicht, Löschen. Titel und Tag tragen einen
 * Zufallsteil, damit Wiederholungen in derselben Datenbank durchlaufen; der benötigte Zustand entsteht im Test.
 */
const HOST = "gemeinschaft.localtest.me";
const url = (p: string) => `http://${HOST}:${E2E_PORT}${p}`;
const zufall = Date.now() % 100_000;
/** Ein Tag weit in der Zukunft, je Lauf ein anderer — damit die Bar nicht vom Vorlauf belegt ist. */
const TAG = 1 + (zufall % 27);
const datum = `${String(TAG).padStart(2, "0")}.03.2031`;
const isoTag = `2031-03-${String(TAG).padStart(2, "0")}`;

async function zeit(feld: Locator, wert: string): Promise<void> {
  await feld.click();
  await feld.fill(wert);
  await feld.press("Enter");
}

async function oeffne(page: Page, pfad: string): Promise<void> {
  await page.goto(url(pfad));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);
}

test("planen: Projekt, Aufgabe, Event mit Bar, Konflikt, Kalender, Übersicht, löschen", async ({ page }) => {
  const projekt = `Sommerfest ${zufall}`;
  const event = `Grillabend ${zufall}`;
  await devLogin(page, { host: HOST, groups: "gemeinschaft-admin", callbackPath: "/" });

  // Projekt anlegen → Detailseite.
  await oeffne(page, "/projekte");
  await klickeWennRuhig(page.getByRole("button", { name: "Projekt anlegen" }));
  const flyin = page.getByRole("dialog");
  await flyin.getByLabel("Titel").fill(projekt);
  await flyin.getByRole("button", { name: "Anlegen" }).click();
  await page.waitForURL(/\/v\/[^/?]+$/);
  await warteAufGestreamteInhalte(page);
  await expect(page.getByRole("heading", { name: projekt })).toBeVisible();
  const projektUrl = page.url();

  // Aufgabe ohne Zuständige anlegen, dann abhaken.
  await page.getByLabel("Neue Aufgabe").fill("Grill ausleihen");
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(page.getByText("0 von 1 erledigt · 1 ohne Zuständige")).toBeVisible();
  await page.getByLabel("„Grill ausleihen“ erledigt").check();
  await expect(page.getByText("1 von 1 erledigt", { exact: true })).toBeVisible();

  // Event in diesem Projekt, mit „Bar belegen“.
  await page.getByRole("button", { name: "Event anlegen" }).click();
  const evFlyin = page.getByRole("dialog");
  await evFlyin.getByLabel("Titel").fill(event);
  await zeit(evFlyin.getByLabel("Beginn"), `${datum} 18:00`);
  await zeit(evFlyin.getByLabel("Ende"), `${datum} 22:00`);
  await evFlyin.getByRole("switch", { name: /Bar belegen/ }).click();
  await evFlyin.getByRole("button", { name: "Anlegen" }).click();
  await page.waitForURL((u) => /\/v\/[^/?]+$/.test(u.pathname) && u.href !== projektUrl);
  await warteAufGestreamteInhalte(page);
  await expect(page.getByRole("heading", { name: event })).toBeVisible();
  await expect(page.getByRole("link", { name: projekt })).toBeVisible();
  await expect(page.getByText("Bar belegt")).toBeVisible();
  const eventUrl = page.url();

  // Ein zweites Bar-Event zur selben Zeit lässt sich nicht speichern.
  await oeffne(page, "/events");
  await klickeWennRuhig(page.getByRole("button", { name: "Event anlegen" }));
  const zweites = page.getByRole("dialog");
  await zweites.getByLabel("Titel").fill(`Quizabend ${zufall}`);
  await zeit(zweites.getByLabel("Beginn"), `${datum} 20:00`);
  await zeit(zweites.getByLabel("Ende"), `${datum} 23:00`);
  await zweites.getByRole("switch", { name: /Bar belegen/ }).click();
  await expect(zweites.getByText("Die Bar ist in dieser Zeit schon vergeben.")).toBeVisible();
  await expect(zweites.getByText(`Event „${event}“`, { exact: false })).toBeVisible();
  await expect(zweites.getByRole("button", { name: "Anlegen" })).toBeDisabled();
  await zweites.getByRole("button", { name: "Abbrechen" }).click();
  await expect(zweites).toBeHidden();

  // Kalender: das Event steht am Tag und führt auf seine Seite.
  await oeffne(page, `/kalender?tag=${isoTag}`);
  const eintrag = page.locator(`[data-tagesliste] a[href="${new URL(eventUrl).pathname}"]`);
  await expect(eintrag).toContainText(event);

  // Übersicht: Kacheln und „Als Nächstes“ stehen da.
  await oeffne(page, "/");
  await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
  await expect(page.getByText("Hier fehlt noch jemand")).toBeVisible();
  await expect(page.locator("[data-kachel='/projekte']")).toBeVisible();

  // Event löschen → zurück zur Liste, Projekt bleibt.
  await oeffne(page, new URL(eventUrl).pathname);
  await page.getByRole("button", { name: "Löschen", exact: true }).click();
  await page.locator(".ant-popconfirm").getByRole("button", { name: "Löschen" }).click();
  await page.waitForURL(/\/events$/);
  await oeffne(page, new URL(projektUrl).pathname);
  await expect(page.getByText("Noch keine Events.")).toBeVisible();
});

test("mobil: Übersicht, Kalender und Projektliste ohne waagerechtes Scrollen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await devLogin(page, { host: HOST, groups: "gemeinschaft-admin", callbackPath: "/" });
  for (const pfad of ["/", "/kalender", "/projekte", "/events"]) {
    await oeffne(page, pfad);
    const breite = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(breite, pfad).toBeLessThanOrEqual(390);
  }
});
