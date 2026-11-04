import { expect, test, type Page } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";

/**
 * Modul gemeinschaft, Vermietung der Bar (IDA-315): öffentliche Anfrage ohne Login, Statusseite mit Link,
 * Entscheidung und Vertrag durch die Leitung, Sperrzeiten. Der Zustand entsteht im Test selbst; Tag und Anlass
 * sind je Lauf neu, damit Wiederholungen gegen dieselbe Datenbank nicht kollidieren.
 */
const HOST = "gemeinschaft.localtest.me";
const url = (p: string) => `http://${HOST}:${E2E_PORT}${p}`;
const LEITUNG = "gemeinschaft-admin";

/** Ein freier Tag weit in der Zukunft, je Lauf ein anderer (bis 18 Monate voraus nimmt die Bar Anfragen an). */
function zukunftsTag(versatz: number): string {
  const tage = 200 + ((Math.floor(Date.now() / 1000) + versatz) % 300);
  return new Date(Date.now() + tage * 86_400_000).toISOString().slice(0, 10);
}

async function oeffne(page: Page, pfad: string) {
  await page.goto(url(pfad));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);
}

/** Füllt das öffentliche Formular aus und schickt es ab; gibt den Statuspfad zurück. */
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
  const link = (await page.getByTestId("statuslink").textContent()) ?? "";
  const pfad = new URL(link).pathname;
  expect(pfad).toMatch(/^\/status\/[A-Za-z0-9_-]{22}$/);
  return pfad;
}

test("Anfrage ohne Login, Zusage und zurückgenommene Zusage auf der Statusseite", async ({ page, browser }) => {
  const tag = zukunftsTag(0);
  const anlass = `Geburtstag e2e ${Date.now() % 100_000}`;
  const status = await frageAn(page, tag, anlass);

  await oeffne(page, status);
  await expect(page.getByTestId("status-stand")).toHaveText("Angefragt");
  await expect(page.getByText(anlass)).toBeVisible();

  // Leitung in eigenem Kontext: die öffentliche Seite bleibt ohne Anmeldung.
  const leitung = await (await browser.newContext()).newPage();
  await devLogin(leitung, { host: HOST, groups: LEITUNG, callbackPath: "/vermietung/anfragen" });
  await oeffne(leitung, "/vermietung/anfragen");
  const zeile = leitung.locator("tr", { hasText: anlass });
  await klickeWennRuhig(zeile.getByRole("button", { name: "Zusagen" }));
  await expect(leitung.getByText(/^Zugesagt\./)).toBeVisible();

  await oeffne(page, status);
  await expect(page.getByTestId("status-stand")).toHaveText("Zugesagt");

  // Der Tag ist jetzt öffentlich belegt — ohne Anlass oder Name.
  await oeffne(page, "/bar");
  for (let i = 0; i < 24 && !(await page.locator(`[data-tag="${tag}"]`).count()); i++) await page.getByRole("button", { name: "Nächster Monat" }).click();
  await expect(page.locator(`[data-tag="${tag}"]`)).toHaveAttribute("aria-label", /belegt$/);
  await expect(page.locator("body")).not.toContainText(anlass);

  // Der Tag zeigt die belegte Zeit, nicht wer oder warum.
  await klickeWennRuhig(page.locator(`[data-tag="${tag}"]`));
  await expect(page.getByTestId("tag-info")).toContainText("belegt 18:00–22:00 Uhr");

  // Zusage zurücknehmen mit Begründung.
  await oeffne(leitung, "/vermietung/anfragen");
  await klickeWennRuhig(leitung.getByText("Zugesagt (", { exact: false }));
  await klickeWennRuhig(leitung.locator("tr", { hasText: anlass }).getByRole("button", { name: anlass }));
  await klickeWennRuhig(leitung.getByRole("button", { name: "Zusage zurücknehmen" }));
  await leitung.locator("#begruendung").fill("Wasserschaden in der Bar, tut uns leid.");
  await klickeWennRuhig(leitung.locator(".ant-modal").getByRole("button", { name: "Zurücknehmen" }));
  await expect(leitung.getByText(/^Zusage zurückgenommen\./)).toBeVisible();

  await oeffne(page, status);
  await expect(page.getByTestId("status-stand")).toHaveText("Abgelehnt");
  await expect(page.getByTestId("status-begruendung")).toHaveText("Wasserschaden in der Bar, tut uns leid.");
  await expect(page.getByRole("button", { name: "Anfrage zurückziehen" })).toHaveCount(0);
});

test("Zurückziehen mit Rückfrage; unbekannter Code ist eine 404 ohne Details", async ({ page }) => {
  const status = await frageAn(page, zukunftsTag(101), `Vereinstreffen e2e ${Date.now() % 100_000}`);
  await oeffne(page, status);
  await klickeWennRuhig(page.getByRole("button", { name: "Anfrage zurückziehen" }));
  await expect(page.getByText("Wirklich zurückziehen?")).toBeVisible();
  await klickeWennRuhig(page.getByRole("button", { name: "Ja, zurückziehen" }));
  await expect(page.getByTestId("status-stand")).toHaveText("Zurückgezogen");

  for (const pfad of ["/status/AAAAAAAAAAAAAAAAAAAAAA", "/status/kurz"]) {
    const antwort = await page.goto(url(pfad));
    expect(antwort?.status(), pfad).toBe(404);
    await expect(page.getByRole("heading", { name: "Diese Anfrage gibt es nicht." })).toBeVisible();
  }
});

test("Vertrag als PDF ablegen und herunterladen; nur Leitung, nur PDF", async ({ page, browser }) => {
  const anlass = `Abschluss e2e ${Date.now() % 100_000}`;
  const gast = await (await browser.newContext()).newPage();
  const tag = zukunftsTag(202);
  const status = await frageAn(gast, tag, anlass);

  await devLogin(page, { host: HOST, groups: LEITUNG, callbackPath: "/vermietung/anfragen" });
  await oeffne(page, "/vermietung/anfragen");
  await klickeWennRuhig(page.locator("tr", { hasText: anlass }).getByRole("button", { name: "Zusagen" }));
  await expect(page.getByText(/^Zugesagt\./)).toBeVisible();
  await klickeWennRuhig(page.getByText("Zugesagt (", { exact: false }));
  await klickeWennRuhig(page.locator("tr", { hasText: anlass }).getByRole("button", { name: anlass }));
  const kasten = page.getByTestId("vertrag");
  await expect(kasten).toBeVisible();

  // Falle 10: Warmlauf-GET vor dem ersten POST auf den Handler (unbekannte Kennung, also 404 — kompiliert nur).
  expect((await page.request.get(url("/vermietung/vertrag/00000000-0000-0000-0000-000000000000"))).status()).toBe(404);
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  const hochladen = page.waitForResponse((r) => r.url().includes("/vermietung/vertrag/") && r.request().method() === "POST");
  await page.getByTestId("vertrag-datei").setInputFiles({ name: "Mietvertrag Sommer.pdf", mimeType: "application/pdf", buffer: pdf });
  expect((await hochladen).status()).toBe(200);
  await expect(page.getByText("Vertrag abgelegt.")).toBeVisible();
  // Der Name kommt aus dem Vorgang, nicht aus der hochgeladenen Datei.
  const name = `Mietvertrag Bar ${tag} – unterschrieben.pdf`;
  const download = kasten.getByRole("link", { name });
  await expect(download).toBeVisible();
  const pfad = (await download.getAttribute("href"))!;

  const antwort = await page.request.get(url(pfad));
  expect(antwort.status()).toBe(200);
  expect(antwort.headers()["content-type"]).toBe("application/pdf");
  expect(antwort.headers()["content-disposition"]).toMatch(/^attachment;/);
  expect(antwort.headers()["content-disposition"]).toContain(`filename*=UTF-8''${encodeURIComponent(name)}`);
  expect((await antwort.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // Keine PDF: abgelehnt. Ohne Anmeldung: 404.
  const falsch = await page.request.post(url(pfad), { multipart: { datei: { name: "x.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html></html>") } } });
  expect(falsch.status()).toBe(415);
  expect((await gast.request.get(url(pfad))).status()).toBe(404);

  // Aufräumen: die Zusage gibt den Tag für spätere Läufe wieder frei.
  await oeffne(gast, status);
  await klickeWennRuhig(gast.getByRole("button", { name: "Anfrage zurückziehen" }));
  await klickeWennRuhig(gast.getByRole("button", { name: "Ja, zurückziehen" }));
  await expect(gast.getByTestId("status-stand")).toHaveText("Zurückgezogen");
});

test("Sperrzeit anlegen macht den Tag öffentlich belegt; Löschen gibt ihn frei", async ({ page, browser }) => {
  const tag = zukunftsTag(303);
  const grund = `Wartung e2e ${Date.now() % 100_000}`;
  await devLogin(page, { host: HOST, groups: LEITUNG, callbackPath: "/vermietung/sperrzeiten" });
  await oeffne(page, "/vermietung/sperrzeiten");
  await klickeWennRuhig(page.getByRole("button", { name: "Sperrzeit eintragen" }));
  const dialog = page.locator(".ant-modal");
  await dialog.locator('input[type="date"]').nth(0).fill(tag);
  await dialog.locator('input[type="date"]').nth(1).fill(tag);
  await dialog.locator('input[type="time"]').nth(0).fill("08:00");
  await dialog.locator('input[type="time"]').nth(1).fill("20:00");
  await dialog.getByPlaceholder(/^Zum Beispiel/).fill(grund);
  await klickeWennRuhig(dialog.getByRole("button", { name: "Eintragen" }));
  await expect(page.getByText(/^Sperrzeit eingetragen\./)).toBeVisible();

  const gast = await (await browser.newContext()).newPage();
  await oeffne(gast, "/bar");
  for (let i = 0; i < 24 && !(await gast.locator(`[data-tag="${tag}"]`).count()); i++) await gast.getByRole("button", { name: "Nächster Monat" }).click();
  await expect(gast.locator(`[data-tag="${tag}"]`)).toHaveAttribute("aria-label", /belegt$/);
  await expect(gast.locator("body")).not.toContainText(grund);

  await oeffne(page, "/vermietung/sperrzeiten");
  await klickeWennRuhig(page.locator("tr", { hasText: grund }).getByRole("button", { name: "Löschen" }));
  await klickeWennRuhig(page.locator(".ant-popconfirm").getByRole("button", { name: "Löschen" }));
  await expect(page.getByText("Sperrzeit gelöscht.")).toBeVisible();
});

test("Belegung führt zur Anfrageseite und liefert das QR-Plakat als PDF", async ({ page, browser }) => {
  await devLogin(page, { host: HOST, groups: LEITUNG, callbackPath: "/vermietung" });
  await oeffne(page, "/vermietung");
  const kopf = page.getByTestId("seitenkopf-aktionen");
  await expect(kopf.getByRole("link", { name: "Anfrageseite" })).toHaveAttribute("href", url("/bar"));
  const plakat = await page.request.get(url("/vermietung/plakat"));
  expect(plakat.status()).toBe(200);
  expect(plakat.headers()["content-type"]).toBe("application/pdf");
  expect((await plakat.body()).subarray(0, 5).toString("ascii")).toBe("%PDF-");

  const gast = await (await browser.newContext()).request.get(url("/vermietung/plakat"));
  expect(gast.status()).toBe(404);
});

test("ohne Leitungsrecht gibt es die Vermietung nicht", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "fahrzeuge-admin", callbackPath: "/vermietung" });
  const antwort = await page.goto(url("/vermietung"));
  expect(antwort?.status()).toBe(404);
  expect((await page.request.get(url("/vermietung/plakat"))).status()).toBe(404);
});
