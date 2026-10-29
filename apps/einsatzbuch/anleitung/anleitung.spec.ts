/**
 * DIE ANWENDERANLEITUNG FÜR DEN EINSATZBUCH-RECHNER (IDA-289) — zwei A4-Blätter mit Bildern der
 * Desktop-App: Einsatz erfassen, dann prüfen und versiegeln. Gegenstück zur Lagerbuch-Helfer-
 * Anleitung, die das Handy zeigt.
 *
 * Fährt die Oberfläche wie `e2e/erfassung.spec.ts` gegen den Stub (`../e2e/stub.ts`), macht an
 * jedem Schritt ein Bild mit rotem Rahmen um das, worauf es ankommt, setzt die Bilder in
 * `vorlage.html` ein und druckt sie nach `public/m/einsatzbuch/rechner-anleitung.pdf` der Suite.
 * Ändert sich die Erfassung sichtbar, `pnpm anleitung` neu fahren und das PDF mit committen.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { installiereStub } from "../e2e/stub";

const VORLAGE = path.join(import.meta.dirname, "vorlage.html");
const ZIEL = path.join(import.meta.dirname, "../../../public/m/einsatzbuch/rechner-anleitung.pdf");
const RAHMEN = "[data-anleitung]{outline:4px solid #c8000f !important;outline-offset:4px;border-radius:10px;}";

/** Ein Bild des ganzen Fensters; `ziele` bekommen den roten Rahmen, `mitte` wird vorher mittig gerollt. */
async function bild(page: Page, bilder: Map<string, Buffer>, name: string, ziele: Locator[] = [], mitte?: Locator) {
  if (mitte) await mitte.evaluate((e) => e.scrollIntoView({ block: "center" }));
  for (const z of ziele) await z.evaluate((e) => e.setAttribute("data-anleitung", ""));
  // Der Wechsel der Fokus- und Hover-Zustände braucht einen Frame, sonst fehlt der Rahmen im Bild.
  await page.waitForTimeout(250);
  bilder.set(name, await page.screenshot({ type: "jpeg", quality: 82 }));
  for (const z of ziele) await z.evaluate((e) => e.removeAttribute("data-anleitung"));
}

test("Anleitung für den Einsatzbuch-Rechner erzeugen", async ({ page }) => {
  const bilder = new Map<string, Buffer>();
  // Echter Betrieb, damit kein Testband im Bild steht; 15 Minuten wie in der Praxis.
  await installiereStub(page, { betrieb: "echt", fristSekunden: 15 * 60 });
  await page.addInitScript((css) => {
    document.addEventListener("DOMContentLoaded", () => {
      const stil = document.createElement("style");
      stil.textContent = css;
      document.head.appendChild(stil);
    });
  }, RAHMEN);
  await page.goto("/");

  const oeffnen = page.getByRole("button", { name: "Einsatz öffnen" });
  await expect(oeffnen).toBeVisible();
  await bild(page, bilder, "1-start", [oeffnen]);

  await oeffnen.click();
  await expect(page.getByRole("heading", { name: "Neuer Einsatz" })).toBeVisible();
  const karte = (titel: string) => page.locator(".karte").filter({ hasText: titel }).first();
  await page.getByRole("button", { name: "RD 2", exact: true }).click();
  await bild(page, bilder, "2-stichwort", [karte("Alarmstichwort")], karte("Alarmstichwort"));

  await page.getByLabel("Straße, Hausnummer").fill("Bahnhofstraße 12");
  await page.getByLabel("PLZ, Ort").fill("29525 Uelzen");
  await page.getByLabel("Objekt, Lage vor Ort").fill("Sporthalle, Zufahrt über Hof");
  await bild(page, bilder, "3-ort", [karte("Zeit und Einsatzort")], karte("Zeit und Einsatzort"));

  await page.getByLabel("Fahrzeug suchen").fill("83-1");
  await page.getByLabel("Fahrzeug suchen").press("Enter");
  await bild(page, bilder, "4-fahrzeuge", [karte("Beteiligte Fahrzeuge")], karte("Beteiligte Fahrzeuge"));

  for (const name of ["Dierks", "Albers"]) {
    await page.getByLabel("Person suchen").fill(name);
    await page.getByLabel("Person suchen").press("Enter");
  }
  await bild(page, bilder, "5-personal", [karte("Eingesetztes Personal")], karte("Eingesetztes Personal"));

  await page.getByRole("button", { name: "Vor Ort behandelt: mehr" }).click();
  await page.getByLabel("Notizen").fill("Patient an RTW übergeben.");
  const absenden = page.getByRole("button", { name: "Einsatz absenden" });
  await bild(page, bilder, "6-absenden", [absenden, page.locator(".bereit")], karte("Patienten"));

  await absenden.click();
  await expect(page.getByText("Abgesendet · noch änderbar")).toBeVisible();
  await bild(page, bilder, "7-frist", [page.locator(".frist-uhr")]);

  await page.getByRole("button", { name: "Angaben ändern" }).click();
  await page.getByLabel("Ende · Datum").fill(await page.getByLabel("Beginn · Datum").inputValue());
  await page.getByLabel("Ende · Uhrzeit").fill("23:30");
  await page.evaluate(() => window.scrollTo(0, 0));
  const uebernehmen = page.getByRole("button", { name: "Änderungen übernehmen" });
  await bild(page, bilder, "8-aendern", [page.locator(".hinweis").first(), uebernehmen]);
  await uebernehmen.click();

  const versiegeln = page.getByRole("button", { name: "Jetzt versiegeln" });
  await expect(versiegeln).toBeVisible();
  await bild(page, bilder, "9-versiegeln", [versiegeln]);
  await versiegeln.click();
  await expect(page.getByRole("heading", { name: "Einsatz versiegelt" })).toBeVisible();
  await bild(page, bilder, "10-versiegelt", [page.getByRole("button", { name: "Neuen Einsatz erfassen" })]);

  // Die Vorlage über `file://`, damit sie die Schriften der App relativ findet.
  const blatt = await page.context().newPage();
  await blatt.goto(`file://${VORLAGE}`);
  const quellen = Object.fromEntries([...bilder].map(([name, b]) => [name, `data:image/jpeg;base64,${b.toString("base64")}`]));
  const fehlend = await blatt.evaluate((quellen) => {
    const offen: string[] = [];
    document.querySelectorAll<HTMLImageElement>("img[data-bild]").forEach((img) => {
      const q = quellen[img.dataset.bild!];
      if (q) img.src = q;
      else offen.push(img.dataset.bild!);
    });
    return offen;
  }, quellen);
  expect(fehlend, "Bilder in der Vorlage ohne Aufnahme").toEqual([]);
  await blatt.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode())]));
  await blatt.pdf({ path: ZIEL, format: "A4", printBackground: true, preferCSSPageSize: true });
  expect(readFileSync(ZIEL).subarray(0, 5).toString("latin1")).toBe("%PDF-");
});
