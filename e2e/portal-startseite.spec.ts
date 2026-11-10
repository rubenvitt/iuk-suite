import { test, expect, type Page } from "@playwright/test";
import { devLogin, oeffneMenue, warteAufGestreamteInhalte } from "./fixtures";

/**
 * IDA-391, Teil C: Startseite, Suche und Kopf des Portals am Telefon und am Schreibtisch.
 * Was jsdom nicht sieht — Umbruch, Media Queries, die Kopfzeile am Telefon —, misst dieser Lauf.
 */

/** Kacheltitel, in denen ein Wort über zwei Zeilen läuft — also mitten im Wort getrennt ist. */
async function getrennteWoerter(page: Page): Promise<string[]> {
  return page.$$eval('[data-testid="kachel-titel"]', (titel) =>
    titel.flatMap((el) => {
      const text = el.firstChild;
      if (!text || text.nodeType !== Node.TEXT_NODE) return [];
      const inhalt = text.textContent ?? "";
      const funde: string[] = [];
      for (const m of inhalt.matchAll(/\S+/g)) {
        const bereich = document.createRange();
        bereich.setStart(text, m.index!);
        bereich.setEnd(text, m.index! + m[0].length);
        const zeilen = new Set([...bereich.getClientRects()].map((r) => Math.round(r.top)));
        if (zeilen.size > 1) funde.push(m[0]);
      }
      return funde;
    }),
  );
}

test.describe("am Telefon (390px, Touch)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("Kacheln stehen einspaltig, kein Name wird mitten im Wort getrennt, das Portal ist keine Kachel", async ({ page }) => {
    await devLogin(page, { host: "portal.localtest.me", groups: "" });
    await warteAufGestreamteInhalte(page);
    const kacheln = page.getByTestId("service-tile");
    expect(await kacheln.count()).toBeGreaterThan(1);
    expect(await getrennteWoerter(page)).toEqual([]);
    // Einspaltig: jede Kachel beginnt an derselben linken Kante.
    const links = await kacheln.evaluateAll((alle) => new Set(alle.map((k) => Math.round(k.getBoundingClientRect().left))).size);
    expect(links).toBe(1);
    await expect(page.getByRole("main").getByTestId("service-tile").filter({ hasText: /^Portal/ })).toHaveCount(0);
    // Kein eigenes Suchfeld und damit kein „Strg+K“ auf der Startseite.
    await expect(page.getByTestId("portal-suche")).toHaveCount(0);
    await expect(page.getByRole("main").getByText(/Strg\+K|⌘K/)).toHaveCount(0);
  });

  test("„Springen zu“ zeigt am Telefon kein Tastenkürzel", async ({ page }) => {
    await devLogin(page, { host: "portal.localtest.me", groups: "" });
    await warteAufGestreamteInhalte(page);
    const menue = await oeffneMenue(page);
    await expect(menue.getByTestId("befehlspalette-eingabe-drawer")).toBeVisible();
    await expect(menue.getByTestId("springen-kuerzel-drawer")).toBeHidden();
  });

  test("der Kopf nennt auf dem Profil „Profil“, nicht „Übersicht“", async ({ page }) => {
    await devLogin(page, { host: "portal.localtest.me", groups: "", callbackPath: "/profil" });
    await warteAufGestreamteInhalte(page);
    const ort = page.getByTestId("menue-knopf");
    await expect(ort).toContainText("Profil");
    await expect(ort).not.toContainText("Übersicht");
  });
});

test.describe("am Schreibtisch", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("„Springen zu“ zeigt das Tastenkürzel, bis man tippt", async ({ page }) => {
    await devLogin(page, { host: "portal.localtest.me", groups: "" });
    await warteAufGestreamteInhalte(page);
    const leiste = await oeffneMenue(page);
    const kuerzel = leiste.getByTestId("springen-kuerzel");
    await expect(kuerzel).toBeVisible();
    await expect(kuerzel).toHaveText(/^(Strg\+K|⌘K)$/);
    await leiste.getByTestId("befehlspalette-eingabe").fill("neu");
    await expect(kuerzel).toHaveCount(0);
  });
});
