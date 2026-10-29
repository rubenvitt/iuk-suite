/**
 * DIE ANWENDERANLEITUNG FÜR DEN EINSATZBUCH-RECHNER (IDA-289) — ein A4-Blatt mit Bildern der
 * Desktop-App: einen Einsatz nachträglich dokumentieren, prüfen und versiegeln. Gegenstück zur
 * Lagerbuch-Helfer-Anleitung, die das Handy zeigt.
 *
 * Fährt die Oberfläche wie `e2e/erfassung.spec.ts` gegen den Stub (`../e2e/stub.ts`), macht an
 * jedem Schritt ein Bild mit rotem Rahmen um das, worauf es ankommt, setzt die Bilder in
 * `vorlage.html` ein und druckt sie nach `public/m/einsatzbuch/rechner-anleitung.pdf` der Suite.
 * Ändert sich die Erfassung sichtbar, `pnpm anleitung` neu fahren und das PDF mit committen.
 * Bricht ein Schritt, weil die Oberfläche sich geändert hat, wird der Job `oberflaeche` rot.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { installiereStub } from "../e2e/stub";

const VORLAGE = path.join(import.meta.dirname, "vorlage.html");
// Die CI (`einsatzbuch.yml`, Job `oberflaeche`) schreibt woandershin: Sie prüft nur, dass die
// Anleitung noch entsteht, und legt das Ergebnis als Artefakt ab.
const ZIEL = process.env.ANLEITUNG_ZIEL ?? path.join(import.meta.dirname, "../../../public/m/einsatzbuch/rechner-anleitung.pdf");
const RAHMEN = "[data-anleitung]{outline:4px solid #c8000f !important;outline-offset:4px;border-radius:10px;}";
/** Ausschnitt im Seitenverhältnis der Bildrahmen (16:10); kleiner als das Fenster, damit die Schrift im Druck lesbar bleibt. */
const AUSSCHNITT = { width: 1024, height: 640 };

/**
 * Ein Bild um `ziele` herum (ohne Ziele: die Fenstermitte), die einen roten Rahmen bekommen;
 * `mitte` wird vorher mittig gerollt.
 */
async function bild(page: Page, bilder: Map<string, Buffer>, name: string, ziele: Locator[] = [], mitte?: Locator) {
  if (mitte) await mitte.evaluate((e) => e.scrollIntoView({ block: "center" }));
  for (const z of ziele) await z.evaluate((e) => e.setAttribute("data-anleitung", ""));
  // Der Wechsel der Fokus- und Hover-Zustände braucht einen Frame, sonst fehlt der Rahmen im Bild.
  await page.waitForTimeout(250);
  const fenster = page.viewportSize()!;
  const kaesten = await Promise.all((mitte ? [mitte, ...ziele] : ziele).map(async (z) => (await z.boundingBox())!));
  const links = kaesten.length ? Math.min(...kaesten.map((k) => k.x)) : 0;
  const rechts = kaesten.length ? Math.max(...kaesten.map((k) => k.x + k.width)) : fenster.width;
  const oben = kaesten.length ? Math.min(...kaesten.map((k) => k.y)) : 0;
  const unten = kaesten.length ? Math.max(...kaesten.map((k) => k.y + k.height)) : fenster.height;
  const klemme = (wert: number, max: number) => Math.min(Math.max(wert, 0), max);
  const clip = {
    ...AUSSCHNITT,
    x: klemme((links + rechts) / 2 - AUSSCHNITT.width / 2, fenster.width - AUSSCHNITT.width),
    y: klemme((oben + unten) / 2 - AUSSCHNITT.height / 2, fenster.height - AUSSCHNITT.height),
  };
  bilder.set(name, await page.screenshot({ type: "jpeg", quality: 85, clip }));
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
  await page.getByLabel("Stichwort, Freitext").fill("RD 2 – Sturz");
  await page.getByLabel("Einsatznummer der Leitstelle").fill("RD 2026-10-4711");
  await bild(page, bilder, "2-stichwort", [karte("Alarmstichwort")], karte("Alarmstichwort"));

  // Dokumentiert wird immer hinterher: der vorgeschlagene Beginn (jetzt) wird überschrieben.
  await page.getByLabel("Beginn · Uhrzeit").fill("14:05");
  await page.getByLabel("Ende · Datum").fill(await page.getByLabel("Beginn · Datum").inputValue());
  await page.getByLabel("Ende · Uhrzeit").fill("15:20");
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
  await karte("Patienten").evaluate((e) => e.scrollIntoView({ block: "end" }));
  await bild(page, bilder, "6-absenden", [absenden]);

  await absenden.click();
  await expect(page.getByText("Abgesendet · noch änderbar")).toBeVisible();
  await bild(page, bilder, "7-frist", [page.getByRole("button", { name: "Angaben ändern" }), karte("Zusammenfassung")]);

  const versiegeln = page.getByRole("button", { name: "Jetzt versiegeln" });
  await versiegeln.click();
  await expect(page.getByRole("heading", { name: "Einsatz versiegelt" })).toBeVisible();
  await bild(page, bilder, "8-versiegelt");

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
