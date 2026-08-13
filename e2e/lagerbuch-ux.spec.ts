import { expect, test } from "@playwright/test";
import { devLogin } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/*
 * DIE BELEGE, DIE TYPECHECK/BUILD/VITEST STRUKTURELL NICHT FUEHREN KOENNEN
 * (Task 9). Vier Luecken dieses Branches bleiben unter der Standardkette
 * gruen, weil kein Werkzeug darin echten Browser-Druck oder einen echten
 * HTTP-Abruf ausfuehrt. Die Aufzaehlung unten sind KEINE Nummern aus dem
 * Fallenkatalog von docs/design/README.md/CLAUDE.md — wo ein Test unten
 * tatsaechlich eine dort katalogisierte Falle mit absichert, steht das bei
 * ihm einzeln.
 *
 *  - Ikonen-Migration auf react-icons/pi — jsdom rendert das SVG, aber ein
 *    Bundle-Sprung durch ein mitgezogenes Barrel zeigt sich erst am
 *    Artefakt (Step 2 im Bericht), nicht in einem Testlauf. Kein Test
 *    dieser Datei deckt das ab.
 *  - Nav-Icons ueber core/shell — die tatsaechliche Zeichenzahl in der
 *    gerenderten Navigation ist nur per echtem DOM zu zaehlen, nicht durch
 *    eine Quelltext-Analyse der 15 nav.ts-Eintraege.
 *  - Die fuenf Kennzahlleisten (bz, geraete, geraete/[id], sauerstoff,
 *    vorlagen/[id]) — Original und Portierung teilen sich diesen Code, aber
 *    ob die BZ-Uebersicht ihn tatsaechlich rendert, ist erst am
 *    ausgelieferten Markup zu sehen.
 *  - Bildschirm-Chrome der Etikettenseite — jsdom wertet @media print nicht
 *    aus; nur `page.emulateMedia({ media: "print" })` sieht, ob
 *    `lb-nichtDrucken` tatsaechlich greift.
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
   * Das Bildschirm-Chrome der Etikettenseite (EtikettenChrome.tsx) traegt
   * `lb-nichtDrucken`, eine globale Klasse aus druck.css mit `!important`
   * unter @media print. Ein Vitest-Lauf (jsdom) kann nur pruefen, DASS die
   * Klasse gesetzt ist, nicht dass der Browser sie im Druckkontext auch
   * anwendet — das ist der eigentliche Zweck dieses Tests, und keine der
   * Fallen aus dem Katalog (1/3/6/7) beschreibt eine CSS-`!important`-Regel.
   *
   * Der echte Abruf deckt nebenbei mit ab, dass `etiketten/page.tsx` (Server
   * Component) tatsaechlich ohne antd und ohne Icon-Import auskommt
   * (etiketten/page.tsx:25-30, dort Fallen 1 und 7 benannt) — beides waere
   * sonst erst am HTTP 500 sichtbar, nicht in Vitest.
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
   * Falle 6: `LAGERBUCH_NAV` (_lib/nav.ts) liegt bewusst OHNE "use client" in
   * _lib/, weil eine Server Component sie liest (_lib/nav.ts:4-5) — genau
   * die Falle, dass ein WERT aus einem "use client"-Modul dort als
   * Client-Referenz ankaeme, HTTP 500. Vitest kann das strukturell nicht
   * sehen; dieser Test ist der einzige echte HTTP-Abruf gegen `/verwaltung`
   * in dieser Datei und traegt deshalb die einzige `status()`-Zusicherung.
   *
   * Die Zeichenzahl selbst ist eine zweite, unabhaengige Zusicherung:
   * `LAGERBUCH_NAV` fuehrt exakt 15 Eintraege, jeder mit genau einem
   * Zeichen, und nur echtes DOM zaehlt sie richtig. NICHT
   * `page.locator("nav svg")` — die Seite traegt eine ZWEITE nav-Landmarke
   * (App-Switcher, aria-label="Module", SuiteNav.tsx:304), deren Knoepfe je
   * ein eigenes svg aus @ant-design/icons tragen. Ein ungefilterter Selektor
   * zaehlt beide und ergibt 15 + Anzahl sichtbarer Module. Gefiltert auf
   * `data-testid="modulnav"` (SuiteNav.tsx:178) trifft er nur die
   * Lagerbuch-eigene Navigation.
   */
  test("Navigation traegt Zeichen und die Seite antwortet", async ({ page }) => {
    const antwort = await page.goto(lagerbuchUrl("/verwaltung"));
    expect(antwort?.status()).toBe(200);
    await expect(page.getByTestId("modulnav").locator("svg")).toHaveCount(15, {
      timeout: 10_000,
    });
  });

  /*
   * Die BZ-Uebersicht (verwaltung/(arbeit)/bz/page.tsx) rendert die
   * Kennzahlleiste mit vier Kacheln. Zwei charakteristische Beschriftungen
   * genuegen als Nachweis, dass die Portierung dieselbe Leiste tatsaechlich
   * ausliefert statt nur im Unit-Test zu existieren. Keine Falle-Nummer:
   * bz/page.tsx zitiert selbst keine der docs/design/README-Fallen, und
   * keine passt hier eigenstaendig.
   */
  test("BZ-Uebersicht zeigt die Kennzahlleiste", async ({ page }) => {
    await page.goto(lagerbuchUrl("/verwaltung/bz"));
    await expect(page.getByText("Ø Akku-Lebensdauer")).toBeVisible();
    await expect(page.getByText("Überfällig / nie geprüft")).toBeVisible();
  });
});
