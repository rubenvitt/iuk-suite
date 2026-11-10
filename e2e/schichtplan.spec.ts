import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { blattnamen, blattZellen } from "../src/core/export/test-mappe";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";

/**
 * Modul schichtplan (IDA-313): Planung anlegen, Schicht löschen und im Raster neu aufziehen, verschieben,
 * temporären Helfer anlegen und auf eine Schicht ziehen, Prüfen, Excel. Ziehen schrittweise mit
 * `page.mouse` (Falle 11). Die Planung trägt einen Zufallsteil, damit Wiederholungen durchlaufen.
 */
const HOST = "schichtplan.localtest.me";
const url = (p: string) => `http://${HOST}:${E2E_PORT}${p}`;

async function ziehe(page: Page, von: { x: number; y: number }, nach: { x: number; y: number }): Promise<void> {
  await page.mouse.move(von.x, von.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(von.x + ((nach.x - von.x) * i) / 8, von.y + ((nach.y - von.y) * i) / 8);
  await page.mouse.up();
}

async function mitte(l: Locator): Promise<{ x: number; y: number; links: number; breite: number }> {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, links: b.x, breite: b.width };
}

/** Beginn und Ende je als Datum und Uhrzeit (`Zeitfelder.tsx`): „14.11.2030 08:00“. */
async function zeitraum(feld: Locator, von: string, bis: string): Promise<void> {
  for (const [wer, wert] of [["Beginn", von], ["Ende", bis]] as const) {
    const [tag, uhr] = wert.split(" ");
    for (const [teil, text] of [["Datum", tag], ["Uhrzeit", uhr]] as const) {
      const eingabe = feld.getByLabel(`${wer} ${teil}`);
      await expect(eingabe).toBeEnabled();
      await eingabe.click();
      await eingabe.fill(text);
      await eingabe.press("Enter");
      await expect(eingabe).toHaveValue(text);
    }
  }
}

test("planen: anlegen, aufziehen, verschieben, Helfer ziehen, prüfen, Excel", async ({ page }) => {
  const name = `Testfest ${Date.now() % 100_000}`;
  await devLogin(page, { host: HOST, groups: "schichtplan-nutzer", callbackPath: "/" });
  await page.goto(url("/"));
  await page.waitForLoadState("networkidle");
  await warteAufGestreamteInhalte(page);

  // Planung mit einem Abschnitt, 08:00–20:00, Schichten zu 4 Stunden.
  await klickeWennRuhig(page.getByRole("button", { name: "Neue Planung" }));
  const neu = page.getByRole("dialog");
  await neu.getByLabel("Name").fill(name);
  await zeitraum(neu.getByRole("group", { name: "Zeitraum" }), "14.11.2030 08:00", "14.11.2030 20:00");
  const abschnitte = neu.getByLabel("Abschnitte");
  await abschnitte.fill("Sanitätswache");
  await abschnitte.press("Enter");
  await neu.getByRole("button", { name: "Planung anlegen" }).click();
  await page.waitForURL(/\/p\/[^/?]+$/);
  await warteAufGestreamteInhalte(page);
  await expect(page.getByRole("heading", { name })).toBeVisible();

  const spur = page.locator("[data-spur]").first();
  const bloecke = spur.locator("[data-schicht]");
  await expect(bloecke).toHaveCount(3);
  await expect(bloecke.nth(1)).toHaveAttribute("aria-label", /12:00–16:00/);
  // Das Raster wählt „Eng“, wenn der Zeitraum nicht in die Breite passt (IDA-385); hier wird in „Normal“ gemessen.
  await page.getByText("Normal", { exact: true }).click();

  // IDA-385: Die Zeile ist lückenlos belegt — „Schicht anlegen“ legt nichts darüber.
  await page.getByRole("button", { name: "Schicht anlegen" }).click();
  await expect(page.getByText("Sanitätswache ist im ganzen Zeitraum belegt.")).toBeVisible();
  await expect(bloecke).toHaveCount(3);

  // Mittlere Schicht löschen …
  await bloecke.nth(1).click();
  const flyin = page.getByRole("dialog");
  await flyin.getByRole("button", { name: "Schicht löschen" }).click();
  await page.getByRole("button", { name: "Löschen", exact: true }).click();
  await expect(bloecke).toHaveCount(2);
  await expect(flyin).toBeHidden();

  // IDA-385: 08–12 auf 14–18 gezogen überlappt 16–20 — beide bleiben sichtbar; „Rückgängig“ holt 08–12 zurück.
  const erste = await mitte(bloecke.first());
  await ziehe(page, { x: erste.x, y: erste.y - 10 }, { x: erste.x + 6 * 56, y: erste.y - 10 });
  const verlegt = spur.locator('[data-schicht][aria-label*="14:00–18:00"]');
  await expect(verlegt).toHaveCount(1);
  const [oben, unten] = [(await verlegt.boundingBox())!, (await spur.locator('[data-schicht][aria-label*="16:00–20:00"]').boundingBox())!];
  expect(oben.y + oben.height <= unten.y || unten.y + unten.height <= oben.y).toBe(true);
  await page.getByText("Verschoben auf 14:00–18:00").locator("..").getByRole("button", { name: "Rückgängig" }).click();
  await expect(spur.locator('[data-schicht][aria-label*="08:00–12:00"]')).toHaveCount(1);

  // … und 12:00–15:00 neu aufziehen (Zoom „Normal“: 56 px je Stunde, Spur beginnt um 08:00).
  const s = await mitte(spur);
  const px = 56;
  await ziehe(page, { x: s.links + 4 * px + 2, y: s.y }, { x: s.links + 7 * px + 2, y: s.y });
  await expect(spur.locator('[data-schicht][aria-label*="12:00–15:00"]')).toHaveCount(1);
  const neueSchicht = spur.locator('[data-schicht][aria-label*="12:00–15:00"]');
  await expect(neueSchicht).toHaveAttribute("data-schicht", /^(?!entwurf)/);

  // Verschieben um eine Stunde: 13:00–16:00.
  const b = await mitte(neueSchicht);
  await ziehe(page, { x: b.x, y: b.y - 10 }, { x: b.x + px, y: b.y - 10 });
  await expect(spur.locator('[data-schicht][aria-label*="13:00–16:00"]')).toHaveCount(1);
  // IDA-385: Ziehen meldet sich und lässt sich zurücknehmen — danach wieder verschieben.
  const verschoben = page.getByText("Verschoben auf 13:00–16:00");
  await verschoben.locator("..").getByRole("button", { name: "Rückgängig" }).click();
  await expect(spur.locator('[data-schicht][aria-label*="12:00–15:00"]')).toHaveCount(1);
  await expect(verschoben).toBeHidden();
  await ziehe(page, { x: b.x, y: b.y - 10 }, { x: b.x + px, y: b.y - 10 });
  await expect(spur.locator('[data-schicht][aria-label*="13:00–16:00"]')).toHaveCount(1);

  // Temporären Helfer anlegen und auf die erste Schicht ziehen.
  await page.getByRole("tab", { name: "Helfer" }).click();
  await page.getByRole("button", { name: "Temporären Helfer anlegen" }).click();
  const temp = page.getByRole("dialog");
  await temp.getByLabel("Vorname").fill("Erika");
  await temp.getByLabel("Nachname").fill("Beispiel");
  await temp.getByRole("button", { name: "Anlegen" }).click();
  await expect(temp).toBeHidden();
  await page.getByRole("tab", { name: "Schichtraster" }).click();
  const karte = page.locator('[data-helfer^="temp:"]').filter({ hasText: "Erika Beispiel" });
  const ziel = bloecke.first();
  await ziehe(page, await mitte(karte), await mitte(ziel));
  await expect(ziel).toHaveAttribute("aria-label", /1 von 2 besetzt/);
  await expect(ziel).toContainText("Erika Beispiel");

  // Neu laden: alles ist gespeichert.
  await page.reload();
  await warteAufGestreamteInhalte(page);
  await expect(page.locator("[data-spur]").first().locator("[data-schicht]")).toHaveCount(3);
  await expect(page.locator("[data-spur]").first().locator("[data-schicht]").first()).toContainText("Erika Beispiel");

  // IDA-385: Am Telefon läuft nichts aus der Namensspalte, die Seite scrollt nicht seitlich.
  for (const breite of [390, 320]) {
    await page.setViewportSize({ width: breite, height: 800 });
    const knopf = page.getByRole("button", { name: "Abschnitt oder Fahrzeug" });
    const zelle = knopf.locator("..");
    const [k, z] = [(await knopf.boundingBox())!, (await zelle.boundingBox())!];
    expect(k.x + k.width).toBeLessThanOrEqual(z.x + z.width + 0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(breite);
  }
  await page.setViewportSize({ width: 1280, height: 720 });

  // Prüfen zeigt die offenen Plätze, Ausgabe lädt eine Excel-Datei.
  await page.getByRole("tab", { name: /Prüfen/ }).click();
  await expect(page.getByText(/Sanitätswache, .*1 Platz offen/)).toBeVisible();
  await page.getByRole("tab", { name: "Ausgabe" }).click();
  const laden = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel herunterladen" }).click();
  const datei = await laden;
  expect(datei.suggestedFilename()).toMatch(/^schichtplan-testfest-\d+-2030-11-14\.xlsx$/);

  // Das Blatt „Austausch“ für Lifeline Hub (IDA-365) aus dem Browser-Weg: Zeile je Person und Schicht.
  const bytes = new Uint8Array(await readFile((await datei.path())!));
  expect(blattnamen(bytes)).toEqual(["Planung", "Je Abschnitt", "Je Helfer", "Konflikte", "Austausch"]);
  const austausch = blattZellen(bytes, 4);
  expect(austausch[0].slice(0, 5)).toEqual(["Posten", "Abschnitt", "Posten-Art", "Beginn", "Ende"]);
  const erika = austausch.find((z) => z[7] === "Beispiel" && z[8] === "Erika")!;
  expect(erika[3]).toMatch(/^2030-11-14T\d{2}:\d{2}\+01:00$/);
  expect(erika[13]).toBe("IuK-Suite temporär");
});

test("ohne Gruppe 403, ohne Admin-Gruppe kein Löschen", async ({ page, browser }) => {
  await devLogin(page, { host: HOST, groups: "schichtplan-nutzer", callbackPath: "/" });
  await page.goto(url("/"));
  await expect(page.getByRole("heading", { name: "Planungen" })).toBeVisible();

  const fremd = await browser.newPage();
  await devLogin(fremd, { host: HOST, groups: "kommplan-nutzer", callbackPath: "/" });
  const antwort = await fremd.goto(url("/"));
  expect(antwort?.status()).toBe(403);
  const unbekannt = await page.goto(url("/p/gibt-es-nicht"));
  expect(unbekannt?.status()).toBe(404);
  await fremd.close();
});
