import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";
import { RADIO_ADMIN_GRUPPE, RADIO_HOST, radioUrl } from "./helpers/radio";

/**
 * DIE ELF FAELLE DER VERWALTUNG (`Spec:4874-4892`, §5.13).
 *
 * ⛔ SIE SIND PFLICHTBESTANDTEIL, NICHT NACHBESSERUNG: nur ein ECHTER Abruf zeigt Falle 9
 * (`columns[].render` aus einer Server Component) und Falle 1 (Compound-Zugriff). Vitest
 * kann beide STRUKTURELL nicht sehen — dort gibt es keine RSC-Grenze
 * (`Spec:4870-4871`, `CLAUDE.md`, Falle 9).
 *
 * ⛔ JEDER AUFRUF GEHT UEBER `radioUrl(...)`, NIE RELATIV: `playwright.config.ts:65` fuehrt
 * genau EINEN `baseURL`, und der zeigt auf `http://portal.localtest.me:3100`. Ein relativer
 * Aufruf landete dort — und `portal` traegt `requiresAuth: true`, also im Login. Dieselbe
 * Bauform wie `e2e/lagerbuch-hosts.spec.ts` (`e2e/helpers/lagerbuch.ts:86-91`).
 *
 * ⛔ DIESE DATEI WAECHST MIT JEDER FLAECHE UND WIRD EINMAL GEFAHREN — in Aufgabe V23, vor
 * dem Merge (`.superpowers/sdd/planteil4/briefs/KOPF.md:306`). ⛔ Bis dahin behauptet KEIN
 * Kommentar dieses Wegs, dass ein Riegel bei einem echten Abruf GREIFT; das ist ⬜ V-L3.
 */

/**
 * Die Rottoene, die auf einer Datenflaeche dieses Moduls nicht vorkommen duerfen.
 *
 * ⛔ FALLE 3, UND SIE HAT ZWEI QUELLEN: der Alt-Ton `#cf1322` der Kennzahl „Veraltet"
 * (`radio-admin/client/src/features/dashboard/Dashboard.tsx:41`) UND die Markenfarbe der
 * Suite, die zugleich `colorError` UND `colorPrimary` ist (`src/core/theme/theme.ts:32-33`,
 * `src/app/globals.css:153` hell, `:160` dunkel). Ein rotes Zeichen auf einer Datenflaeche
 * sieht deshalb aus wie eine Primaeraktion; Rot bleibt allein den zerstoerenden Knoepfen
 * (`Spec:4555-4561`).
 *
 * ⚠️ ALS `rgb(...)`, WEIL `getComputedStyle` NIE EINEN HEXWERT LIEFERT.
 */
const VERBOTENE_ROTTOENE = [
  "rgb(207, 19, 34)", // #cf1322 — Dashboard.tsx:41
  "rgb(200, 0, 15)", // #c8000f — --iuk-marke hell
  "rgb(228, 90, 102)", // #e45a66 — --iuk-marke dunkel
];

test.describe("radio-Verwaltung", () => {
  test("Fall 1: /admin zeigt vier Kennzahlen, und „Veraltet“ ist nicht rot", async ({ page }) => {
    /*
     * ⛔ ANGEMELDET MIT DER ADMIN-GRUPPE, und der Wert kommt aus DERSELBEN Quelle wie
     * `webServer.env` (`e2e/helpers/radio.ts`): mit falschem `groups` bezeugte der Lauf den
     * Riegel-404 und saehe dabei aus wie ein bestandener Test — die Klasse, vor der
     * `e2e/lagerbuch-hosts.spec.ts:145-149` warnt.
     */
    await devLogin(page, { host: RADIO_HOST, groups: RADIO_ADMIN_GRUPPE });

    const antwort = await page.goto(radioUrl("/admin"));
    expect(antwort?.status(), "/admin auf dem radio-Host").toBe(200);

    const kennzahlen = page.locator('[data-rolle="radio-kennzahl"]');
    await expect(kennzahlen).toHaveCount(4);
    for (const schluessel of ["gesamt", "aktuell", "veraltet", "unbekannt"]) {
      await expect(page.locator(`[data-schluessel="${schluessel}"]`)).toBeVisible();
    }

    /*
     * ⛔ GEMESSEN WIRD DER GANZE TEILBAUM DER KARTE, nicht ein einzelner Knoten: der
     * Alt-Bestand faerbt ueber `valueStyle` (`Dashboard.tsx:68`), also den WERT — ein
     * spaeterer Griff koennte ebenso den Titel oder ein Zeichen einfaerben. Die Frage ist
     * „ist an dieser Karte irgendwo Rot", und nur so ist sie beantwortet.
     */
    const toene = await page.locator('[data-schluessel="veraltet"]').evaluate((el) =>
      [el, ...Array.from(el.querySelectorAll("*"))].map(
        (knoten) => getComputedStyle(knoten as Element).color,
      ),
    );
    expect(
      toene.filter((ton) => VERBOTENE_ROTTOENE.includes(ton)),
      "die Kennzahl „Veraltet“ traegt einen Rotton (Falle 3, Spec:4877)",
    ).toEqual([]);
  });

  test("Fall 2: /admin/geraete zeigt die Tabelle, und ein Filter landet in der URL", async ({ page }) => {
    /*
     * ⛔ DIESER FALL IST PFLICHTBESTANDTEIL VON AUFGABE V13, NICHT NACHBESSERUNG
     * (`Spec:4878`). Er ist der EINZIGE Waechter ueber ZWEI Fehlern, die Vitest strukturell
     * nicht sehen kann — beide sind in `.superpowers/sdd/planteil4/BERICHT-V13.md` als
     * Sonden mit 0 rot protokolliert:
     *
     *   S-V13a  `COLUMN_DEFS` wandert aus der Insel nach `_lib/`. Die achtzehn Spalten
     *           fuehren fuenfzehn `render`-FUNKTIONEN (`deviceColumns.tsx:16-35`); ueber eine
     *           RSC-Grenze gereicht ist das
     *           `Error: Functions cannot be passed directly to Client Components` (Falle 9).
     *           In jsdom gibt es keine RSC-Grenze — dort bleibt jeder Fall gruen.
     *   S-V13d  `pagination` an der Tabelle eingeschaltet. Die Blaetterung laeuft ueber die
     *           URL (Regime B); ein eingeschaltetes `pagination` legte eine zweite,
     *           rein clientseitige Blaetterung ueber die bereits geschnittenen zwanzig
     *           Zeilen. Kein Vitest-Fall faerbt sich.
     *
     * ⛔ DIE KOPFZEILE IST DER GRIFF FUER S-V13a: bricht die Insel an der Grenze, rendert die
     * Seite gar nicht, und `thead` fehlt. Ein Blick auf „irgendein Text ist da" saehe das
     * nicht.
     */
    await devLogin(page, { host: RADIO_HOST, groups: RADIO_ADMIN_GRUPPE });

    const antwort = await page.goto(radioUrl("/admin/geraete"));
    expect(antwort?.status(), "/admin/geraete auf dem radio-Host").toBe(200);

    await expect(
      page.locator('table thead th').first(),
      "keine Tabellenkopfzeile — die Insel ist an der RSC-Grenze gebrochen (Falle 9)",
    ).toBeVisible();

    /*
     * ⛔ DIE ADRESSZEILE TRAEGT DEN FILTER (Regime B). Gefahren wird der Weg, den auch der
     * Vitest-Fall „ein gesetzter Filter landet in der URL" faehrt — hier aber gegen den
     * echten Router, der die Seite danach WIRKLICH neu liest.
     */
    await page.locator('[data-rolle="radio-filterknopf"]').click();
    await page.locator('[data-rolle="radio-filter-ausleihbar"] button').click();
    await page.locator('[data-rolle="radio-filter-anwenden"]').click();

    await expect(page).toHaveURL(/[?&]ausleihbar=1\b/);
  });
});
