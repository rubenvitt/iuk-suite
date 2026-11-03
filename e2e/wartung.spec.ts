import { expect, test } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";

/**
 * Modul wartung (IDA-312, IDA-337): der Admin ordnet der Technik einen Verwalter zu, der legt einen
 * Stromerzeuger an, am Telefon läuft die Prüfung mit Checkliste durch, jemand OHNE Anmeldung meldet über den
 * QR-Code einen Mangel „nicht einsatzbereit“, die Verwaltung sieht ihn in der Akte und setzt ihn auf behoben.
 * Ohne Anmeldung bleibt die Prüfung zu, ohne `wartung-nutzer` das Modul, und wer nur Zugang hat, kommt nicht
 * an die Akte. Der Name trägt eine Zufallszahl, damit Wiederholungen durchlaufen.
 */
const HOST = "wartung.localtest.me";
const url = (p: string) => `http://${HOST}:${E2E_PORT}${p}`;

test("Verwalter zuordnen, Gerät anlegen, prüfen, Mangel ohne Anmeldung melden und beheben", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const name = `Stromerzeuger E2E ${Date.now() % 100_000}`;
  const technik = `dev:technik-${Date.now() % 100_000}@localtest.me`;
  // Der künftige Verwalter öffnet das Modul einmal; danach kennt es ihn.
  await devLogin(page, { host: HOST, email: technik.slice(4), groups: "wartung-nutzer", callbackPath: "/geraete" });
  await page.goto(url("/geraete"));
  await warteAufGestreamteInhalte(page);
  await expect(page.getByRole("heading", { name: "Geräte" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gerät anlegen" })).toHaveCount(0);

  // Der Admin ordnet ihn der Technik zu.
  const adminKontext = await browser.newContext();
  const admin = await adminKontext.newPage();
  await devLogin(admin, { host: HOST, email: "admin@localtest.me", groups: "wartung-admin", callbackPath: "/gruppen" });
  await admin.goto(url("/gruppen"));
  await warteAufGestreamteInhalte(admin);
  await klickeWennRuhig(admin.getByRole("row", { name: /Technik/ }).getByRole("button", { name: "Bearbeiten" }));
  const gruppe = admin.getByRole("dialog", { name: "Gruppe bearbeiten" });
  await gruppe.getByLabel("Verwalter").fill("Dev");
  await klickeWennRuhig(admin.locator(`[data-vorschlag="${technik}"]`));
  await expect(admin.getByText("Dev User verwaltet jetzt Technik.")).toBeVisible();
  await expect(gruppe.locator(`[data-verwalter-person="${technik}"]`)).toBeVisible();
  await adminKontext.close();

  await page.reload();
  await warteAufGestreamteInhalte(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Gerät anlegen" }));
  const dialog = page.getByRole("dialog", { name: "Gerät anlegen" });
  await dialog.getByLabel("Bezeichnung").fill(name);
  await dialog.getByLabel("Standort").fill("Lager Technik");
  await dialog.getByLabel("Betriebsstunden").fill("100");
  await klickeWennRuhig(dialog.getByRole("button", { name: "Speichern" }));
  await page.waitForURL(/\/geraete\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;
  await warteAufGestreamteInhalte(page);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByRole("list", { name: "Fristen" })).toContainText("noch nie erledigt");

  // Am Gerät: Prüfung mit allen Punkten in Ordnung.
  const handyKontext = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await page.context().storageState() });
  const handy = await handyKontext.newPage();
  await handy.goto(url(`/g/${id}`));
  await warteAufGestreamteInhalte(handy);
  await expect(handy.getByRole("heading", { name })).toBeVisible();
  await klickeWennRuhig(handy.getByRole("link", { name: "Prüfung starten" }));
  await handy.waitForURL(/\/pruefung$/);
  await warteAufGestreamteInhalte(handy);
  await handy.getByLabel("Betriebsstunden am Zähler").fill("104");
  const anzahl = await handy.locator('[data-rolle="pruefpunkt"]').count();
  expect(anzahl).toBe(8);
  for (let i = 0; i < anzahl; i++) {
    await handy.locator('[data-rolle="pruefpunkt"]').nth(i).getByText("In Ordnung").click();
  }
  const senden = handy.waitForResponse((r) => r.url().endsWith(`/g/${id}/pruefung/senden`));
  await klickeWennRuhig(handy.getByRole("button", { name: "Prüfung abschließen" }));
  expect((await senden).status()).toBe(200);
  await expect(handy.locator('[data-rolle="pruefung-fertig"]')).toContainText("Prüfung gespeichert");
  expect(await handy.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await handyKontext.close();

  // Jemand ohne Anmeldung scannt den QR-Code und meldet einen Mangel.
  const gastKontext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const gast = await gastKontext.newPage();
  await gast.goto(url(`/g/${id}`));
  await warteAufGestreamteInhalte(gast);
  await expect(gast.getByRole("heading", { name })).toBeVisible();
  await expect(gast.getByRole("link", { name: "Prüfung starten" })).toHaveCount(0);
  await klickeWennRuhig(gast.getByRole("link", { name: "Mangel melden" }));
  await gast.waitForURL(/\/mangel$/);
  await warteAufGestreamteInhalte(gast);
  await gast.getByLabel("Was ist los?").fill("Springt nicht an");
  await gast.getByLabel("Dein Name").fill("Gast E2E");
  await gast.getByText("Nein, nicht einsatzbereit").click();
  const meldung = gast.waitForResponse((r) => r.url().endsWith(`/g/${id}/mangel/senden`));
  await klickeWennRuhig(gast.getByRole("button", { name: "Mangel melden" }));
  expect((await meldung).status()).toBe(200);
  await expect(gast.locator('[data-rolle="mangel-fertig"]')).toBeVisible();
  // Prüfung und Akte bleiben hinter der Anmeldung.
  await gast.goto(url(`/g/${id}/pruefung`));
  await expect(gast).toHaveURL(/\/login/);
  await gast.goto(url(`/geraete/${id}`));
  await expect(gast).toHaveURL(/\/login/);
  await gastKontext.close();

  // Angemeldet ohne wartung-nutzer: das Modul bleibt zu, melden geht trotzdem.
  const helferKontext = await browser.newContext();
  const helfer = await helferKontext.newPage();
  await devLogin(helfer, { host: HOST, email: "helfer@localtest.me", groups: "helfer", callbackPath: `/g/${id}` });
  expect((await helfer.goto(url("/geraete")))?.status()).toBe(404);
  await helfer.goto(url(`/g/${id}`));
  await warteAufGestreamteInhalte(helfer);
  await expect(helfer.getByRole("link", { name: "Mangel melden" })).toBeVisible();
  await helferKontext.close();

  // Die Verwaltung sieht den Mangel und behebt ihn.
  await page.reload();
  await warteAufGestreamteInhalte(page);
  await expect(page.getByText("Nicht einsatzbereit").first()).toBeVisible();
  const mangel = page.locator('[data-rolle="mangel"]').filter({ hasText: "Springt nicht an" });
  await klickeWennRuhig(mangel.getByRole("button", { name: "Behoben" }));
  await klickeWennRuhig(page.getByRole("tooltip").getByRole("button", { name: "Behoben" }));
  await expect(page.getByText("Als behoben eingetragen.")).toBeVisible();
  await expect(page.locator('[data-rolle="mangel"]').filter({ hasText: "Springt nicht an" })).toHaveCount(0);

  // Wer nur Zugang hat, aber die Technik nicht verwaltet, kommt nicht an die Akte.
  const iukKontext = await browser.newContext();
  const iuk = await iukKontext.newPage();
  await devLogin(iuk, { host: HOST, email: "iuk@localtest.me", groups: "wartung-nutzer", callbackPath: "/geraete" });
  const fremd = await iuk.goto(url(`/geraete/${id}`));
  expect(fremd?.status()).toBe(404);
  await iukKontext.close();
});
