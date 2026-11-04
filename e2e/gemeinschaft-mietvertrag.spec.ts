import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";

/**
 * Modul gemeinschaft, digitaler Mietvertrag (IDA-343): Vorlage hochladen und Unterschriftenfeld aufziehen
 * (Leitung), nach der Zusage auf der Statusseite am Handy unterschreiben oder einen Ausdruck hochladen. Telefon-
 * breiten 320 und 390 ohne seitlichen Überlauf. Der Zustand entsteht im Test; Tage und Anlässe sind je Lauf neu.
 */
const HOST = "gemeinschaft.localtest.me";
const url = (p: string) => `http://${HOST}:${E2E_PORT}${p}`;
const LEITUNG = "gemeinschaft-admin";

function zukunftsTag(versatz: number): string {
  const tage = 220 + ((Math.floor(Date.now() / 1000) + versatz) % 280);
  return new Date(Date.now() + tage * 86_400_000).toISOString().slice(0, 10);
}

async function oeffne(page: Page, pfad: string) {
  await page.goto(url(pfad));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);
}

async function vorlage(seiten: number): Promise<Buffer> {
  const d = await PDFDocument.create();
  for (let i = 0; i < seiten; i++) d.addPage([595.28, 841.89]).drawText(`Mietvertrag Bar, Seite ${i + 1}`, { x: 60, y: 780, size: 14 });
  return Buffer.from(await d.save());
}

async function frageAn(page: Page, tag: string, anlass: string): Promise<string> {
  await oeffne(page, "/bar");
  await klickeWennRuhig(page.getByRole("button", { name: "Bar anfragen" }));
  const datum = page.locator('input[type="date"]');
  await datum.nth(0).fill(tag);
  await datum.nth(1).fill(tag);
  await page.locator('input[type="time"]').nth(0).fill("18:00");
  await page.locator('input[type="time"]').nth(1).fill("22:00");
  await page.getByLabel(/^Anlass/).fill(anlass);
  await page.getByLabel("Wie viele Personen kommen ungefähr?").fill("25");
  await page.getByLabel("Name", { exact: true }).fill("Erika Sommer");
  await page.getByLabel(/^Telefon oder E-Mail/).fill("05141 12345");
  await klickeWennRuhig(page.getByRole("button", { name: "Anfrage senden" }));
  await expect(page.getByText("Danke.")).toBeVisible();
  return new URL((await page.getByTestId("statuslink").textContent()) ?? "").pathname;
}

async function sageZu(leitung: Page, anlass: string) {
  await oeffne(leitung, "/vermietung/anfragen");
  await klickeWennRuhig(leitung.locator("tr", { hasText: anlass }).getByRole("button", { name: "Zusagen" }));
  await expect(leitung.getByText(/^Zugesagt\./)).toBeVisible();
}

async function zieheZurueck(gast: Page, status: string) {
  await oeffne(gast, status);
  await klickeWennRuhig(gast.getByRole("button", { name: "Anfrage zurückziehen" }));
  await klickeWennRuhig(gast.getByRole("button", { name: "Ja, zurückziehen" }));
  await expect(gast.getByTestId("status-stand")).toHaveText("Zurückgezogen");
}

async function keinUeberlauf(page: Page, breite: number) {
  await page.setViewportSize({ width: breite, height: 800 });
  await page.waitForTimeout(150);
  const b = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(b.scroll, `Überlauf bei ${breite}px`).toBeLessThanOrEqual(b.client);
}

/** Zieht schrittweise mit der Maus (Falle 11: kein `dragTo`). */
async function ziehe(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x1 + ((x2 - x1) * i) / 8, y1 + ((y2 - y1) * i) / 8);
  await page.mouse.up();
}

test.describe.configure({ mode: "serial" });

test("Vorlage mit Feld; Unterschrift am Telefon landet im Feld, danach nur noch Download", async ({ page, browser }) => {
  await devLogin(page, { host: HOST, groups: LEITUNG, callbackPath: "/vermietung/mietvertrag" });
  await oeffne(page, "/vermietung/mietvertrag");
  // Falle 10: Warmlauf-GET vor dem ersten POST.
  await page.request.get(url("/vermietung/vorlage/datei"));
  const hoch = page.waitForResponse((r) => r.url().endsWith("/vermietung/vorlage/datei") && r.request().method() === "POST");
  await page.getByTestId("vorlage-datei").setInputFiles({ name: "Mietvertrag Bar.pdf", mimeType: "application/pdf", buffer: await vorlage(2) });
  expect((await hoch).status()).toBe(200);
  await expect(page.getByTestId("vorlage")).toContainText("Mietvertrag Bar.pdf");

  // Seite 2 aufschlagen und das Feld unten rechts aufziehen.
  await expect(page.getByTestId("vorlage-seite")).toHaveText("Seite 1 von 2");
  await klickeWennRuhig(page.getByRole("button", { name: "Nächste Seite" }));
  await expect(page.getByTestId("vorlage-seite")).toHaveText("Seite 2 von 2");
  // Hoch genug, dass die ganze Seite im Bild ist: Mausereignisse außerhalb des Viewports kommen nicht an.
  await page.setViewportSize({ width: 1280, height: 1600 });
  const flaeche = page.getByTestId("vorlage-flaeche");
  await expect(flaeche.locator("canvas")).toHaveAttribute("aria-label", "Seite 2 der Vorlage");
  const box = (await flaeche.boundingBox())!;
  await ziehe(page, box.x + box.width * 0.5, box.y + box.height * 0.8, box.x + box.width * 0.9, box.y + box.height * 0.9);
  await klickeWennRuhig(page.getByRole("button", { name: "Feld speichern" }));
  await expect(page.getByText("Unterschriftenfeld gespeichert.")).toBeVisible();
  await expect(page.getByText("Seite 2", { exact: true })).toBeVisible();

  const gast = await (await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true })).newPage();
  const anlass = `Vertrag e2e ${Date.now() % 100_000}`;
  const status = await frageAn(gast, zukunftsTag(11), anlass);
  await oeffne(gast, status);
  await expect(gast.getByTestId("vertrag-unterschreiben")).toHaveCount(0);
  await sageZu(page, anlass);

  await oeffne(gast, status);
  const bereich = gast.getByTestId("vertrag-unterschreiben");
  await expect(bereich).toBeVisible();
  await keinUeberlauf(gast, 320);
  await keinUeberlauf(gast, 390);

  // Die Vorlage öffnet sich zum Ansehen, nicht als Download.
  const ansicht = await gast.request.get(url(`${status}/vertrag`));
  expect(ansicht.headers()["content-disposition"]).toMatch(/^inline;/);

  await expect(bereich.getByRole("button", { name: "Unterschreiben" })).toBeDisabled();
  await gast.getByTestId("unterschrift-flaeche").scrollIntoViewIfNeeded();
  const feld = (await gast.getByTestId("unterschrift-flaeche").boundingBox())!;
  await ziehe(gast, feld.x + 20, feld.y + feld.height * 0.7, feld.x + feld.width - 20, feld.y + feld.height * 0.3);
  await bereich.getByLabel("Ich habe den Vertrag gelesen und bin einverstanden.").check();
  await klickeWennRuhig(bereich.getByRole("button", { name: "Unterschreiben" }));
  await expect(gast.getByTestId("vertrag-status")).toContainText("Unterschrieben");
  await keinUeberlauf(gast, 320);

  const fertig = await gast.request.get(url(`${status}/vertrag`));
  expect(fertig.status()).toBe(200);
  expect(fertig.headers()["content-disposition"]).toMatch(/^attachment;/);
  expect((await PDFDocument.load(await fertig.body())).getPageCount()).toBe(2);

  // Ein zweites Unterschreiben geht nicht; die Leitung sieht „unterschrieben“ mit Datei.
  const nochmal = await gast.request.post(url(`${status}/vertrag`), { multipart: { datei: { name: "x.pdf", mimeType: "application/pdf", buffer: await vorlage(1) } } });
  expect(nochmal.status()).toBe(409);

  await zieheZurueck(gast, status);
});

test("Ausdruck als Foto hochladen; ohne Vorlage kein Vertrag auf der Statusseite", async ({ page, browser }) => {
  await devLogin(page, { host: HOST, groups: LEITUNG, callbackPath: "/vermietung/mietvertrag" });
  await oeffne(page, "/vermietung/mietvertrag");
  const gast = await (await browser.newContext({ viewport: { width: 320, height: 800 } })).newPage();
  const anlass = `Foto e2e ${Date.now() % 100_000}`;
  const status = await frageAn(gast, zukunftsTag(77), anlass);
  await sageZu(page, anlass);

  // Digitale Unterschrift aus: auf der Statusseite bleibt nur der Upload.
  await oeffne(page, "/vermietung/mietvertrag");
  const schalter = page.getByTestId("vorlage-zeichnen");
  await expect(schalter).toHaveAttribute("aria-checked", "true");
  await klickeWennRuhig(schalter);
  await expect(schalter).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("vorlage-flaeche")).toHaveCount(0);

  await oeffne(gast, status);
  await expect(gast.getByTestId("vertrag-unterschreiben")).toBeVisible();
  await expect(gast.getByTestId("unterschrift-flaeche")).toHaveCount(0);
  // Ein 1×1-PNG als „Foto“; der Server macht daraus eine PDF.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const hoch = gast.waitForResponse((r) => r.url().endsWith(`${status}/vertrag`) && r.request().method() === "POST");
  await gast.getByTestId("vertrag-hochladen").setInputFiles({ name: "IMG_0001.png", mimeType: "image/png", buffer: png });
  expect((await hoch).status()).toBe(200);
  await expect(gast.getByTestId("vertrag-status")).toContainText("Unterschrieben");
  const fertig = await gast.request.get(url(`${status}/vertrag`));
  expect((await fertig.body()).subarray(0, 5).toString()).toBe("%PDF-");
  await zieheZurueck(gast, status);

  // Vorlage entfernen: eine neue Zusage bekommt keinen Vertrag mehr.
  await oeffne(page, "/vermietung/mietvertrag");
  await klickeWennRuhig(page.getByTestId("vorlage").getByRole("button", { name: "Entfernen" }));
  await klickeWennRuhig(page.locator(".ant-popconfirm").getByRole("button", { name: "Entfernen" }));
  await expect(page.getByText("Vorlage entfernt.")).toBeVisible();
  const anlass2 = `Ohne e2e ${Date.now() % 100_000}`;
  const status2 = await frageAn(gast, zukunftsTag(133), anlass2);
  await sageZu(page, anlass2);
  await oeffne(gast, status2);
  await expect(gast.getByTestId("status-stand")).toHaveText("Zugesagt");
  await expect(gast.getByTestId("vertrag-unterschreiben")).toHaveCount(0);
  await zieheZurueck(gast, status2);
});
