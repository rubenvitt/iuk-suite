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
     * ⛔ HIER, UND NUR HIER, WIRD S-V13d GEFANGEN — nachgetragen in Fix-Runde 1 zu V13
     * (`.superpowers/sdd/planteil4/REVIEW-V13.md:99`, Fund W3). Die drei Zusicherungen des
     * Falles waren VORHER alle drei unempfindlich gegen ein eingeschaltetes `pagination`:
     * der Status bleibt 200, die Kopfzeile steht unveraendert, und die Adresszeile aendert
     * sich nicht. Die Sonde hatte damit in KEINEM der beiden Werkzeuge einen Waechter.
     *
     * ⛔ DAS UNTERSCHEIDENDE PAAR, NICHT EINE EINZELNE NADEL: antds eigene Blaetterung ist
     * ABWESEND (`.ant-table-pagination`, `antd/es/table/InternalTable.js:374`) UND die
     * URL-schreibende Blaetterung der Insel ist DA. Eine Insel ohne jede Blaetterung bestuende
     * die erste Haelfte und faellt an der zweiten.
     *
     * ⛔ UND DIE VORBEDINGUNG STEHT DANEBEN, WEIL SIE DIE ZUSICHERUNG SONST STILL ENTWERTET:
     * antd rendert die Blaetterung nur bei `pagination !== false && mergedPagination?.total`
     * (`antd/es/table/InternalTable.js:368`, aufgeschlagen). Bei NULL Datenzeilen waere
     * `.ant-table-pagination` also auch UNTER der Mutation abwesend — die Zusicherung waere
     * gruen aus dem falschen Grund, genau die Fehlerform aus Ruling R-V11-1, Fund 1.
     * ⚠️ `tbody tr.ant-table-row` und nicht `tbody tr`: die Leerdarstellung ist selbst ein
     * `<tr class="ant-table-placeholder">` (`@rc-component/table/es/Body/index.js:99`).
     *
     * ⬜ **V13-L2 — HEUTE SEEDET DER E2E-LAUF `radio` NICHT.** `core/bootstrap.ts:49-54`
     * nimmt das Modul bewusst vom Boot-Seed aus, und `playwright.config.ts:142` ruft
     * `scripts/seed-lokal.ts` nur mit `aufgaben`. ⛔ **Eigentuemer: V23** — dessen Faelle 3, 4,
     * 6 und 7 brauchen ohnehin ein vorhandenes Geraet (`briefs/V23.md`). Bis dahin ist diese
     * Zeile die LAUTE Form des Befunds: sie faellt mit ihrer eigenen Begruendung aus, statt
     * die Zusicherung darunter stillschweigend zahnlos zu machen.
     */
    expect(
      await page.locator("table tbody tr.ant-table-row").count(),
      "⬜ V13-L2: ohne Datenzeile kann diese Flaeche S-V13d nicht fangen (InternalTable.js:368)",
    ).toBeGreaterThan(0);
    await expect(
      page.locator(".ant-table-pagination"),
      "antds Vorgabe-Blaetterung ist an — Regime B verlangt pagination={false} (Sonde S-V13d)",
    ).toHaveCount(0);
    await expect(
      page.locator('[data-rolle="radio-blaetterung"]'),
      "die URL-schreibende Blaetterung der Insel fehlt",
    ).toHaveCount(1);

    /*
     * ⛔ DIE ADRESSZEILE TRAEGT DEN FILTER (Regime B). Gefahren wird der Weg, den auch der
     * Vitest-Fall „ein gesetzter Filter landet in der URL" faehrt — hier aber gegen den
     * echten Router, der die Seite danach WIRKLICH neu liest.
     */
    await page.locator('[data-rolle="radio-filterknopf"]').click();
    await page.locator('[data-rolle="radio-filter-ausleihbar"] button').click();
    await page.locator('[data-rolle="radio-filter-anwenden"]').click();

    /*
     * ⛔ PFAD UND ABFRAGE, NICHT NUR DIE ABFRAGE. Ein Muster allein auf `ausleihbar=1` kann
     * die Frage nicht beantworten, die `_lib/nav.test.ts:135-150` als echten 404 gemessen
     * hat: liefert `usePathname()` auf dem Modul-Host die AEUSSERE Form? Schriebe die Insel
     * `/m/radio/m/radio/admin/geraete?ausleihbar=1`, traefe ein reines Abfragemuster
     * trotzdem — und der Vitest-Fall daneben kann es erst recht nicht sagen, weil er
     * `usePathname` MOCKT. Hier steht die einzige Messung dieser Zusage.
     */
    await expect(page).toHaveURL(/^http:\/\/radio\.localtest\.me:3100\/admin\/geraete\?/);
    expect(new URL(page.url()).searchParams.get("ausleihbar")).toBe("1");
  });

  test("Fall 3: /admin/geraete/<id> zeigt das Formular", async ({ page }) => {
    /*
     * ⛔ DIESER FALL IST PFLICHTBESTANDTEIL VON AUFGABE V14, NICHT NACHBESSERUNG
     * (`Spec:4879`, Fall 3). Er ist der EINZIGE Waechter ueber **Falle 1** — dem Fehler, den
     * Vitest strukturell nicht sehen kann und den `.superpowers/sdd/planteil4/BERICHT-V14.md`
     * als Sonde **S-V14d** mit 0 rot protokolliert: `DeviceFields.tsx` ist fast ausschliesslich
     * `Form.Item`, und Compound-Zugriff in einer Server Component ist HTTP 500. In jsdom gibt
     * es keine RSC-Grenze — dort rendert dasselbe Markup klaglos.
     *
     * ⛔ DER GRIFF IST DAS PFLICHTFELD, NICHT „irgendein Text ist da": bricht die Insel an der
     * Grenze, rendert die Seite gar nicht, und `#issi` fehlt.
     */
    await devLogin(page, { host: RADIO_HOST, groups: RADIO_ADMIN_GRUPPE });

    /*
     * ⬜ **V13-L2 — HEUTE SEEDET DER E2E-LAUF `radio` NICHT** (`core/bootstrap.ts:49-54`,
     * `playwright.config.ts:142`; Eigentuemer V23). Die Akte-Adresse gibt es nur zu einem
     * vorhandenen Geraet, und eine erfundene Id waere ein 404, den dieser Fall dann als
     * „Formular fehlt" meldete. Deshalb faellt die Vorbedingung LAUT und mit eigener
     * Begruendung aus, statt die Zusicherung darunter stillschweigend zahnlos zu machen.
     */
    await page.goto(radioUrl("/admin/geraete"));
    const zeilen = page.locator("table tbody tr.ant-table-row");
    expect(
      await zeilen.count(),
      "⬜ V13-L2: ohne Geraet gibt es keine Akte-Adresse, die dieser Fall abrufen koennte",
    ).toBeGreaterThan(0);

    /*
     * ⛔ KEIN ZEILENKLICK, UND DAS IST FALLE 12 (`CLAUDE.md`, gemessen im Modul `lagerbuch`,
     * CI-Lauf 31951787232): der erste Klick nach `goto` faellt in genau das Fenster, in dem
     * `SessionProvider` `/api/auth/session` nachholt und die Huelle von der Platzhalter- auf
     * die volle Spalte umbricht — der Inhalt rutscht ~240 px, `mouseup` trifft den Vorfahren,
     * und die Navigation wird NIE angestossen. Kein Zeitbudget und keine Wiederholung heilt
     * das. Die Id steht ohnehin am Knoten: antds `Table` stempelt `data-row-key` aus
     * `rowKey="id"` (`GeraeteTabelle.tsx:468`).
     * ⚠️ DASS DIE ZEILE SELBST NAVIGIERT, bleibt Fall 2s Gebiet (`onRow`, `router.push`); der
     * Vitest-Fall „jede Zeile fuehrt auf die AEUSSERE Detailadresse" haelt ihre Anwesenheit an
     * BEIDEN Stellen fest.
     */
    const geraeteId = await zeilen.first().getAttribute("data-row-key");
    expect(geraeteId, "die Tabellenzeile traegt kein data-row-key (rowKey=id)").toBeTruthy();

    const antwort = await page.goto(radioUrl(`/admin/geraete/${geraeteId}`));
    expect(antwort?.status(), "/admin/geraete/<id> auf dem radio-Host").toBe(200);

    await expect(
      page.locator("#issi"),
      "kein ISSI-Feld — die Insel ist an der RSC-Grenze gebrochen (Falle 1)",
    ).toBeVisible();
    await expect(
      page.locator('[data-rolle="radio-update-stand"]'),
      "der Anzeige-Slot Update-Stand fehlt",
    ).toBeVisible();
    await expect(
      page.locator('[data-rolle="radio-notiz-eingabe"]'),
      "das Notizfeld fehlt — es steht fuer BEIDE Stufen (Spec:4448)",
    ).toBeVisible();
  });
});
