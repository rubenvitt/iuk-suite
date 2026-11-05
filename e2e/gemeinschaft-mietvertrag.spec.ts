import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";

/**
 * Modul gemeinschaft, Dokumente der Vermietung (IDA-343, IDA-354): Vorlage mit Formularfeldern hochladen und
 * Unterschriftenfelder aufziehen (Leitung), je Zusage ein Dokument ausfüllen, als Leitung unterschreiben und
 * freigeben; die mietende Person unterschreibt auf der Statusseite am Handy, vor Ort am Gerät der Leitung oder lädt
 * einen Ausdruck hoch. Telefonbreiten 320 und 390 ohne seitlichen Überlauf. Der Zustand entsteht im Test; Tage und
 * Anlässe sind je Lauf neu.
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

/** Eine Vorlage mit echtem Formular auf Seite 1: Textfeld „Kaution“, Ankreuzfeld „Reinigung“. */
async function formularVorlage(): Promise<Buffer> {
  const d = await PDFDocument.create();
  const s1 = d.addPage([595.28, 841.89]);
  s1.drawText("Mietvertrag Bar, Seite 1", { x: 60, y: 780, size: 14 });
  d.addPage([595.28, 841.89]).drawText("Mietvertrag Bar, Seite 2", { x: 60, y: 780, size: 14 });
  const form = d.getForm();
  form.createTextField("Kaution").addToPage(s1, { x: 100, y: 600, width: 200, height: 20 });
  form.createCheckBox("Reinigung").addToPage(s1, { x: 100, y: 560, width: 12, height: 12 });
  return Buffer.from(await d.save());
}

async function ladeVorlageHoch(page: Page, art: string, name: string, pdf: Buffer) {
  await oeffne(page, "/vermietung/mietvertrag");
  await klickeWennRuhig(page.getByTestId("vorlage-art").getByText(name.split(" ")[0].replace("protokoll", ""), { exact: true }));
  // Falle 10: Warmlauf-GET vor dem ersten POST.
  await page.request.get(url(`/vermietung/vorlage/datei?art=${art}`));
  const hoch = page.waitForResponse((r) => r.url().endsWith(`/vermietung/vorlage/datei?art=${art}`) && r.request().method() === "POST");
  await page.getByTestId("vorlage-datei").setInputFiles({ name: `${name}.pdf`, mimeType: "application/pdf", buffer: pdf });
  expect((await hoch).status()).toBe(200);
  await expect(page.getByTestId("vorlage")).toContainText(`${name}.pdf`);
}

/** Öffnet im Flyin der zugesagten Anfrage das Dokument (erstellt es) und landet auf der Ausfüllseite. */
async function erstelleDokument(leitung: Page, anlass: string, art: string) {
  await oeffne(leitung, "/vermietung/anfragen");
  await klickeWennRuhig(leitung.locator('[role=radio][data-wert="zugesagt"]'));
  await klickeWennRuhig(leitung.getByRole("button", { name: anlass }));
  await klickeWennRuhig(leitung.getByTestId(`dokument-${art}`).getByRole("button", { name: "Erstellen" }));
  await leitung.waitForURL(new RegExp(`/vermietung/dokument/[^/]+/${art}$`));
  await warteAufGestreamteInhalte(leitung);
}

async function zeichne(page: Page, testId: string) {
  const f = page.getByTestId(testId);
  await f.scrollIntoViewIfNeeded();
  const b = (await f.boundingBox())!;
  await ziehe(page, b.x + 20, b.y + b.height * 0.7, b.x + b.width - 20, b.y + b.height * 0.3);
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

test("Formularvorlage: Leitung füllt aus, unterschreibt, gibt frei; Unterschrift am Telefon, danach nur noch Download", async ({ page, browser }) => {
  await devLogin(page, { host: HOST, groups: LEITUNG, callbackPath: "/vermietung/mietvertrag" });
  await ladeVorlageHoch(page, "mietvertrag", "Mietvertrag Bar", await formularVorlage());
  // Die beiden Formularfelder kommen beim Hochladen mit.
  await expect(page.getByRole("list", { name: "Felder der Vorlage" }).getByRole("button")).toHaveCount(2);
  await keinUeberlauf(page, 320);
  await keinUeberlauf(page, 390);

  // Auf Seite 2 zwei Unterschriftenfelder aufziehen: eins für die mietende Person, eins für die Leitung.
  await klickeWennRuhig(page.getByRole("button", { name: "Nächste Seite" }));
  await expect(page.getByTestId("vorlage-seite")).toHaveText("Seite 2 von 2");
  await page.setViewportSize({ width: 1280, height: 1600 });
  await klickeWennRuhig(page.getByTestId("feld-neu-art").getByText("Unterschrift", { exact: true }));
  const flaeche = page.getByTestId("vorlage-flaeche");
  await expect(flaeche.locator("canvas")).toHaveAttribute("aria-label", "Seite 2 der Vorlage");
  const box = (await flaeche.boundingBox())!;
  await ziehe(page, box.x + box.width * 0.55, box.y + box.height * 0.8, box.x + box.width * 0.9, box.y + box.height * 0.9);
  await expect(page.getByTestId("feld-auswahl")).toBeVisible();
  await ziehe(page, box.x + box.width * 0.1, box.y + box.height * 0.8, box.x + box.width * 0.45, box.y + box.height * 0.9);
  await klickeWennRuhig(page.getByTestId("feld-rolle").getByText("Leitung", { exact: true }));
  await page.getByTestId("feld-name").fill("Unterschrift Leitung");
  await klickeWennRuhig(page.getByTestId("felder-speichern"));
  await expect(page.getByText("Felder gespeichert.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Felder der Vorlage" }).getByRole("button")).toHaveCount(4);

  const gast = await (await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true })).newPage();
  const anlass = `Vertrag e2e ${Date.now() % 100_000}`;
  const tag = zukunftsTag(11);
  const status = await frageAn(gast, tag, anlass);
  await sageZu(page, anlass);
  await page.setViewportSize({ width: 1280, height: 900 });
  await erstelleDokument(page, anlass, "mietvertrag");

  // Ausfüllen; die Unterschrift der Leitung speichert die Werte mit.
  await page.locator('[data-feld="f:0"]').fill("200 €");
  await page.getByText("Reinigung", { exact: true }).click();
  await expect(page.getByTestId("freigeben")).toBeDisabled();
  await page.getByTestId("leitung-name").fill("Leitung Bar");
  await zeichne(page, "leitung-flaeche");
  await klickeWennRuhig(page.getByTestId("leitung-unterschreiben"));
  await expect(page.getByTestId("leitung-unterschrieben")).toContainText("Leitung Bar");
  await expect(page.locator('[data-feld="f:0"]')).toHaveValue("200 €");
  await keinUeberlauf(page, 390);
  await page.setViewportSize({ width: 1280, height: 900 });

  // Vor der Freigabe steht nichts auf der Statusseite.
  await oeffne(gast, status);
  await expect(gast.getByTestId("dokument-mietvertrag")).toHaveCount(0);
  await klickeWennRuhig(page.getByTestId("freigeben"));
  await expect(page.getByTestId("freigabe-zurueck")).toBeVisible();
  await expect(page.locator('[data-feld="f:0"]')).toBeDisabled();

  await oeffne(gast, status);
  const bereich = gast.getByTestId("dokument-mietvertrag");
  await expect(bereich).toHaveAttribute("data-stand", "offen");
  await keinUeberlauf(gast, 320);
  await keinUeberlauf(gast, 390);

  // Das Dokument öffnet sich zum Ansehen, nicht als Download.
  const ansicht = await gast.request.get(url(`${status}/vertrag?art=mietvertrag`));
  expect(ansicht.headers()["content-disposition"]).toMatch(/^inline;/);

  await expect(bereich.getByRole("button", { name: "Unterschreiben" })).toBeDisabled();
  await zeichne(gast, "unterschrift-flaeche");
  await bereich.getByLabel("Ich habe das Dokument gelesen und bin einverstanden.").check();
  await klickeWennRuhig(bereich.getByRole("button", { name: "Unterschreiben" }));
  await expect(bereich).toHaveAttribute("data-stand", "unterschrieben");
  await keinUeberlauf(gast, 320);

  const fertig = await gast.request.get(url(`${status}/vertrag?art=mietvertrag`));
  expect(fertig.status()).toBe(200);
  expect(fertig.headers()["content-disposition"]).toMatch(/^attachment;/);
  // Name und PDF-Titel aus dem Vorgang, nicht aus der Vorlage (sonst hieß er „IDA“).
  expect(fertig.headers()["content-disposition"]).toContain(`filename*=UTF-8''${encodeURIComponent(`Mietvertrag Bar ${tag} 18.00 Uhr – unterschrieben.pdf`)}`);
  const fertigPdf = await PDFDocument.load(await fertig.body());
  expect(fertigPdf.getPageCount()).toBe(2);
  expect(fertigPdf.getTitle()).toBe(`Mietvertrag Bar ${tag} 18.00 Uhr – unterschrieben`);
  // Flach: im PDF-Betrachter lässt sich nichts mehr ändern.
  expect(fertigPdf.getForm().getFields()).toHaveLength(0);

  // Ein zweites Unterschreiben geht nicht; die Leitung kann die Freigabe nicht mehr zurücknehmen.
  const nochmal = await gast.request.post(url(`${status}/vertrag?art=mietvertrag`), { multipart: { datei: { name: "x.pdf", mimeType: "application/pdf", buffer: await vorlage(1) } } });
  expect(nochmal.status()).toBe(409);
  await page.reload();
  await expect(page.getByTestId("mieter-unterschrieben")).toBeVisible();
  await expect(page.getByTestId("freigabe-zurueck")).toHaveCount(0);

  await zieheZurueck(gast, status);
});

test("Übergabe ohne Felder: vor Ort am Gerät der Leitung unterschreiben, auf eigener letzter Seite", async ({ page, browser }) => {
  await devLogin(page, { host: HOST, groups: LEITUNG, callbackPath: "/vermietung/mietvertrag" });
  await ladeVorlageHoch(page, "uebergabe", "Übergabeprotokoll Bar", await vorlage(1));
  const gast = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  const anlass = `Übergabe e2e ${Date.now() % 100_000}`;
  const status = await frageAn(gast, zukunftsTag(47), anlass);
  await sageZu(page, anlass);
  // Tablet hochkant.
  await page.setViewportSize({ width: 768, height: 1024 });
  await erstelleDokument(page, anlass, "uebergabe");
  await klickeWennRuhig(page.getByTestId("freigeben"));
  await expect(page.getByTestId("mieter-name")).toHaveValue("Erika Sommer");
  await keinUeberlauf(page, 320);
  await page.setViewportSize({ width: 768, height: 1024 });
  await zeichne(page, "mieter-flaeche");
  await page.getByText("Gelesen und einverstanden").click();
  await klickeWennRuhig(page.getByTestId("mieter-unterschreiben"));
  await expect(page.getByTestId("mieter-unterschrieben")).toContainText("Erika Sommer");

  const fertig = await page.request.get(url(page.url().replace(/^.*\/vermietung\/dokument\/([^/]+)\/uebergabe$/, "/vermietung/vertrag/$1?art=uebergabe")));
  expect(fertig.status()).toBe(200);
  expect((await PDFDocument.load(await fertig.body())).getPageCount()).toBe(2);

  await oeffne(gast, status);
  await expect(gast.getByTestId("dokument-uebergabe")).toHaveAttribute("data-stand", "unterschrieben");
  await zieheZurueck(gast, status);
});

test("Rückgabe mit Zeichnen aus: Ausdruck als Foto hochladen; ohne Vorlage kein Erstellen", async ({ page, browser }) => {
  await devLogin(page, { host: HOST, groups: LEITUNG, callbackPath: "/vermietung/mietvertrag" });
  await ladeVorlageHoch(page, "rueckgabe", "Rückgabeprotokoll Bar", await vorlage(1));
  const schalter = page.getByTestId("vorlage-zeichnen");
  await expect(schalter).toHaveAttribute("aria-checked", "true");
  await klickeWennRuhig(schalter);
  await expect(schalter).toHaveAttribute("aria-checked", "false");

  const gast = await (await browser.newContext({ viewport: { width: 320, height: 800 } })).newPage();
  const anlass = `Foto e2e ${Date.now() % 100_000}`;
  const status = await frageAn(gast, zukunftsTag(77), anlass);
  await sageZu(page, anlass);
  await erstelleDokument(page, anlass, "rueckgabe");
  await klickeWennRuhig(page.getByTestId("freigeben"));
  await expect(page.getByTestId("freigabe-zurueck")).toBeVisible();
  await expect(page.getByTestId("zeichnen-mieter")).toHaveCount(0);

  await oeffne(gast, status);
  const bereich = gast.getByTestId("dokument-rueckgabe");
  await expect(bereich).toHaveAttribute("data-stand", "offen");
  await expect(gast.getByTestId("unterschrift-flaeche")).toHaveCount(0);
  // Ein 1×1-PNG als „Foto“; der Server macht daraus eine PDF.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const hoch = gast.waitForResponse((r) => r.url().includes(`${status}/vertrag?art=rueckgabe`) && r.request().method() === "POST");
  await gast.getByTestId("dokument-rueckgabe-hochladen").setInputFiles({ name: "IMG_0001.png", mimeType: "image/png", buffer: png });
  expect((await hoch).status()).toBe(200);
  await expect(bereich).toHaveAttribute("data-stand", "unterschrieben");
  const fertig = await gast.request.get(url(`${status}/vertrag?art=rueckgabe`));
  expect((await fertig.body()).subarray(0, 5).toString()).toBe("%PDF-");
  await zieheZurueck(gast, status);

  // Vorlage entfernen: zu einer neuen Zusage lässt sich keine Rückgabe mehr erstellen.
  await oeffne(page, "/vermietung/mietvertrag");
  await klickeWennRuhig(page.getByTestId("vorlage-art").getByText("Rückgabe", { exact: true }));
  await klickeWennRuhig(page.getByTestId("vorlage").getByRole("button", { name: "Entfernen" }));
  await klickeWennRuhig(page.locator(".ant-popconfirm").getByRole("button", { name: "Entfernen" }));
  await expect(page.getByText("Vorlage entfernt.")).toBeVisible();
  const anlass2 = `Ohne e2e ${Date.now() % 100_000}`;
  const status2 = await frageAn(gast, zukunftsTag(133), anlass2);
  await sageZu(page, anlass2);
  await klickeWennRuhig(page.locator('[role=radio][data-wert="zugesagt"]'));
  await klickeWennRuhig(page.getByRole("button", { name: anlass2 }));
  await expect(page.getByTestId("dokument-rueckgabe").getByRole("button", { name: "Erstellen" })).toHaveCount(0);
  await zieheZurueck(gast, status2);
});
