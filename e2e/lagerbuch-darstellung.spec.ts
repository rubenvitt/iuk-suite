import { expect, test, type Page } from "@playwright/test";
import { devLogin, warteAufDarstellung, warteAufSpaltenaufteilung } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * IDA-241 — DREI DARSTELLUNGSFEHLER DER VERWALTUNG, die nur ein echter Browser
 * misst: Tippzielhöhe, Umbruch im Spaltenkopf, Tabellenbreite. jsdom rechnet
 * kein Layout; jede der drei Zusagen ginge dort still durch.
 *
 * Jede Messung bestätigt VORHER, dass sie etwas misst (Anzahl > 0) — eine leere
 * Fundmenge bestünde jede Zusicherung (Vorbild `lagerbuch-mobil.spec.ts`).
 */

async function oeffne(page: Page, pfad: string): Promise<void> {
  await devLogin(page, { host: LAGERBUCH_HOST, groups: LAGERBUCH_ADMIN_GRUPPE });
  const antwort = await page.goto(lagerbuchUrl(pfad));
  expect(antwort?.status(), `${pfad}: HTTP`).toBe(200);
  await warteAufSpaltenaufteilung(page);
  await warteAufDarstellung(page);
  await page.waitForLoadState("networkidle");
}

/** Höhe jedes GERENDERTEN Treffers; Nulldimensionen sind nicht im Bild. */
async function zielHoehen(page: Page, wahl: string): Promise<{ text: string; h: number }[]> {
  return page.evaluate((w) =>
    [...document.querySelectorAll<HTMLElement>(w)]
      .map((el) => ({ text: (el.textContent ?? "").trim().slice(0, 30), h: el.getBoundingClientRect().height }))
      .filter((z) => z.h > 0), wahl);
}

const NAMENSLINKS = [
  { pfad: "/verwaltung/fahrzeuge", wahl: '.ant-layout-content a[href^="/verwaltung/fahrzeuge/"]', was: "Fahrzeugliste" },
  { pfad: "/verwaltung", wahl: '.ant-layout-content a[href*="?artikel="]', was: "Kritische Artikel" },
] as const;

for (const breite of [390, 1280] as const) {
  test.describe(`Namenslinks bei ${breite}px`, () => {
    test.use({ viewport: { width: breite, height: breite === 390 ? 844 : 800 } });
    for (const { pfad, wahl, was } of NAMENSLINKS) {
      test(`${was}: jeder Namenslink ist mindestens 44 px hoch`, async ({ page }) => {
        await oeffne(page, pfad);
        const hoehen = await zielHoehen(page, wahl);
        expect(hoehen.length, `${was} muss Namenslinks tragen, sonst misst der Test nichts`).toBeGreaterThan(0);
        expect(hoehen.filter((z) => z.h < 44).map((z) => `${z.text} ${Math.round(z.h)}px`)).toEqual([]);
      });
    }
  });
}

/**
 * ⚠️ 1280 IST DIE ENGE BREITE, nicht 1440: ab 150 Zeilen scrollt die
 * Artikeltabelle virtuell, steht in `table-layout: fixed` und darunter genau in
 * den Breiten aus `ArtikelTable.tsx` (`BREITE`). Bei 1440 verteilt sie den
 * Überschuss und „Min." hielt mit 81 statt 80 px gerade noch.
 */
for (const breite of [1280, 1440] as const) {
  test(`Artikeltabelle bei ${breite}px: kein Spaltenkopf bricht um`, async ({ page }) => {
    await page.setViewportSize({ width: breite, height: 900 });
    await oeffne(page, "/verwaltung/artikel");
    const koepfe = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("thead [data-rolle='spaltenkopf']")]
        .filter((k) => k.getClientRects().length > 0)
        .map((k) => {
          const bereich = document.createRange();
          bereich.selectNodeContents(k);
          // Eine Zeile Text = alle Zeilenkästen auf derselben Höhe.
          const zeilen = new Set([...bereich.getClientRects()].map((r) => Math.round(r.top))).size;
          return { text: k.textContent ?? "", zeilen };
        }));
    expect(koepfe.length, "die Tabelle muss Spaltenköpfe tragen").toBeGreaterThan(0);
    expect(koepfe.filter((k) => k.zeilen > 1).map((k) => k.text)).toEqual([]);
  });
}

test.describe("Journal bei 1440px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test("passt ohne waagerechtes Scrollen, Δ und Quelle stehen im Bild", async ({ page }) => {
    await oeffne(page, "/verwaltung/journal");
    const tabelle = page.locator(".ant-table-content");
    await expect(tabelle).toHaveCount(1);
    const { scrollBreite, sichtBreite } = await tabelle.evaluate((el) => ({
      scrollBreite: el.scrollWidth,
      sichtBreite: el.clientWidth,
    }));
    expect(scrollBreite, "das Journal läuft über seine Fläche").toBeLessThanOrEqual(sichtBreite);
    for (const kopf of ["Δ", "Quelle"]) {
      await expect(page.locator("thead [data-rolle='spaltenkopf']", { hasText: kopf })).toBeInViewport({ ratio: 1 });
    }
  });
});
