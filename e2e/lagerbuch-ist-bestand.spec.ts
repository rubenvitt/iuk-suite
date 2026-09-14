import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * DER IST IM FAHRZEUGBLATT STEHT GROSS NEBEN DEM SOLL (DRK-315).
 *
 * ⚠️ WARUM DIESER TEST NEBEN `SollEditor.test.tsx` STEHT. Vitest bestaetigt,
 * dass die Zelle die Zahlrolle TRAEGT — jsdom rechnet aber weder Schriftgroesse
 * noch Layoutbox, und die Zusage „bei kleinen Bildschirmen nutzbar" ist ohne
 * einen echten Browser gar nicht zu pruefen.
 *
 * Drei Breiten wie `lagerbuch-mobil.spec.ts`. Der Anker ist die Zeile
 * `e2e-soll` mit ihrem Artikelnamen — eine 404-Seite hat keinen Ueberlauf und
 * bestuende jede Zusicherung hier still.
 *
 * ⚠️ DER IST-WERT SELBST WIRD HIER NICHT ZUGESICHERT, nur seine Form. Der Seed
 * legt den Bestand zwar ausschliesslich ins Handlager (lokal, frische Datei:
 * „0 Stk."), aber alle Specs laufen mit `workers: 1` gegen EINE SQLite-Datei,
 * und ein abgeschlossener Check im selben Lauf fuellt `e2e-fahrzeug` auf sein
 * Soll auf — in CI stand dort „3 Stk.", reproduzierbar in allen drei Versuchen.
 * Genau diese Reihenfolgeabhaengigkeit beschreibt der Kopf von
 * `artikelMitBestand` in `seed-lagerbuch.ts`. Dass der RICHTIGE Bestand ankommt,
 * halten `SollEditor.test.tsx` und `page.test.tsx` fest; hier geht es um Groesse
 * und Erreichbarkeit.
 */
const BREITEN = [
  { name: "Telefon", width: 390, height: 844 },
  { name: "Tablet hoch", width: 834, height: 1112 },
  { name: "Desktop", width: 1280, height: 720 },
] as const;

test.describe("Ist-Bestand im Fahrzeugblatt", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  for (const breite of BREITEN) {
    test(`steht gross, getrennt vom Soll, und bleibt erreichbar — ${breite.name}`, async ({ page }) => {
      await page.setViewportSize({ width: breite.width, height: breite.height });
      const antwort = await page.goto(lagerbuchUrl("/verwaltung/fahrzeuge/e2e-fahrzeug"));
      expect(antwort!.status()).toBe(200);

      const zeile = page
        .getByRole("table", { name: "Soll-Bestückung" })
        .locator("tbody tr[data-row-key='e2e-soll']");
      await expect(zeile).toContainText("E2E Check Kompressen");

      const ist = zeile.locator("[data-rolle='ist']");
      const soll = zeile.getByRole("spinbutton", { name: /^Soll für / });
      // Form, nicht Wert — s. Kopfkommentar.
      await expect(ist).toHaveText(/^\d+ Stk\.$/);

      await ist.scrollIntoViewIfNeeded();
      await expect(ist).toBeInViewport();

      const mass = await zeile.evaluate((tr) => {
        const zahl = tr.querySelector<HTMLElement>("[data-rolle='ist'] span span")!;
        const handlager = Array.from(tr.querySelectorAll<HTMLElement>("span"))
          .find((el) => (el.textContent ?? "").startsWith("Handlager "))!;
        const sollFeld = tr.querySelector<HTMLInputElement>("input[aria-label^='Soll für']")!;
        const stil = getComputedStyle(zahl);
        const kasten = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { links: Math.round(r.left), rechts: Math.round(r.right) };
        };
        return {
          istPx: parseFloat(stil.fontSize),
          istZiffern: stil.fontVariantNumeric,
          handlagerPx: parseFloat(getComputedStyle(handlager).fontSize),
          sollPx: parseFloat(getComputedStyle(sollFeld).fontSize),
          ist: kasten(zahl),
          soll: kasten(sollFeld),
          scroller: (() => {
            // Der erste Vorfahr der Tabelle, der waagerecht scrollt — nicht der
            // Rahmen: der kann schmal sein, waehrend die Tabelle darin
            // unerreichbar abgeschnitten ist.
            let el: HTMLElement | null = tr.closest("table")!.parentElement;
            while (el && !["auto", "scroll"].includes(getComputedStyle(el).overflowX)) {
              el = el.parentElement;
            }
            if (!el || el === document.documentElement || el === document.body) return null;
            return {
              rechts: Math.round(el.getBoundingClientRect().right),
              scrollWidth: el.scrollWidth,
              clientWidth: el.clientWidth,
            };
          })(),
          fenster: window.innerWidth,
        };
      });
      console.log(`DRK-315 ${breite.name} ${breite.width}px`, JSON.stringify(mass));

      // Groesser als der Nebentext, in dem er vorher stand, und groesser als
      // die Ziffer im Soll-Feld daneben.
      expect(mass.istPx).toBe(24);
      expect(mass.istPx).toBeGreaterThan(mass.handlagerPx);
      expect(mass.istPx).toBeGreaterThan(mass.sollPx);
      expect(mass.istZiffern).toContain("tabular-nums");
      // Ist links vom Soll, ohne Ueberlappung.
      expect(mass.ist.rechts).toBeLessThanOrEqual(mass.soll.links);
      // Die Tabelle scrollt in sich (docs/design/README.md), statt die Seite
      // zu verbreitern. ⚠️ NICHT `documentElement.scrollWidth`: die
      // Verfallstabelle weiter unten auf derselben Seite laeuft unabhaengig
      // davon ueber (bei 390px um 357px, auch ohne DRK-315) — eigener Fund,
      // DRK-322. Ist der behoben, gehoert die Seitenpruefung hierher zurueck.
      expect(mass.scroller).not.toBeNull();
      expect(mass.scroller!.rechts).toBeLessThanOrEqual(mass.fenster);
      if (breite.width < 1280) {
        // Schmal: die Tabelle ist breiter als ihr Kasten und scrollt IN SICH.
        expect(mass.scroller!.scrollWidth).toBeGreaterThan(mass.scroller!.clientWidth);
      }

      // Das Soll-Feld ist ueber den Tabellen-Scroll erreichbar, ohne dass die
      // SEITE waagerecht mitscrollt — sonst bewiese `toBeInViewport` nur den
      // Seitenueberlauf aus DRK-322.
      await page.evaluate(() => window.scrollTo(0, window.scrollY));
      await soll.scrollIntoViewIfNeeded();
      await expect(soll).toBeInViewport();
      expect(await page.evaluate(() => window.scrollX)).toBe(0);
    });
  }
});
