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

/**
 * IDA-300: Hinweise und Unterlagen am QR-Code. Der Admin trägt Hinweise ein und lädt ein PDF und ein Bild in die
 * Akte; jemand ohne Anmeldung sieht beides am Steckbrief (320 und 390 px ohne Querscrollen) und öffnet das PDF.
 * Hochladen bleibt ohne Anmeldung zu, eine Unterlage eines anderen Geräts gibt es unter dieser Adresse nicht.
 */
test("Hinweise und Unterlagen am QR-Code", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const name = `Zeltheizung E2E ${Date.now() % 100_000}`;
  await devLogin(page, { host: HOST, email: "admin@localtest.me", groups: "wartung-admin", callbackPath: "/geraete" });
  await page.goto(url("/geraete"));
  await warteAufGestreamteInhalte(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Gerät anlegen" }));
  const dialog = page.getByRole("dialog", { name: "Gerät anlegen" });
  await dialog.getByText("Technik", { exact: true }).click();
  await dialog.getByLabel("Bezeichnung").fill(name);
  await dialog.getByLabel("Standort").fill("Lager Technik");
  await dialog.getByLabel("Hinweise am Gerät").fill("Nur im Freien betreiben.\nAbgasschlauch nie ins Zelt legen.");
  await klickeWennRuhig(dialog.getByRole("button", { name: "Speichern" }));
  await page.waitForURL(/\/geraete\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;
  await warteAufGestreamteInhalte(page);
  await expect(page.getByText("Abgasschlauch nie ins Zelt legen.")).toBeVisible();

  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
  // 1×1 PNG.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");
  for (const [titel, datei] of [
    ["Betriebsanleitung", { name: "handbuch.pdf", mimeType: "application/pdf", buffer: pdf }],
    ["Schaltbild", { name: "schaltbild.png", mimeType: "image/png", buffer: png }],
  ] as const) {
    await klickeWennRuhig(page.getByRole("button", { name: "Hinzufügen" }));
    const hoch = page.getByRole("dialog", { name: "Unterlage hinzufügen" });
    await hoch.locator('input[type="file"]').setInputFiles(datei);
    await hoch.getByLabel("Titel").fill(titel);
    const antwort = page.waitForResponse((r) => r.url().endsWith(`/geraete/${id}/unterlagen`) && r.request().method() === "POST");
    await klickeWennRuhig(hoch.getByRole("button", { name: "Hochladen" }));
    expect((await antwort).status()).toBe(200);
    await expect(page.getByRole("list", { name: "Unterlagen" }).getByText(titel)).toBeVisible();
  }
  // Ein Text mit PDF-Namen ist kein PDF.
  await klickeWennRuhig(page.getByRole("button", { name: "Hinzufügen" }));
  const falsch = page.getByRole("dialog", { name: "Unterlage hinzufügen" });
  await falsch.locator('input[type="file"]').setInputFiles({ name: "boese.pdf", mimeType: "application/pdf", buffer: Buffer.from("<script>alert(1)</script>") });
  await klickeWennRuhig(falsch.getByRole("button", { name: "Hochladen" }));
  await expect(falsch.getByText("Bitte ein PDF oder ein Bild wählen.")).toBeVisible();
  await klickeWennRuhig(falsch.getByRole("button", { name: "Abbrechen" }));

  // Ohne Anmeldung am Telefon.
  for (const breite of [320, 390]) {
    const gastKontext = await browser.newContext({ viewport: { width: breite, height: 760 } });
    const gast = await gastKontext.newPage();
    await gast.goto(url(`/g/${id}`));
    await warteAufGestreamteInhalte(gast);
    await expect(gast.getByText("Nur im Freien betreiben.")).toBeVisible();
    const liste = gast.getByRole("list", { name: "Unterlagen" });
    await expect(liste.getByRole("link")).toHaveCount(2);
    expect(await gast.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const href = await liste.getByRole("link", { name: /Betriebsanleitung/ }).getAttribute("href");
    const datei = await gast.request.get(url(href!));
    expect(datei.status()).toBe(200);
    expect(datei.headers()["content-type"]).toBe("application/pdf");
    expect(datei.headers()["x-content-type-options"]).toBe("nosniff");
    expect((await datei.body()).subarray(0, 5).toString()).toBe("%PDF-");
    const bild = await gast.request.get(url((await liste.getByRole("link", { name: /Schaltbild/ }).getAttribute("href"))!));
    expect(bild.headers()["content-type"]).toBe("image/jpeg");
    expect(bild.headers()["content-security-policy"]).toContain("sandbox");
    // Dieselbe Unterlage unter einem anderen Gerät gibt es nicht.
    const uid = href!.split("/").pop()!;
    expect((await gast.request.get(url(`/g/00000000-0000-4000-8000-000000000000/unterlagen/${uid}`))).status()).toBe(404);
    // Hochladen ohne Anmeldung.
    const hoch = await gast.request.post(url(`/geraete/${id}/unterlagen`), { multipart: { titel: "x", datei: { name: "a.pdf", mimeType: "application/pdf", buffer: pdf } } });
    expect(hoch.status()).toBe(403);
    if (breite === 390) await gast.screenshot({ path: "test-results/wartung-steckbrief-390.png", fullPage: true });
    await gastKontext.close();
  }

  // Entfernen.
  const zeile = page.getByRole("list", { name: "Unterlagen" }).getByRole("listitem").filter({ hasText: "Schaltbild" });
  await klickeWennRuhig(zeile.getByRole("button", { name: "Schaltbild: Aktionen" }));
  await klickeWennRuhig(page.getByRole("menuitem", { name: "Entfernen" }));
  await klickeWennRuhig(page.getByRole("dialog", { name: "Schaltbild entfernen?" }).getByRole("button", { name: "Entfernen" }));
  await expect(page.getByText("Entfernt.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Unterlagen" }).getByRole("listitem")).toHaveCount(1);
  await page.screenshot({ path: "test-results/wartung-akte-unterlagen.png", fullPage: true });
});

/**
 * IDA-342: Steht ein Gerät auf einem Fahrzeug, schlägt das Feld die Fahrzeuge der Fahrzeugverwaltung vor,
 * auffindbar per Funkrufname; gespeichert wird der Name nach deren Regel. Am Telefon (320 px) ohne Querscrollen.
 */
test("Fahrzeug aus der Fahrzeugverwaltung per Funkrufname wählen", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const nr = Date.now() % 100_000;
  const kenner = `98-${nr}-1`;
  const fahrzeugKontext = await browser.newContext();
  const fv = await fahrzeugKontext.newPage();
  const fvUrl = (p: string) => `http://fahrzeuge.localtest.me:${E2E_PORT}${p}`;
  await devLogin(fv, { host: "fahrzeuge.localtest.me", groups: "fahrzeuge-admin", callbackPath: "/" });
  await fv.goto(fvUrl("/"));
  await warteAufGestreamteInhalte(fv);
  await klickeWennRuhig(fv.getByRole("button", { name: "Fahrzeug anlegen" }));
  const schublade = fv.getByRole("dialog");
  await schublade.getByLabel("Typ").fill("GW-Technik");
  await schublade.getByLabel("Funkrufname").fill(`Rotkreuz Wartungstest ${kenner}`);
  await schublade.getByLabel("Funkkenner").fill(kenner);
  await schublade.getByLabel("Standort").fill("Teststadt");
  await schublade.getByRole("button", { name: "Speichern" }).click();
  await expect(schublade).toBeHidden();
  await fahrzeugKontext.close();

  await page.setViewportSize({ width: 320, height: 720 });
  await devLogin(page, { host: HOST, email: "admin@localtest.me", groups: "wartung-admin", callbackPath: "/geraete" });
  await page.goto(url("/geraete"));
  await warteAufGestreamteInhalte(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Gerät anlegen" }));
  const dialog = page.getByRole("dialog", { name: "Gerät anlegen" });
  await dialog.getByText("Technik", { exact: true }).click();
  await dialog.getByLabel("Bezeichnung").fill(`Lichtmast E2E ${nr}`);
  await dialog.getByText("Fahrzeug", { exact: true }).click();
  await dialog.locator("#gw-ort").fill(`wartungstest ${kenner.replaceAll("-", "/")}`);
  const option = page.locator(".ant-select-item-option").filter({ hasText: `Rotkreuz Wartungstest ${kenner}` });
  await expect(option).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await option.click();
  await expect(dialog.locator("#gw-ort")).toHaveValue(`GW-Technik ${kenner}`);
  await klickeWennRuhig(dialog.getByRole("button", { name: "Speichern" }));
  await page.waitForURL(/\/geraete\/[0-9a-f-]{36}$/);
  await warteAufGestreamteInhalte(page);
  await expect(page.getByText(`GW-Technik ${kenner}`).first()).toBeVisible();
});
