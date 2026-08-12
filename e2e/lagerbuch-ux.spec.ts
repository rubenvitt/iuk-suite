import { expect, test } from "@playwright/test";
import { devLogin } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/*
 * DIE BELEGE, DIE TYPECHECK/BUILD/VITEST STRUKTURELL NICHT FUEHREN KOENNEN
 * (Task 9). Vier Fallen dieses Branches bleiben unter der Standardkette
 * gruen, weil kein Werkzeug darin echten Browser-Druck oder einen echten
 * HTTP-Abruf ausfuehrt:
 *
 *  1. Ikonen-Migration auf react-icons/pi — jsdom rendert das SVG, aber ein
 *     Bundle-Sprung durch ein mitgezogenes Barrel zeigt sich erst am
 *     Artefakt (Step 2 im Bericht), nicht in einem Testlauf.
 *  3. Nav-Icons ueber core/shell — die tatsaechliche Zeichenzahl in der
 *     gerenderten Navigation ist nur per echtem DOM zu zaehlen, nicht durch
 *     eine Quelltext-Analyse der 15 nav.ts-Eintraege.
 *  6. Die vier Kennzahlleisten — Original und Portierung teilen sich diesen
 *     Code, aber ob die BZ-Uebersicht ihn tatsaechlich rendert, ist erst am
 *     ausgelieferten Markup zu sehen.
 *  7. Bildschirm-Chrome der Etikettenseite — jsdom wertet @media print nicht
 *     aus; nur `page.emulateMedia({ media: "print" })` sieht, ob
 *     `lb-nichtDrucken` tatsaechlich greift.
 *
 * Host, Admin-Gruppe und URLs kommen ausschliesslich aus
 * `e2e/helpers/lagerbuch.ts` (Festlegung H9) — dieselbe Quelle wie
 * `lagerbuch-etiketten.spec.ts`, kein zweites Literal fuer Host oder Gruppe.
 */
test.describe("Lagerbuch UX-Verbesserungen", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  /*
   * Falle 7: Das Bildschirm-Chrome der Etikettenseite (EtikettenChrome.tsx)
   * traegt `lb-nichtDrucken`, eine globale Klasse aus druck.css mit
   * `!important` unter @media print. Ein Vitest-Lauf (jsdom) kann nur
   * pruefen, DASS die Klasse gesetzt ist, nicht dass der Browser sie im
   * Druckkontext auch anwendet.
   */
  test("Etikettenbogen: Chrome am Bildschirm, unsichtbar im Druck", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/etiketten"));

    await expect(page.getByTestId("lb-chrome")).toBeVisible();
    await expect(page.getByTestId("lb-basis")).toBeVisible();

    await page.emulateMedia({ media: "print" });
    await expect(page.getByTestId("lb-chrome")).toBeHidden();

    // Der Bogen selbst bleibt — er ist der Zweck der Seite.
    await expect(page.locator(".lb-etikettbogen")).toBeVisible();

    await page.emulateMedia({ media: "screen" });
  });

  /*
   * Die +/- Knoepfe je Zeile (InventurForm.tsx) sind neu in diesem Branch.
   * Reihenfolge erhoehen-dann-verringern ist bewusst gewaehlt: sie braucht
   * keine Annahme ueber den Startbestand der ersten Zeile — der
   * Verringern-Knopf ist erst NACH dem Erhoehen sicher aktiv (er ist
   * deaktiviert, solange der Wert bereits 0 ist).
   */
  test("Inventur: +/- veraendert den Wert und laesst ihn wieder buchbar zurueck", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/inventur"));
    /*
     * NICHT `tbody tr` ungefiltert: antd's Table setzt als ERSTES `<tr>` im
     * `<tbody>` eine unsichtbare `ant-table-measure-row` (height:0, dient der
     * Spaltenbreitenmessung nach der Hydration) — `.first()` traf dort ins
     * Leere und liess `inputValue()` in den 90s-Timeout laufen, ohne dass ein
     * Selektorfehler sichtbar wurde. Echte Datenzeilen tragen `data-row-key`.
     */
    const ersteZeile = page.locator("tbody tr[data-row-key]").first();
    const feld = ersteZeile.locator("input[aria-label^='Ist-Bestand']");
    const vorher = await feld.inputValue();

    await ersteZeile.locator("button[aria-label*='erhöhen']").click();
    await expect(feld).toHaveValue(String(Number(vorher) + 1));

    await ersteZeile.locator("button[aria-label*='verringern']").click();
    await expect(feld).toHaveValue(vorher);
  });

  /*
   * Falle 3: `LAGERBUCH_NAV` (_lib/nav.ts) fuehrt exakt 15 Eintraege, jeder
   * mit genau einem Zeichen. NICHT `page.locator("nav svg")` — die Seite
   * traegt eine ZWEITE nav-Landmarke (App-Switcher, aria-label="Module",
   * SuiteNav.tsx:304), deren Knoepfe je ein eigenes svg aus
   * @ant-design/icons tragen. Ein ungefilterter Selektor zaehlt beide und
   * ergibt 15 + Anzahl sichtbarer Module. Gefiltert auf `data-testid="modulnav"`
   * (SuiteNav.tsx:178) trifft er nur die Lagerbuch-eigene Navigation.
   */
  test("Navigation traegt Zeichen und die Seite antwortet", async ({ page }) => {
    const antwort = await page.goto(lagerbuchUrl("/verwaltung"));
    expect(antwort?.status()).toBe(200);
    await expect(page.getByTestId("modulnav").locator("svg")).toHaveCount(15, {
      timeout: 10_000,
    });
  });

  /*
   * Falle 6: Die BZ-Uebersicht (verwaltung/(arbeit)/bz/page.tsx) rendert die
   * Kennzahlleiste mit vier Kacheln. Zwei charakteristische Beschriftungen
   * genuegen als Nachweis, dass die Portierung dieselbe Leiste tatsaechlich
   * ausliefert statt nur im Unit-Test zu existieren.
   */
  test("BZ-Uebersicht zeigt die Kennzahlleiste", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/bz"));
    await expect(page.getByText("Ø Akku-Lebensdauer")).toBeVisible();
    await expect(page.getByText("Überfällig / nie geprüft")).toBeVisible();
  });
});
