import { expect, test, type Page } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";

/**
 * Materialkisten im Modul wartung (IDA-335): der Admin legt eine Kiste an, erfasst am Telefon (320 px) ihre
 * Inhaltsliste, zählt durch und meldet eine Position als fehlend; die Akte zeigt den Mangel, und das Etikett
 * druckt auf A6 mit QR-Code und Inhaltsliste — gemessen an der MediaBox eines echten PDF (Falle 18).
 */
const HOST = "wartung.localtest.me";
const url = (p: string) => `http://${HOST}:${E2E_PORT}${p}`;
const PT_JE_MM = 72 / 25.4;

async function ohneUeberlauf(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function seitenInMm(page: Page): Promise<{ breite: number; hoehe: number }[]> {
  const pdf = await page.pdf({ preferCSSPageSize: true });
  return [...pdf.toString("latin1").matchAll(/MediaBox\s*\[\s*[\d.-]+\s+[\d.-]+\s+([\d.-]+)\s+([\d.-]+)/g)]
    .map((m) => ({ breite: Math.round(Number(m[1]) / PT_JE_MM), hoehe: Math.round(Number(m[2]) / PT_JE_MM) }));
}

test("Materialkiste anlegen, Inhalt am Telefon erfassen, durchzählen und Etikett drucken", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const name = `I&K-Kiste E2E ${Date.now() % 100_000}`;
  await devLogin(page, { host: HOST, email: "admin@localtest.me", groups: "wartung-admin", callbackPath: "/geraete" });
  await page.goto(url("/geraete"));
  await warteAufGestreamteInhalte(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Gerät anlegen" }));
  const dialog = page.getByRole("dialog", { name: "Gerät anlegen" });
  await dialog.getByLabel("I&K").check();
  await dialog.getByLabel("Geräteart").click();
  await klickeWennRuhig(page.locator(".ant-select-item-option", { hasText: "Materialkiste" }));
  await dialog.getByLabel("Bezeichnung").fill(name);
  await dialog.getByLabel("Standort").fill("Lager I&K, Regal 1");
  await klickeWennRuhig(dialog.getByRole("button", { name: "Speichern" }));
  await page.waitForURL(/\/geraete\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;
  await warteAufGestreamteInhalte(page);
  await expect(page.getByText("Inhalt (0)")).toBeVisible();

  // Am Telefon in der Halle: Inhalt erfassen.
  const handyKontext = await browser.newContext({ viewport: { width: 320, height: 720 }, storageState: await page.context().storageState() });
  const handy = await handyKontext.newPage();
  await handy.goto(url(`/g/${id}`));
  await warteAufGestreamteInhalte(handy);
  await klickeWennRuhig(handy.getByRole("link", { name: "Inhalt erfassen" }));
  await handy.waitForURL(/\/inhalt$/);
  await warteAufGestreamteInhalte(handy);
  for (const [text, soll, bemerkung] of [["HDMI-Kabel 2 m", "3", ""], ["USB-C-Hub", "2", "im Beutel"]] as const) {
    await klickeWennRuhig(handy.getByRole("button", { name: "Position hinzufügen" }));
    const zeile = handy.locator('[data-rolle="inhalt-zeile"]').last();
    await zeile.getByPlaceholder("Position").fill(text);
    await zeile.getByLabel(/Soll-Menge/).fill(soll);
    if (bemerkung) await zeile.getByPlaceholder("Bemerkung").fill(bemerkung);
  }
  await ohneUeberlauf(handy);
  await klickeWennRuhig(handy.getByRole("button", { name: "Speichern" }));
  await handy.waitForURL(new RegExp(`/g/${id}$`));
  await warteAufGestreamteInhalte(handy);
  await expect(handy.locator('[data-rolle="inhalt-posten"]')).toHaveCount(2);
  await expect(handy.getByRole("region", { name: "Inhalt" })).toContainText("2 ×USB-C-Hub · im Beutel");
  await ohneUeberlauf(handy);

  // Durchzählen: eine Position fehlt.
  await klickeWennRuhig(handy.getByRole("link", { name: "Durchzählen" }));
  await handy.waitForURL(/\/pruefung$/);
  await warteAufGestreamteInhalte(handy);
  await expect(handy.getByLabel("Betriebsstunden am Zähler")).toHaveCount(0);
  const punkte = handy.locator('[data-rolle="pruefpunkt"]');
  await expect(punkte).toHaveCount(2);
  await punkte.nth(0).getByText("Vollständig").click();
  await punkte.nth(1).getByText("Fehlt").click();
  await punkte.nth(1).getByLabel(/Fehlt bei/).fill("nur einer da");
  await ohneUeberlauf(handy);
  const senden = handy.waitForResponse((r) => r.url().endsWith(`/g/${id}/pruefung/senden`));
  await klickeWennRuhig(handy.getByRole("button", { name: "Durchzählen abschließen" }));
  expect((await senden).status()).toBe(200);
  await expect(handy.locator('[data-rolle="pruefung-fertig"]')).toContainText("1 Mangel ist gemeldet");
  await handyKontext.close();

  await page.reload();
  await warteAufGestreamteInhalte(page);
  await expect(page.getByText("Fehlt: USB-C-Hub (Soll 2) – nur einer da").first()).toBeVisible();

  // Das Etikett: A6 hochkant, eine Seite, mit Inhaltsliste.
  await page.goto(url(`/etiketten/kisten?geraet=${id}`));
  await warteAufGestreamteInhalte(page);
  const etikett = page.locator('[data-rolle="kistenetikett"]');
  await expect(etikett).toHaveCount(1);
  await expect(etikett).toContainText(name);
  await expect(etikett).toContainText("Lager I&K, Regal 1");
  await expect(etikett.locator("tbody tr")).toHaveCount(2);
  await expect(etikett.locator("svg")).toHaveCount(2); // Ortszeichen und QR-Code
  expect(await seitenInMm(page)).toEqual([{ breite: 105, hoehe: 148 }]);
});
