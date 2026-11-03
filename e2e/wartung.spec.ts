import { expect, test } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";

/**
 * Modul wartung (IDA-312): die Verwaltung der Technik legt einen Stromerzeuger an, am Telefon läuft die
 * Prüfung mit Checkliste durch, eine Helferin ohne Verwaltungsrecht meldet einen Mangel „nicht
 * einsatzbereit“, die Verwaltung sieht ihn in der Akte und setzt ihn auf behoben. Die Verwaltung von I&K
 * kommt nicht an die Akte. Der Name trägt eine Zufallszahl, damit Wiederholungen durchlaufen.
 */
const HOST = "wartung.localtest.me";
const url = (p: string) => `http://${HOST}:${E2E_PORT}${p}`;

test("Gerät anlegen, prüfen, Mangel melden und beheben, fremde Gruppe abgewiesen", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const name = `Stromerzeuger E2E ${Date.now() % 100_000}`;
  await devLogin(page, { host: HOST, groups: "wartung-technik", callbackPath: "/geraete" });
  await page.goto(url("/geraete"));
  await warteAufGestreamteInhalte(page);
  await expect(page.getByRole("heading", { name: "Geräte" })).toBeVisible();

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

  // Eine Helferin ohne Verwaltungsrecht meldet einen Mangel.
  const helferKontext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const helfer = await helferKontext.newPage();
  await devLogin(helfer, { host: HOST, email: "helfer@localtest.me", groups: "helfer", callbackPath: `/g/${id}` });
  await helfer.goto(url(`/g/${id}/mangel`));
  await warteAufGestreamteInhalte(helfer);
  await helfer.getByLabel("Was ist los?").fill("Springt nicht an");
  await helfer.getByText("Nein, nicht einsatzbereit").click();
  const meldung = helfer.waitForResponse((r) => r.url().endsWith(`/g/${id}/mangel/senden`));
  await klickeWennRuhig(helfer.getByRole("button", { name: "Mangel melden" }));
  expect((await meldung).status()).toBe(200);
  await expect(helfer.locator('[data-rolle="mangel-fertig"]')).toBeVisible();
  // Die Akte bleibt ihr verschlossen.
  const zuAkte = await helfer.goto(url(`/geraete/${id}`));
  expect(zuAkte?.status()).toBe(404);
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

  // Die Verwaltung von I&K kommt nicht an ein Gerät der Technik.
  const iukKontext = await browser.newContext();
  const iuk = await iukKontext.newPage();
  await devLogin(iuk, { host: HOST, email: "iuk@localtest.me", groups: "wartung-iuk", callbackPath: "/geraete" });
  const fremd = await iuk.goto(url(`/geraete/${id}`));
  expect(fremd?.status()).toBe(404);
  await iukKontext.close();
});
