import { test, expect } from "@playwright/test";
import { devLogin, E2E_PORT } from "./fixtures";

const PORTAL = `http://portal.localtest.me:${E2E_PORT}`;

/**
 * DIE KONTUR EINES RUHENDEN BEDIENELEMENTS TRAEGT 3:1 — IM BROWSER, NICHT IM
 * CONFIG-OBJEKT (DRK-370, WCAG 1.4.11).
 *
 * `core/theme/theme.test.ts` rechnet die Zahlen nach und liest antds erzeugtes
 * CSS. Was es nicht sehen kann, ist die Kaskade auf einer echten Seite: ob ein
 * Modul-Stylesheet die Kontur ueberschreibt, ob die Scope-Klasse im hydrierten
 * Baum steht, welche Flaeche wirklich hinter dem Feld liegt. jsdom rechnet keine
 * Farben; nur ein echter Browser kennt die Zahl.
 *
 * GEMESSEN WIRD DIE AUSGEWERTETE FARBE, gegen die eigene Flaeche des Feldes und
 * gegen die naechste deckende Flaeche dahinter. Das eine ist die Grenze nach
 * innen, das andere die nach aussen; auf einer Karte sind beide dieselbe Farbe,
 * und genau das ist der Fall, in dem die Kontur die einzige Grenze ist.
 *
 * DIE SEITE IST `/admin/audit` im Portal: `Input` (mit `allowClear`, also die
 * Affix-Huelle), `Select` und ein nicht angehaktes `Checkbox` stehen dort ruhend
 * auf einer Karte einer `FullShell`-Arbeitsflaeche. NICHT `/login`: dessen Karte
 * ist in beiden Modi fest hell und saehe den Dunkelmodus nie.
 *
 * ⚠️ In antd 6 traegt `.ant-checkbox` SELBST die Kontur — `.ant-checkbox-inner`
 * wird nicht mehr gerendert (`antd/es/checkbox/style/index.js`, „Styles moved
 * from inner"). Wer den alten Selektor nimmt, misst nichts.
 */
const BAUTEILE = [
  { name: "Eingabefeld", selektor: ".ant-input-affix-wrapper" },
  { name: "Auswahlfeld", selektor: ".ant-select" },
  {
    name: "Kontrollkaestchen",
    selektor: ".ant-checkbox:not(.ant-checkbox-checked):not(.ant-checkbox-indeterminate)",
  },
] as const;

type Messung = { name: string; kontur: string; innen: string; aussen: string };

function kontrast(a: string, b: string): number {
  const lum = (farbe: string) => {
    const [r, g, bl] = farbe
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map((v) => Number(v) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hoch, tief] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hoch + 0.05) / (tief + 0.05);
}

test.describe("Bedienelemente: ruhende Kontur mit 3:1", () => {
  for (const modus of ["light", "dark"] as const) {
    test(`im Modus ${modus}`, async ({ page, context }) => {
      await devLogin(page, { host: "portal.localtest.me", groups: "dashboard-admins" });
      await context.addCookies([{ name: "iuk-theme-pref", value: modus, url: PORTAL }]);

      const antwort = await page.goto(PORTAL + "/admin/audit");
      expect(antwort?.status(), "/admin/audit: HTTP").toBe(200);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("html")).toHaveAttribute("data-theme", modus);
      await expect(page.locator(BAUTEILE[0].selektor).first()).toBeVisible();

      const messungen: Messung[] = await page.evaluate((bauteile) => {
        // Ein Farbwert mit Alpha 0 ist keine Flaeche — weiter nach oben.
        const deckend = (farbe: string) => {
          const alpha = farbe.match(/rgba?\([^)]*,\s*([\d.]+)\)/);
          return farbe !== "transparent" && !(alpha && farbe.startsWith("rgba") && Number(alpha[1]) === 0);
        };
        const flaecheAb = (el: Element | null): string => {
          for (let e = el; e; e = e.parentElement) {
            const bg = getComputedStyle(e).backgroundColor;
            if (deckend(bg)) return bg;
          }
          return getComputedStyle(document.documentElement).backgroundColor;
        };
        return bauteile.map(({ name, selektor }) => {
          const el = document.querySelector(selektor)!;
          return {
            name,
            kontur: getComputedStyle(el).borderTopColor,
            innen: flaecheAb(el),
            aussen: flaecheAb(el.parentElement),
          };
        });
      }, BAUTEILE);

      for (const m of messungen) {
        expect(kontrast(m.kontur, m.innen), `${m.name}: ${m.kontur} gegen innen ${m.innen}`).toBeGreaterThanOrEqual(3);
        expect(kontrast(m.kontur, m.aussen), `${m.name}: ${m.kontur} gegen aussen ${m.aussen}`).toBeGreaterThanOrEqual(3);
      }
    });
  }
});
