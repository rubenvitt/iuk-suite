import { test, expect, type Page } from "@playwright/test";
import { devLogin, klickeWennRuhig, oeffneMenue, warteAufGestreamteInhalte } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST } from "./helpers/lagerbuch";

/**
 * DER SEITENWECHSEL UNTER `FullShell` (Haarlinie, Etappe 3; `core/shell/Seitenwechsel.tsx`).
 *
 * Gemessen wird am Browser, nicht am Bild: ein Init-Skript zeichnet jeden
 * `document.startViewTransition` auf und, sobald der Übergang steht, jede Animation an einem
 * `::view-transition-*`-Pseudoelement mit ihrer Dauer. Vitest sieht davon nichts (jsdom kennt die
 * API nicht), `pnpm build` auch nicht.
 */

type Aufnahme = { animationen: { pseudo: string; dauer: number }[]; bereit: boolean };

async function zeichneAuf(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __vt: Aufnahme[] };
    w.__vt = [];
    const start = Document.prototype.startViewTransition;
    if (!start) return;
    Document.prototype.startViewTransition = function (this: Document, arg: never) {
      const t = start.call(this, arg);
      const a: Aufnahme = { animationen: [], bereit: false };
      w.__vt.push(a);
      t.ready
        .then(() => {
          a.bereit = true;
          a.animationen = document.documentElement
            .getAnimations({ subtree: true })
            .map((x) => x.effect as KeyframeEffect)
            .filter((e) => e.pseudoElement?.startsWith("::view-transition"))
            .map((e) => ({ pseudo: e.pseudoElement!, dauer: Number(e.getComputedTiming().duration) }));
        })
        .catch(() => {});
      return t;
    } as typeof start;
  });
}

const aufnahmen = (page: Page) => page.evaluate(() => (window as unknown as { __vt: Aufnahme[] }).__vt);

async function wechsleZuImport(page: Page) {
  const menue = await oeffneMenue(page);
  await klickeWennRuhig(menue.getByRole("link", { name: "Import", exact: true }));
  await expect(page).toHaveURL(/\/verwaltung\/import$/);
  await warteAufGestreamteInhalte(page);
}

for (const breite of [1280, 390]) {
  test(`blendet den Inhalt bei ${breite}px über, das Menü steht still`, async ({ page }) => {
    await page.setViewportSize({ width: breite, height: 844 });
    await zeichneAuf(page);
    await devLogin(page, { host: LAGERBUCH_HOST, groups: LAGERBUCH_ADMIN_GRUPPE, callbackPath: "/verwaltung" });
    await warteAufGestreamteInhalte(page);
    // Das Laden der Seite selbst ist kein Seitenwechsel.
    expect(await aufnahmen(page)).toEqual([]);

    await wechsleZuImport(page);
    await expect.poll(async () => (await aufnahmen(page)).filter((a) => a.bereit).length).toBeGreaterThan(0);
    const alle = (await aufnahmen(page)).flatMap((a) => a.animationen);
    const dauer = (teil: string) => alle.filter((x) => x.pseudo.startsWith(`::view-transition-${teil}(`)).map((x) => x.dauer);
    expect(dauer("new")).toContain(180);
    expect(dauer("old")).toContain(90);
    // Das Menü läuft ohne Animation mit; nichts dauert länger als der Wechsel selbst — auch nicht die
    // Wurzel, die React ausblendet und deren 250ms-Vorgabe `globals.css` abstellt.
    expect(alle.filter((x) => x.pseudo.includes("iuk-menue"))).toEqual([]);
    expect(Math.max(...alle.map((x) => x.dauer))).toBeLessThanOrEqual(180);
  });
}

test("bei reduzierter Bewegung animiert der Seitenwechsel nichts", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await zeichneAuf(page);
  await devLogin(page, { host: LAGERBUCH_HOST, groups: LAGERBUCH_ADMIN_GRUPPE, callbackPath: "/verwaltung" });
  await warteAufGestreamteInhalte(page);
  await wechsleZuImport(page);
  const alle = (await aufnahmen(page)).flatMap((a) => a.animationen);
  expect(alle.filter((x) => x.dauer > 0)).toEqual([]);
});

test("ein geänderter Suchparameter ist kein Seitenwechsel", async ({ page }) => {
  await zeichneAuf(page);
  await devLogin(page, { host: LAGERBUCH_HOST, groups: LAGERBUCH_ADMIN_GRUPPE, callbackPath: "/verwaltung" });
  await warteAufGestreamteInhalte(page);
  // Eine Soft-Navigation auf denselben Pfad mit neuem `?…` — der Weg jedes URL-Filters.
  await page.evaluate(() => (window as unknown as { next: { router: { push(u: string): void } } }).next.router.push(`${location.pathname}?probe=1`));
  await expect(page).toHaveURL(/\?probe=1$/);
  await warteAufGestreamteInhalte(page);
  expect((await aufnahmen(page)).flatMap((a) => a.animationen)).toEqual([]);
});
