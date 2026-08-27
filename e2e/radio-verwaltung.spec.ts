import { test, expect } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";
import {
  FREMDER_HOST,
  RADIO_ADMIN_GRUPPE,
  RADIO_HOST,
  RADIO_UPDATER_GRUPPE,
  fremdUrl,
  radioUrl,
} from "./helpers/radio";

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
 * ✅ SEIT DEM 2026-08-26 IST DIE LISTE VOLLSTAENDIG (Aufgabe V23, der Abschluss von
 * Planteil 4): Fall 8 („fremder Suite-Host antwortet 404") kam dazu, und mit ihm die vier
 * Wirkproben „V-L3 A" bis „V-L3 D" unten. ⛔ Damit ist ⬜ **V-L3 abgelesen** — die Messwerte
 * stehen im Kopfkommentar von `src/app/m/radio/riegel.test.ts`, weil dort die Behauptung
 * stand, die sie ersetzen. ⚠️ Sie stehen dort und NICHT in einem Bericht: der
 * Berichtsordner ist git-ignoriert (`.gitignore:17`), und eine Messung, die nur in einer
 * nicht verfolgten Datei steht, findet der naechste Leser nicht.
 *
 * ⛔ DIE VIER WIRKPROBEN SIND DAUERFAELLE, KEINE EINMALIGE ABLESUNG. Fuer „V-L3 D" ist das
 * tragend: `riegel.test.ts` faengt eine faelschlich abgesenkte Seite im `(arbeit)`-Zweig
 * strukturell nicht.
 *
 * ⛔ **SEIT DEM 2026-08-27 SIND ES EINUNDZWANZIG `test()`-BLOECKE, NICHT SIEBZEHN**
 * (Planteil 5, Aufgabe T5). Die Zahl ist an Playwrights eigener Zaehlzeile abgelesen —
 * „Running 21 tests using 1 worker" / „21 passed" — und ⛔ **nicht** mit
 * `grep -c "test("`, der `test.describe(` und Kommentartreffer mitzaehlt. Vier Faelle kamen
 * dazu:
 *
 *   * „eine Geraetezeile zeigt ihren formatierten Wert, nicht das Rohfeld" und
 *     „eine Leihzeile zeigt ihren formatierten Wert, nicht das Rohfeld" — sie schliessen die
 *     gemessene Luecke in `Spec:6874`: von den drei dort genannten „sicheren" Flaechen trug
 *     nur EINE (Fall 8) eine Zusicherung auf eine ZELLE; Fall 2 und Fall 5 pruefen die
 *     Kopfzeile, und die ist statisches JSX. ⬜ **T-L1 ist damit abgelesen** — die zwei
 *     Spalten stehen namentlich in den Faellen.
 *   * „die Hoehe eines App-Umschalter-Eintrags ist kleiner als die Kopfzeilenhoehe" — Falle 8,
 *     als VERHAELTNIS und nicht als Zahl.
 *   * „das Druckblatt riegelt die Verwaltungsstufe ab" — ⬜ **V-L14 / T-L3**, die Wirkprobe
 *     des Personenriegels im `(druck)`-Zweig. ⛔ Ein UEBERNOMMENER Posten: Eigentuemer war
 *     laut `src/app/m/radio/riegel.test.ts:81-87` die Schlusspruefung von Planteil 4, sie hat
 *     ihn nicht abgelesen, und Planteil 5 uebernimmt ihn ausdruecklich statt ihn
 *     weiterzureichen.
 *
 * ⛔ **DIE SECHS MUTATIONSSONDEN ZU DIESEN VIER FAELLEN — GEMESSEN AM 2026-08-27, JEDE
 * ZURUECKGENOMMEN.** Sie stehen hier und nicht nur im Bericht: der Berichtsordner ist
 * git-ignoriert (`.gitignore:17`), und dieselbe Tafelform fuehrt `e2e/radio-hosts.spec.ts`
 * fuer T4.
 * ⚠️ **UND SIE SIND DIE FALSIFIZIERBARKEIT DIESER VIER FAELLE, NICHT EIN ROTER ERSTLAUF:**
 * alle vier beschreiben Verhalten, das am Bautag bereits GEBAUT war (beide `render`-Funktionen,
 * `shell.module.css:486`, beide `requireRadioAdmin()`-Zeilen). Sie waren beim ersten Lauf
 * gruen, und eine absichtlich falsche Zusicherung, nur um eine rote Zeile vorzuweisen, waere
 * genau die Fehlerform, gegen die dieses Haus vernarbt ist.
 *
 *   S-T5a   `GeraeteTabelle.tsx:139-141`, die `render`-Funktion der Spalte `updateStand`
 *           durch `String(wert)` ersetzt          -> **1 rot**: acht Zellen `[object Object]`
 *                                                   statt `Aktuell`/`Veraltet`/`Unbekannt`.
 *   S-T5b   `AusleihenTabelle.tsx:157`, dieselbe Ersetzung an der Spalte `Status`
 *                                                 -> **1 rot**: `toHaveCount` erwartete 4,
 *                                                   erhielt 0 — die Marke entsteht nicht mehr.
 *   S-T5c   `src/core/shell/shell.module.css:486`, `line-height: normal` am GEMEINSAMEN
 *           Vorfahren `.umschalter` entfernt      -> **1 rot**: ein Panel-Eintrag ist
 *                                                   **80 px** hoch in einer **64 px** hohen
 *                                                   Kopfzeile. ⚠️ Der Kommentar an jener
 *                                                   Regel nennt 82 px; hier gemessen sind es
 *                                                   80 (8 + 64 + 8). Die fremde Datei wurde
 *                                                   NICHT geaendert — dies ist die Messung
 *                                                   dieser Flaeche, keine Berichtigung dort.
 *                                                   ⚠️ Dieselbe Sonde faerbt GEMESSEN auch
 *                                                   `src/core/shell/shell-css.test.ts` rot
 *                                                   („nimmt dem Umschalter die von antd
 *                                                   geerbte Zeilenhoehe", `1 failed |
 *                                                   34 passed`) und HERGELEITET, nicht
 *                                                   gemessen, `e2e/shell-mobil.spec.ts:634`
 *                                                   und `:653`. Beides ist ERWARTET und kein
 *                                                   Befund; waehrend des Sondenfensters lief
 *                                                   NUR der eine Playwright-Fall.
 *   S-T5d   `admin/(druck)/layout.tsx:49`, `requireRadioAdmin()` -> `requireRadioVerwaltung()`
 *                                                 -> **0 rot**, `1 passed`.
 *   S-T5d2  dieselbe Absenkung ZUSAETZLICH in `admin/(druck)/zugaenge/blatt/page.tsx:103`
 *                                                 -> **1 rot**: `Expected 404 / Received 200`.
 *   S-T5d3  NUR `blatt/page.tsx:103` abgesenkt, das Layout unveraendert
 *                                                 -> **0 rot**, `1 passed` — der Updater
 *                                                   bekommt weiterhin 404.
 *
 * ⛔ **WAS S-T5d MISST UND WAS NICHT — DIE NULL IST HIER KEIN TESTFEHLER, SONDERN EIN
 * NULL-EINGRIFF.** Der Druckzweig ist DOPPELT geriegelt: `admin/(druck)/layout.tsx:49` UND
 * `admin/(druck)/zugaenge/blatt/page.tsx:103` rufen beide `requireRadioAdmin()`, und die
 * Doppelung ist ANGEORDNET (`Spec:569-571`, „Route-Group-Grenzen sind keine
 * Sicherheitsgrenzen"; ausgeschrieben in `admin/(druck)/layout.tsx:32-38`). Eine Sonde, die
 * nur EINE der zwei Linien absenkt, kann den Fall nicht rot machen — dieselbe Klasse wie
 * S-T4i/S-T4j in `e2e/radio-hosts.spec.ts` und wie Probe P1 zum Ausleihzweig.
 * ⚠️ S-T5d und S-T5d2 faerben zugleich Klausel (g) von `src/app/m/radio/riegel.test.ts` rot
 * (die zwei Zusicherungen ueber `(druck)/layout.tsx`). Fuer S-T5d3 ist die Nebenwirkung
 * GEMESSEN und groesser als die eine erwartete Klausel: `rtk pnpm vitest run
 * src/app/m/radio/admin/actions.test.ts src/app/m/radio/riegel.test.ts` meldet unter dieser
 * Sonde `5 failed | 36 passed` in ZWEI Dateien — zwei Faelle in `admin/actions.test.ts` (die
 * V21-Klausel UND die Zaehlung „genau VIER Verwaltungsseiten nennen requireRadioAdmin") und
 * drei in `riegel.test.ts` (Klauseln (e), (g), (h)). Alles ERWARTET und kein Befund; gemessen
 * wird ausschliesslich, ob DIESER Playwright-Fall rot wird.
 *
 * ✅ **⬜ V-L14 IST DAMIT ABGELESEN, UND ZWAR IN BEIDE RICHTUNGEN.** S-T5d2 zeigt, dass der
 * Fall die STUFE misst und nicht die Huelle (404 -> 200, sobald beide Linien fallen). S-T5d3
 * zeigt, dass die Linie IM LAYOUT allein traegt: mit abgesenkter Seite und unveraendertem
 * Layout bleibt der Updater bei 404. Die zwei Riegelebenen greifen also unabhaengig
 * voneinander — dieselbe Aussage, die Probe P1/P2 fuer den Ausleihzweig ergeben hat.
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

  test("die Hoehe eines App-Umschalter-Eintrags ist kleiner als die Kopfzeilenhoehe", async ({
    page,
  }) => {
    /*
     * ⛔ FALLE 8, UND KEIN GATE DIESES REPOS FINDET SIE. `antd/es/layout/style/index.js` setzt
     * auf `.ant-layout-header` ein `line-height` in KOPFZEILENHOEHE und vererbt es an jedes
     * Kind. Die Regel wird zur Laufzeit ueber cssinjs eingespritzt — sie steht in KEINER Datei
     * des Repos, `tsc` und `eslint` sehen sie nicht, und jsdom rechnet keine Zeilenboxen.
     * Gemessen war jeder Panel-Eintrag dadurch 82 px hoch (8 px Polster + 64 px Zeilenbox +
     * 8 px Polster) in einer 64 px hohen Kopfzeile; die Gegenmassnahme ist EINE Zeile am
     * GEMEINSAMEN VORFAHREN, `line-height: normal` an `.umschalter`
     * (`src/core/shell/shell.module.css:486`, Begruendung `:482-487`).
     *
     * ⛔ ALS VERHAELTNIS UND NICHT ALS ZAHL. `shell-css.test.ts` haelt fest, dass die
     * Gegenmassnahme DASTEHT; `e2e/shell-mobil.spec.ts:653-660` misst den Eintrag gegen die
     * feste Zahl 56 auf `portal.localtest.me`. ⛔ DIESER FALL IST BEIDES NICHT: er misst auf
     * der VERWALTUNGSFLAECHE DIESES MODULS und stellt die Eintragshoehe gegen die
     * TATSAECHLICHE Kopfzeilenhoehe. Eine feste Zahl waere eine zweite Wahrheit ueber
     * `headerHeight`; das Verhaeltnis bleibt richtig, wenn die Kopfzeile einmal anders hoch
     * ist.
     *
     * ⛔ DIE VORBEDINGUNG WIRD MITGEPRUEFT, SONST GEHT DER FALL STILL VAKUOES: spritzte antd
     * die Regel eines Tages nicht mehr ein, waere der Eintrag ohnehin niedrig und die
     * Zusicherung gruen, ohne noch irgendetwas zu bewachen. Deshalb liest die Zeile darunter
     * die geerbte Zeilenhoehe der Kopfzeile ab und haelt sie gegen deren eigene Hoehe.
     *
     * ⛔ `klickeWennRuhig` UND KEIN BLANKES `.click()` — Falle 12, Bauform 24. `/admin` laeuft
     * in `FullShell` mit `SessionProvider`; die Navigation wechselt nach dem Nachladen der
     * Sitzung von der schmalen Platzhalter- auf die volle Spalte, der Inhalt rutscht rund
     * 240 px hoch, und zwar NACH `load` und hinter Playwrights eigener Stabilitaetsprobe. Die
     * Begruendung steht in voller Laenge in `e2e/fixtures.ts:45-88`.
     *
     * ⚠️ KEIN `test.use({ viewport })` — das setzte die Breite fuer JEDEN Fall dieser Datei
     * still um. Playwrights Vorgabe 1280x720 traegt `md === true` bereits, und genau darauf
     * verlassen sich die Tabellenzweige der Faelle 2 und 5 seit V13.
     */
    await devLogin(page, { host: RADIO_HOST, groups: RADIO_ADMIN_GRUPPE });

    const antwort = await page.goto(radioUrl("/admin"));
    expect(antwort?.status(), "/admin auf dem radio-Host").toBe(200);

    const kopf = page.getByTestId("suite-header");
    await expect(kopf, "die Suite-Kopfzeile fehlt — es gibt nichts, wogegen zu messen waere").toBeVisible();
    const kopfKasten = await kopf.boundingBox();
    expect(kopfKasten, "die Kopfzeile hat keinen Kasten").not.toBeNull();

    // DIE VORBEDINGUNG DER FALLE: antd vererbt die Kopfzeilenhoehe als Zeilenhoehe weiter.
    // Faellt sie weg, bewacht der Vergleich darunter nichts mehr — dann ist diese Zeile rot,
    // und das ist die richtige Meldung.
    expect(
      await kopf.evaluate((el) => getComputedStyle(el).lineHeight),
      "antd vererbt der Kopfzeile keine Zeilenhoehe mehr — Falle 8 ist weg, und dieser Fall waere vakuoes",
    ).toBe(`${kopfKasten!.height}px`);

    await klickeWennRuhig(page.getByTestId("app-umschalter"));

    const panel = page.getByTestId("app-panel");
    await expect(panel, "das Panel des App-Umschalters ist nicht aufgegangen").toBeVisible();
    const eintrag = panel.getByTestId("app-eintrag").first();
    await expect(
      eintrag,
      "kein einziger Eintrag im Panel — die Hoehenzusage darunter maesse nichts",
    ).toBeVisible();

    const eintragKasten = await eintrag.boundingBox();
    expect(eintragKasten, "der Eintrag hat keinen Kasten").not.toBeNull();
    expect(
      eintragKasten!.height,
      `ein Panel-Eintrag ist ${eintragKasten!.height} px hoch bei einer ${kopfKasten!.height} px ` +
        "hohen Kopfzeile — die geerbte Zeilenhoehe ist zurueck (shell.module.css:486)",
    ).toBeLessThan(kopfKasten!.height);
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
     * ✅ ⬜ **V13-L2 IST IN V23 GESCHLOSSEN.** `core/bootstrap.ts:49-56` nimmt das Modul
     * weiterhin bewusst vom BOOT-Seed aus (ein geseedeter Zugangscode waere in der
     * Generalprobe ein gueltiger anonymer Schreibzugang) — geschlossen wurde die Luecke
     * stattdessen in `playwright.config.ts`s `webServer.command`, der seit dieser Aufgabe
     * `scripts/seed-lokal.ts radio` mitruft. Die Zeile bleibt stehen und ist ab jetzt der
     * Waechter ueber dem Seed selbst: ohne Datenzeile kann diese Flaeche S-V13d nicht fangen
     * (`InternalTable.js:368`).
     */
    expect(
      await page.locator("table tbody tr.ant-table-row").count(),
      "ohne Datenzeile kann diese Flaeche S-V13d nicht fangen (InternalTable.js:368)",
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

  test("eine Geraetezeile zeigt ihren formatierten Wert, nicht das Rohfeld", async ({ page }) => {
    /*
     * ⛔ DIE LUECKE, DIE DIESER FALL SCHLIESST — GEMESSEN, NICHT VERMUTET. `Spec:6874` nennt
     * DREI „sichere" Flaechen fuer die Zellen-Zusage. Am 2026-08-27 Zeile fuer Zeile
     * nachgelesen trug sie nur EINE: Fall 8 („/admin/versionen") sichert den Inhalt einer
     * DATENZEILE aus einer `render`-Funktion zu. Fall 2 (Geraeteliste) und Fall 5
     * (Ausleihenliste) pruefen `table thead th` — und die Kopfzeile ist statisches JSX aus
     * den `title`-Feldern. Sie stuende unveraendert da, wenn JEDE `render`-Funktion durch
     * ihren Rohwert ersetzt waere.
     *
     * ⚠️ EREIGNISSE (Fall 4) UND ZUGAENGE (Fall 9) HABEN DIESELBE LUECKE — ⛔ dieser Fall
     * schliesst sie NICHT und behauptet es auch nicht. `Spec:6874` verspricht fuer sie keine
     * Zelle; wer sie nachtraegt, traegt sie nach. Wer daraus eine Vollzaehligkeitsbehauptung
     * macht, nicht.
     *
     * ⬜ **T-L1 IST HIER ABGELESEN: DIE SPALTE IST `updateStand`.** Gemessen am 2026-08-27:
     * `GeraeteTabelle.tsx` (573 Zeilen) traegt FUENFZEHN `render:`-Vorkommen, und alle
     * fuenfzehn sind echte Spalten-Props — `:125`, `:129`, `:130`, `:131`, `:139`, `:153`,
     * `:157`, `:158`, `:159`, `:160`, `:161`, `:162`, `:170`, `:180`, `:194`, jede Zeile
     * einzeln aufgeschlagen, keine steht in einem Kommentar.
     *
     * ⛔ WARUM NICHT EINE DER ZWOELF `render: text`-SPALTEN: `text` (`:72`) reicht eine
     * nicht-leere Zeichenkette UNVERAENDERT durch. Unter der Sonde „die `render`-Funktion
     * durch ein `String(wert)` ersetzen" saehe die Zelle fuer jeden belegten Wert GLEICH aus
     * — der Fall waere vakuoes gruen, genau der Zustand, vor dem der Bauauftrag warnt.
     * `updateStand` faltet dagegen SICHTBAR: aus dem Rohwert `aktuell|veraltet|unbekannt`
     * (`_lib/updateStand.ts`) wird das grossgeschriebene Wort aus `STAND_WORT` (`:87-91`),
     * gesetzt in ein `Tag` (`:139-141`).
     *
     * ⛔ UND DIE SPALTE TRAEGT KEIN `dataIndex` (`:133-142`): rc-table reicht der
     * `render`-Funktion dann den DATENSATZ als ersten Parameter, ein `String(wert)` ergibt
     * dort `[object Object]`. Die Sonde ist damit nicht nur wirksam, sondern laut.
     *
     * ⛔ SIE STEHT OHNE ZUTUN IN DER TABELLE — eine der ACHT Vorgabespalten (`:200-209`).
     * Ein frischer Playwright-Kontext hat keinen `localStorage`, und `serverSchnappschuss()`
     * liefert dieselbe Vorgabe.
     *
     * ⛔ DER SPALTENINDEX WIRD ABGELESEN, NICHT GESCHRIEBEN. Ein festes `nth-child(5)` waere
     * eine zweite Wahrheit ueber die Spaltenreihenfolge und stuende still daneben, sobald
     * `VORGABE_SPALTEN` sich aendert.
     */
    await devLogin(page, { host: RADIO_HOST, groups: RADIO_ADMIN_GRUPPE });

    const antwort = await page.goto(radioUrl("/admin/geraete"));
    expect(antwort?.status(), "/admin/geraete auf dem radio-Host").toBe(200);

    /*
     * ⛔ EINE WARTENDE ZUSICHERUNG VOR JEDEM `allTextContents()` UND JEDEM `count()` — beide
     * sind EINMALIGE Ablesungen ohne Wiederholung, anders als jedes `expect(locator)`.
     * ⚠️ GEMESSEN AM 2026-08-27, beim ersten Lauf dieses Falles: ohne diese Zeile las er ein
     * LEERES Array ab und meldete „die Spalte „Update-Stand“ steht nicht in der Kopfzeile" —
     * eine Meldung ueber die SPALTENWAHL, waehrend das Tabellenmarkup in jenem Augenblick
     * schlicht noch nicht im DOM stand. ⛔ WARUM es dort nicht stand, ist NICHT gemessen und
     * steht deshalb hier auch nicht; die Abhilfe braucht die Ursache nicht. Fall 2 oben faehrt
     * seit V13 dieselbe Reihenfolge.
     */
    await expect(
      page.locator("table thead th").first(),
      "keine Tabellenkopfzeile — die Insel ist an der RSC-Grenze gebrochen (Falle 9)",
    ).toBeVisible();

    const kopfTexte = await page.locator("table thead th").allTextContents();
    expect(
      kopfTexte,
      "die Spalte „Update-Stand“ steht nicht in der Kopfzeile — die Zusicherung darunter maesse nichts",
    ).toContain("Update-Stand");
    const spalte = kopfTexte.indexOf("Update-Stand") + 1;

    /*
     * ⛔ DIE KONTROLLE ZUR ZEILE DARUNTER, und ohne sie waere jene ein NO-OP: eine
     * Zellen-Zusage ueber NULL Datenzeilen ist leer-gruen. Dieselbe Ueberlegung wie in
     * Fall 2 und in `e2e/lagerbuch-checklisten.spec.ts:112-123`.
     */
    await expect(
      page.locator("table tbody tr.ant-table-row").first(),
      "ohne Datenzeile misst die Zellen-Zusage nichts",
    ).toBeVisible();
    expect(
      await page.locator("table tbody tr.ant-table-row").count(),
      "ohne Datenzeile misst die Zellen-Zusage nichts",
    ).toBeGreaterThan(0);

    const zellen = page.locator(`table tbody tr.ant-table-row td:nth-child(${spalte})`);
    const werte = await zellen.allTextContents();
    /*
     * ⛔ DIE MENGE ALLER DREI WOERTER, NICHT EIN EINZELNES. Welcher Stand in Zeile 1 steht,
     * haengt an der Zielversion und am Seed (`_lib/seedLokal.ts:118-127`, `:135-179`) — und
     * Fall 7 legt im SELBEN Lauf ueber den Import weitere Geraete an. Die Zusage lautet
     * „jede Zelle traegt das gefaltete Wort", nicht „Zeile 1 traegt Aktuell".
     */
    expect(
      werte.filter((w) => !["Aktuell", "Veraltet", "Unbekannt"].includes(w)),
      "eine Zelle der Spalte „Update-Stand“ zeigt nicht das Wort aus STAND_WORT (GeraeteTabelle.tsx:87-91)",
    ).toEqual([]);
    await expect(
      zellen.first().locator(".ant-tag"),
      "die Marke um das Wort fehlt — die render-Funktion hat die RSC-Grenze nicht heil ueberstanden",
    ).toHaveCount(1);
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
     * ✅ ⬜ **V13-L2 IST IN V23 GESCHLOSSEN.** `playwright.config.ts`s `webServer.command` ruft
     * seit dieser Aufgabe zusaetzlich `scripts/seed-lokal.ts radio` (acht Geraete, gemessen
     * am 2026-08-26). Die Vorbedingung bleibt trotzdem stehen — sie ist ab jetzt der
     * Waechter darueber, dass der Seed WIRKT: faellt er still weg, meldet diese Zeile es
     * namentlich, statt die Zusicherungen darunter zahnlos zu machen.
     *
     * ⛔ UND DIE WARTESTELLE DAVOR IST KEINE KOSMETIK — sie ist ein am 2026-08-26 GEMESSENER
     * Befund, im ersten Lauf mit Seed: `GeraeteTabelle.tsx:400` entscheidet ueber
     * `Grid.useBreakpoint()` zwischen Tabelle und Kartenliste, und `useBreakpoint` liefert im
     * Serverrender UND im ersten Client-Render ein leeres Objekt. `breit` ist dann `false`,
     * und die ausgelieferte Seite traegt eine `<ul>` statt einer `<table>`. `page.goto` kehrt
     * bei `load` zurueck, also VOR dem Umschlag; das sofortige `count()` las deshalb **0**,
     * obwohl acht Geraete in der Datenbank standen (Ablaufverfolgung
     * `test-results/…-raete-id-zeigt-das-Formular/error-context.md`, Knoten `- list`).
     * ⛔ `count()` WIEDERHOLT NICHT — nur eine `expect(...)`-Zusicherung tut das. Fall 2 hat
     * die Wartestelle ohnehin (`table thead th` sichtbar) und war deshalb gruen; hier fehlte
     * sie, und der Fehlschlag benannte die falsche Ursache.
     */
    await page.goto(radioUrl("/admin/geraete"));
    const zeilen = page.locator("table tbody tr.ant-table-row");
    await expect(
      zeilen.first(),
      "die Tabelle ist nicht erschienen — Grid.useBreakpoint hat nicht umgeschlagen (GeraeteTabelle.tsx:400)",
    ).toBeVisible();
    expect(
      await zeilen.count(),
      "der radio-Seed hat kein Geraet angelegt (playwright.config.ts, webServer.command)",
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

    /*
     * ⛔ ANHAENGEN, DANN SPEICHERN — DIE EINE REIHENFOLGE, DIE EINE APPEND-ONLY-SPALTE
     * VERLIEREN KANN, und sie ist HIER der einzige echte Waechter (⬜ **V14-L3**, Aufgabe
     * **V23**, REVIEW-V14 Fund 1). Der Weg entsteht erst in der Suite: der Bestand rendert das
     * Notizpanel fuer Admins gar nicht (`DeviceDetailDrawer.tsx:109`), hier steht das
     * Eingabefeld fuer BEIDE Stufen (`briefs/V14.md:92-96`, `Spec:4448`).
     *
     * ⛔ **V14-L3, NICHT V-L3** — die Nummer ist in Fix-Runde 2 richtiggestellt (REVIEW-V14,
     * NEU-2). ⬜ V-L3 ist eine ANDERE Frage mit einem ANDEREN Ablageort: „Greift der
     * Verwaltungs-Riegel bei einem echten Abruf?", und ihre Antwort gehoert in den
     * Kopfkommentar von `riegel.test.ts` (`planteil4/briefs/KOPF.md:375`). Wer in V23 V-L3
     * abliest, beantwortet die Riegelfrage — und haette diese hier stillschweigend mit
     * abgehakt. ⬜ V14-L3 fragt statt dessen: haelt die append-only-Spalte den Durchlauf
     * Anhaengen → Speichern → Neuladen, in BEIDEN Reconciliation-Zweigen? Eigentuemer ist
     * ebenfalls V23, der Ablageort ist dieser Fall.
     *
     * ✅ **AM 2026-08-26 ZUR HAELFTE GEMESSEN (V23), und die andere Haelfte ist von aussen
     * strukturell nicht messbar.** Seit `webServer.command` `radio` mitseedet, laeuft dieser
     * Abschnitt gegen ein echtes Geraet und ist gruen: die angehaengte Zeile steht nach
     * `page.reload()` noch in `#updateNote`, und `#tei` traegt die Marke. ⛔ **WAS DAS NICHT
     * SAGT:** welchen der beiden Reconciliation-Zweige Next in diesem Lauf genommen hat — das
     * ist von aussen nicht zu unterscheiden. Die Vorkehrung dagegen ist die REIHENFOLGE unten
     * (`#tei` wird erst NACH dem `revalidatePath`-Anstoss gefuellt, REVIEW-V14 NEU-1); sie
     * macht den Fall in beiden Zweigen aussagekraeftig, belegt aber nicht, dass beide gelaufen
     * sind. ⬜ **Der Rest bleibt offen; Eigentuemer: Generalprobe.**
     *
     * ⛔ WAS NUR HIER MESSBAR IST, UND WARUM DER FALL NICHT WEGKUERZBAR IST: `notizAnfuegenAction`
     * stoesst `revalidatePath` auf genau diese Seite an (`admin/actions.ts:677`). ⛔ OB NEXT
     * DIE INSEL DABEI AN ORT UND STELLE NEU RENDERT ODER SIE NEU AUFBAUT, ist in Vitest
     * strukturell nicht zu sehen — es gibt dort keinen Server. Beide Wege muessen dieselbe
     * Zusage halten, und genau das misst dieser Abschnitt.
     *
     * ⛔ DER PATCH MUSS NICHT LEER SEIN, sonst laeuft das Speichern gar nicht erst los
     * (`GeraetFormular.tsx:411-414`, `DeviceEditForm.tsx:87-90`) und der Fall waere
     * vakuum-gruen. Deshalb aendert er ausserdem ein gewoehnliches Feld — ⛔ **NACH** dem
     * Anstoss, siehe unten.
     */
    const marke = `E2E-${Date.now()}`;
    await page.locator('[data-rolle="radio-notiz-eingabe"]').fill(`Sonde ${marke}`);
    await page.locator('[data-rolle="radio-notiz-anhaengen"]').click();

    /*
     * ⛔ ERST WENN DIE ANGEHAENGTE ZEILE IM FORMULARFELD STEHT, ist der Serverstand
     * angekommen — fuer die Admin-Stufe zeigt das Formular die Anmerkung, nicht das Panel
     * (`DeviceFields.tsx:181-190`, `NotizFeld.tsx`).
     */
    await expect(page.locator("#updateNote")).toHaveValue(new RegExp(`Sonde ${marke}`));

    /*
     * ⛔ DAS GEWOEHNLICHE FELD WIRD ERST HIER GEFUELLT, UND DAS IST KEINE KOSMETIK (REVIEW-V14,
     * NEU-1). Zwischen Klick und dieser Zeile laeuft der `revalidatePath`-Anstoss, dessen
     * Verhalten dieser Fall selbst ausdruecklich als NICHT GEMESSEN fuehrt. Baute Next die
     * Insel dabei NEU AUF, waere eine VORHER eingetippte `#tei` weg, `baueGeaenderteFelder`
     * lieferte `{}`, und `absenden` stiege frueh aus (`GeraetFormular.tsx:411-414`) — es wuerde
     * gar nichts gespeichert, und der Fall fiele unten auf `#tei` mit der FALSCHEN Begruendung
     * („wurde gar nicht gespeichert"), waehrend die append-only-Zusage ungemessen bliebe.
     * Nach dem Anstoss gefuellt, misst er in BEIDEN Zweigen, was sein Kommentar behauptet.
     */
    await page.locator("#tei").fill(marke);

    /*
     * ⛔ GEWARTET WIRD AUF DIE ANTWORT DER SERVER ACTION, NICHT AUF EIN ABWESENDES ELEMENT
     * (REVIEW-V14, NEU-1). Der Fehlerabsatz entsteht NUR bei `ergebnis.ok === false`
     * (`GeraetFormular.tsx:419`, `:615-621`); im Erfolgsfall und waehrend der noch LAUFENDEN
     * Action ist er gleichermassen abwesend. Ein `toHaveCount(0)` darauf trifft deshalb sofort
     * zu, faengt kein fehlgeschlagenes Speichern — und ist vor allem KEINE Wartestelle: das
     * `page.reload()` darunter koennte die laufende Action abbrechen.
     * ⛔ DIESELBE BAUFORM WIE `e2e/aufgaben.spec.ts:1619-1623`, und dieselbe Lehre wie Falle 10
     * in `CLAUDE.md`: wer eine Anfrage ausloest, prueft ihre ANTWORT.
     * ⚠️ HAENGT DIESE STELLE JE, ist die Gleichheit `r.url() === seite` der Verdaechtige (eine
     * Server Action postet auf die Adresse der Seite), nicht die Action — dann auf die Methode
     * allein verengen, ⛔ nicht die Wartestelle streichen.
     */
    const speichern = page.locator('[data-rolle="radio-formular-speichern"]');
    const seite = page.url();
    const [speicherAntwort] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url() === seite),
      speichern.click(),
    ]);
    expect(
      speicherAntwort.ok(),
      `Speichern abgelehnt: HTTP ${speicherAntwort.status()}`,
    ).toBe(true);

    /*
     * ⛔ UND DANN AUF DAS ENDE DES LADEZUSTANDS, weil `setLaeuft(false)` und `setFehler(...)`
     * unmittelbar nacheinander stehen (`GeraetFormular.tsx:418-419`): erst wenn der Knopf
     * seinen Ladezustand verloren hat, ist ein etwaiger Fehlerabsatz gerendert. antd stempelt
     * dafuer `ant-btn-loading` (`node_modules/antd/es/button/button.js:243`).
     * ⚠️ DIESE ZWEI ZEILEN SIND DIE ABSICHERUNG, NICHT DIE ZUSAGE — die Zusage steht nach dem
     * Neuladen.
     */
    await expect(speichern).not.toHaveClass(/ant-btn-loading/);
    await expect(
      page.locator('[data-rolle="radio-formular-fehler"]'),
      "das Formular meldet einen Fehler statt zu speichern",
    ).toHaveCount(0);

    /*
     * ⛔ DIE ZUSAGE STEHT NACH EINEM ECHTEN NEULADEN, NICHT AM BILDSCHIRMZUSTAND: nur so ist
     * gemessen, was in der SPALTE steht (`_db/schema.ts:56-59`, append-only). Bliebe das
     * Formular auf seinem alten `updateNote` stehen und schriebe es mit, waere die angehaengte
     * Zeile hier weg — still, ohne Fehlermeldung, ohne rotes Tor.
     */
    await page.reload();
    await expect(
      page.locator("#updateNote"),
      "die angehaengte Zeile ist beim Speichern verloren gegangen (append-only!)",
    ).toHaveValue(new RegExp(`Sonde ${marke}`));
    await expect(
      page.locator("#tei"),
      "das gewoehnliche Feld wurde gar nicht gespeichert — der Fall misst nichts",
    ).toHaveValue(marke);
  });

  test("Fall 4: /admin/geraete/<id>/ereignisse zeigt die Aenderungshistorie", async ({ page }) => {
    /*
     * ⛔ DIESER FALL IST PFLICHTBESTANDTEIL VON AUFGABE V15, NICHT NACHBESSERUNG
     * (`Spec:4880`, Fall 4). Er ist der EINZIGE Waechter ueber **Falle 9** an Insel 5: die
     * vier Spalten fuehren vier `render`-Funktionen, und eine `render`-Funktion, die in einer
     * Server Component entstuende, ist
     * `Error: Functions cannot be passed directly to Client Components`. In jsdom gibt es
     * keine RSC-Grenze — `EreignisTabelle.test.tsx` bleibt unter dieser Mutation gruen und
     * schreibt das in seinem Kopf selbst aus.
     *
     * ⛔ DER GRIFF IST DIE FLAECHE DER INSEL, NICHT DER TABELLENKOPF, und das ist hier der
     * Unterschied: die Insel hat ZWEI Zweige — Tabelle und Leertext (`EreignisTabelle.tsx`,
     * „ohne Ereignisse wird die Tabelle gar nicht erst gebaut"). Ein Griff auf `table thead th`
     * meldete eine Historie ohne Zeilen als gebrochene Insel. `[data-rolle="radio-ereignis-flaeche"]`
     * steht in BEIDEN Zweigen und fehlt genau dann, wenn die Insel an der Grenze bricht.
     */
    await devLogin(page, { host: RADIO_HOST, groups: RADIO_ADMIN_GRUPPE });

    /*
     * ✅ ⬜ **V13-L2 IST IN V23 GESCHLOSSEN** — dieselbe Zeile in `webServer.command` wie bei
     * Fall 3, und dieselbe Wartestelle aus demselben gemessenen Grund
     * (`GeraeteTabelle.tsx:400`, `Grid.useBreakpoint()` liefert im Serverrender ein leeres
     * Objekt; die Begruendung steht ausgeschrieben in Fall 3). Die Vorbedingung bleibt als
     * Waechter ueber dem Seed stehen.
     */
    await page.goto(radioUrl("/admin/geraete"));
    const zeilen = page.locator("table tbody tr.ant-table-row");
    await expect(
      zeilen.first(),
      "die Tabelle ist nicht erschienen — Grid.useBreakpoint hat nicht umgeschlagen (GeraeteTabelle.tsx:400)",
    ).toBeVisible();
    expect(
      await zeilen.count(),
      "der radio-Seed hat kein Geraet angelegt (playwright.config.ts, webServer.command)",
    ).toBeGreaterThan(0);

    /*
     * ⛔ KEIN ZEILENKLICK — Falle 12 (`CLAUDE.md`), dieselbe Begruendung wie in Fall 3. Die Id
     * steht am Knoten: antds `Table` stempelt `data-row-key` aus `rowKey="id"`.
     */
    const geraeteId = await zeilen.first().getAttribute("data-row-key");
    expect(geraeteId, "die Tabellenzeile traegt kein data-row-key (rowKey=id)").toBeTruthy();

    /*
     * ⛔ ERST UEBER DIE AKTE, DENN DER TEXTLINK IST DIE EINZIGE VERBINDUNG ZUR FLAECHE
     * (`Spec:4774`, `_lib/nav.ts` fuehrt keinen Menuepunkt). Ein Fall, der die Ereignisadresse
     * direkt abriefe, bliebe gruen, waehrend die Seite fuer jede Person unerreichbar ist.
     */
    await page.goto(radioUrl(`/admin/geraete/${geraeteId}`));
    const link = page.locator('a[href$="/ereignisse"]');
    await expect(link, "der Textlink „Änderungen anzeigen“ fehlt auf der Akte").toHaveCount(1);
    const ziel = await link.getAttribute("href");
    expect(
      ziel,
      "der Link traegt die innere Pfadform — auf dem Verwaltungshost ein 404",
    ).toBe(`/admin/geraete/${geraeteId}/ereignisse`);

    const antwort = await page.goto(radioUrl(`/admin/geraete/${geraeteId}/ereignisse`));
    expect(antwort?.status(), "/admin/geraete/<id>/ereignisse auf dem radio-Host").toBe(200);

    await expect(
      page.locator('[data-rolle="radio-ereignis-flaeche"]'),
      "die Insel ist an der RSC-Grenze gebrochen (Falle 9)",
    ).toHaveCount(1);
  });

  test("Fall 4a: eine erfundene Geraete-Id antwortet mit 404", async ({ page }) => {
    /*
     * ⛔ EIGENER `test()`, UND DAS IST KEINE KOSMETIK. Fall 4 oben fiel bis zum 2026-08-26 an
     * seiner Vorbedingung aus (⬜ V13-L2 — ✅ seither GESCHLOSSEN, `playwright.config.ts:158`
     * seedet `radio` jetzt im Serverstart); ein `expect(...)` WIRFT, und alles danach in
     * DEMSELBEN `test()` laeuft nie. Stuende diese Zusicherung dort unten, waere sie bis V23
     * unerreichbar gewesen — und ein Bericht, der sie als „traegt auch ohne Seed" fuehrte,
     * behauptete Gruen als konstanten Text. ⛔ Diese Fehlerklasse ist in diesem Haus vernarbt,
     * und deshalb bleibt die Teilung: hier genuegen eine Anmeldung und eine ausgedachte Id.
     * ⚠️ Die 4/4a-Teilung ist dieselbe Form, die `Spec:4880-4886` fuer Fall 5/5a selbst waehlt.
     *
     * ⛔ WAS SIE MISST: der Lesepfad prueft die Existenz des Geraets bewusst NICHT
     * (`_lib/lesepfade/ereignisse.ts`, Kopf der Funktion: „hier ist der Aufrufer die Server
     * Component aus V15, die das Geraet ohnehin schon geladen hat"). Die Pruefung steht in der
     * SEITE. Ohne sie antwortete jede erfundene Adresse mit 200 und einem Leertext — die
     * Verwaltung behauptete damit die Existenz eines Geraets, das es nicht gibt, und der
     * Alt-Handler antwortet an derselben Stelle mit 404
     * (`radio-admin/server/src/routes/devices.ts:68`).
     */
    await devLogin(page, { host: RADIO_HOST, groups: RADIO_ADMIN_GRUPPE });

    const erfunden = await page.goto(radioUrl("/admin/geraete/gibt-es-nicht/ereignisse"));
    expect(erfunden?.status(), "eine erfundene Geraete-Id antwortet nicht mit 404").toBe(404);
  });

  test("Fall 5: /admin/ausleihen zeigt die Ausleihenliste", async ({ page }) => {
    /*
     * ⛔ DIESER FALL IST PFLICHTBESTANDTEIL VON AUFGABE V16, NICHT NACHBESSERUNG
     * (`Spec:4881-4882`, Fall 5). Er ist der EINZIGE Waechter ueber **Falle 9** an Insel 2:
     * die sieben Spalten fuehren sieben `render`-Funktionen, und eine `render`-Funktion, die
     * in einer Server Component entstuende, ist
     * `Error: Functions cannot be passed directly to Client Components`. In jsdom gibt es
     * keine RSC-Grenze — `AusleihenTabelle.test.tsx` bleibt unter dieser Mutation gruen und
     * schreibt das in seinem Kopf selbst aus.
     *
     * ⛔ ER IST ZUGLEICH DER WAECHTER UEBER **FALLE 1** AM FILTER: `Select` und `DatePicker`
     * stehen in der Insel, nicht in der Seite — ein Compound-Zugriff aus einer Server
     * Component waere HTTP 500 beim Rendern.
     *
     * ⛔ DER GRIFF IST DIE FLAECHE DER INSEL UND NICHT DAS TABELLENMARKUP: die Insel hat ZWEI
     * Zweige (Tabelle und mobile Liste). ⚠️ HIER STAND BIS ZUM 2026-08-26 „⬜ V13-L2 laesst die
     * Liste heute ohnehin leer" — ✅ die Leerstelle ist in V23 GESCHLOSSEN, der e2e-Lauf seedet
     * `radio` jetzt (`playwright.config.ts:158`; VIER Leihen, `_lib/seedLokal.ts:204-226`).
     * An der Wahl des Griffs aendert das nichts: `[data-rolle="radio-ausleihen-flaeche"]` steht
     * in BEIDEN Zweigen und fehlt genau dann, wenn die Insel bricht. Wie in Fall 4 oben.
     *
     * ⚠️ DIE SEITE IST FUER BEIDE STUFEN OFFEN (`Spec:4373`, Rechtetafel `Spec:4444-4454`).
     * Der Abruf hier laeuft mit der ADMIN-Gruppe, wie jeder Fall dieser Datei; dass eine
     * UPDATER-Person sie ebenfalls erreicht, ist UNGEMESSEN — das ist seit dem 2026-08-26
     * ⬜ **V-L13** und NICHT mehr ⬜ V-L3: jene Nummer ist abgelesen (`riegel.test.ts:50-88`)
     * und traegt diese Frage nicht mit. Der namentliche Quelltext-Waechter ist
     * `AusleihenTabelle.test.tsx` („force-dynamic und den Riegel der Verwaltungs-Stufe").
     */
    await devLogin(page, { host: RADIO_HOST, groups: RADIO_ADMIN_GRUPPE });

    const antwort = await page.goto(radioUrl("/admin/ausleihen"));
    expect(antwort?.status(), "/admin/ausleihen auf dem radio-Host").toBe(200);

    await expect(
      page.locator('[data-rolle="radio-ausleihen-flaeche"]'),
      "die Insel ist an der RSC-Grenze gebrochen (Falle 9)",
    ).toHaveCount(1);

    /*
     * ⛔ DIE SIEBEN SPALTENKOEPFE IN IHRER REIHENFOLGE — 1:1 `LoanList.tsx:15-47`. Der
     * Vitest-Fall daneben prueft dieselbe Liste REIN (`SPALTEN.map(...)`), weil jsdom den
     * mobilen Zweig rendert; ⛔ NUR HIER ENTSTEHT DER TABELLENKOPF UEBERHAUPT, und nur hier
     * ist gemessen, dass die Spaltendefinitionen die RSC-Grenze heil ueberstanden haben.
     */
    await expect(page.locator("table thead th")).toHaveText([
      "Gerät",
      "Typ",
      "Ausleihende:r",
      "Ausgeliehen",
      "Zurückgegeben",
      "Status",
      "Notiz",
    ]);

    /*
     * ⛔ DER FILTER AUS ⬜ V-L11 IST DA UND SCHREIBT IN DIE ADRESSZEILE (Regime B). Ein
     * Bedienelement, das seinen Wert nur im Client haelt, waere fuer den Server unsichtbar —
     * die Liste bliebe ungefiltert, und kein Vitest-Fall saehe es.
     */
    await expect(
      page.locator('[data-rolle="radio-ausleihen-filter"]'),
      "die Filterleiste fehlt (V-L11)",
    ).toHaveCount(1);
    const mitZeitraum = await page.goto(radioUrl("/admin/ausleihen?von=2026-06-14&bis=2026-06-14"));
    expect(mitZeitraum?.status(), "ein gesetzter Zeitraum wirft die Seite ab").toBe(200);
  });

  test("eine Leihzeile zeigt ihren formatierten Wert, nicht das Rohfeld", async ({ page }) => {
    /*
     * ⛔ DIE ZWEITE HAELFTE DERSELBEN LUECKE (`Spec:6874`, dritte „sichere" Flaeche). Fall 5
     * oben prueft `table thead th` und die Anwesenheit der Insel; beide Zusagen ueberleben
     * eine `render`-Funktion, die nur noch den Rohwert durchreicht. Die Begruendung steht
     * ausgeschrieben im Zwillingsfall zu Fall 2.
     *
     * ⬜ **T-L1 IST HIER ABGELESEN: DIE SPALTE IST `Status`** (`AusleihenTabelle.tsx:155-158`).
     *
     * ⛔ DIE ZAHL, UND SIE IST GEZAEHLT STATT ABGESCHRIEBEN. `grep -c "render:"` liefert auf
     * `AusleihenTabelle.tsx` (415 Zeilen) am 2026-08-27 **ACHT** Vorkommen — davon sind
     * **SIEBEN** echte Spalten-Props (`:122`, `:129`, `:136`, `:143`, `:150`, `:157`, `:162`);
     * das achte steht auf `:70` INNERHALB eines Kommentars („je `render: (v) => v || '—'`").
     * ⛔ Der Plan sagt „acht Vorkommen" und verbietet zugleich die blanke Zahl „sieben" —
     * beides ist richtig, weil es zwei verschiedene Groessen sind. ⛔ Und die ALT-Datei
     * `LoanList.tsx` (fuenf `render`) existiert in diesem Repo nicht; sie liegt in
     * `/Users/rubeen/dev/personal/drk/radio-admin/client/src/features/loans/`.
     *
     * ⛔ WARUM DIE STATUS-SPALTE UND KEINE DER SECHS ANDEREN. Sechs reichen eine ZEICHENKETTE
     * durch und wickeln sie nur in ein `<span data-rolle=…>`; die Zeitfaltung von
     * `ausgeliehenText`/`zurueckText` geschieht im LESEPFAD und nicht in `render`
     * (`AusleihenTabelle.tsx:75-79`, `_db/leihen.ts`). Eine Zusicherung darauf pruefte den
     * Anker, nicht die Formatierung. `Status` faltet dagegen einen ROHEN WAHRHEITSWERT
     * (`z.aktiv`, im Lesepfad `returnedAt === null`) in ein WORT — `StatusMarke`
     * (`:95-103`) liefert „Aktiv" oder „Zurückgegeben" in einem `Tag`.
     *
     * ⚠️ DIE ZWEI WOERTER STEHEN MIT IHREN UMLAUTEN DA, UND DAS IST DIE HAUSAUSNAHME:
     * woertlich uebernommener Bildschirmtext behaelt sie. Dieselben zwei Zeichenketten
     * fuehrt Fall 5 oben bereits in seiner Kopfzeilen-Zusicherung.
     *
     * ⛔ DER GRIFF IST AUF `table tbody` VERANKERT: die Insel hat ZWEI Zweige, und der mobile
     * setzt dieselbe `StatusMarke` (`:382`). Auf 1280x720 rendert nur der Tabellenzweig
     * (`breit = bildschirm.md === true`, `:309-310`) — die Verankerung haelt die Zusage auch
     * dann eindeutig, wenn jemand die Breite dieser Datei einmal aendert.
     */
    await devLogin(page, { host: RADIO_HOST, groups: RADIO_ADMIN_GRUPPE });

    const antwort = await page.goto(radioUrl("/admin/ausleihen"));
    expect(antwort?.status(), "/admin/ausleihen auf dem radio-Host").toBe(200);

    /*
     * DIE KONTROLLE ZU BEIDEN ZEILEN DARUNTER — ohne Leihzeile ist jede Zellen-Zusage
     * leer-gruen. Der Seed legt vier Leihen an (`_lib/seedLokal.ts:204-226`).
     *
     * ⛔ UND SIE STEHT ALS WARTENDE ZUSICHERUNG, WEIL `count()` EINE EINMALIGE ABLESUNG IST.
     * ⚠️ Gemessen am 2026-08-27, beim ersten Lauf: ohne sie las der Fall `0` ab und meldete
     * „ohne Leihzeile misst die Zellen-Zusage nichts" — eine Meldung ueber den SEED, waehrend
     * das Tabellenmarkup in jenem Augenblick noch nicht im DOM stand. ⛔ Warum es dort nicht
     * stand, ist nicht gemessen und steht deshalb hier auch nicht.
     */
    const zeilen = page.locator("table tbody tr.ant-table-row");
    await expect(zeilen.first(), "ohne Leihzeile misst die Zellen-Zusage nichts").toBeVisible();
    const anzahl = await zeilen.count();
    expect(anzahl, "ohne Leihzeile misst die Zellen-Zusage nichts").toBeGreaterThan(0);

    const marken = page.locator('table tbody [data-rolle="radio-leihe-status"]');
    await expect(
      marken,
      "nicht jede Leihzeile traegt eine Statusmarke — die render-Funktion aus :157 ist weg",
    ).toHaveCount(anzahl);

    const woerter = await marken.allTextContents();
    expect(
      woerter.filter((w) => !["Aktiv", "Zurückgegeben"].includes(w)),
      "eine Statuszelle zeigt nicht das Wort aus StatusMarke (AusleihenTabelle.tsx:95-103)",
    ).toEqual([]);
  });

  test("Fall 6: /admin/software zeigt den Update-Modus", async ({ page }) => {
    /*
     * ⛔ DIESER FALL IST PFLICHTBESTANDTEIL VON AUFGABE V17, NICHT NACHBESSERUNG
     * (`Spec:4881-4882`, Fall 5s Bauform, hier auf `/admin/software` — B9 (`Spec:98`) gibt der
     * Route ihren Namen; §5.6.1 traegt noch `update/` und ist ueberholt).
     *
     * ⛔ ER IST DER EINZIGE WAECHTER UEBER **FALLE 1** AN INSEL 7: `Typography.Title`,
     * `Input.Search` und `Space.Compact` sind Compound-Zugriffe — aus einer Server Component
     * gerendert ist das HTTP 500 BEIM ABRUF. In jsdom gibt es keine RSC-Grenze;
     * `UpdateSuche.test.tsx` bleibt unter dieser Mutation gruen und schreibt das in seinem Kopf
     * selbst aus.
     *
     * ⛔ DER GRIFF IST DIE FLAECHE DER INSEL UND NICHT EINE KARTE: ohne Suchtext gibt es
     * keine (1:1 `UpdateMode.tsx:67-68`). ⚠️ HIER STAND BIS ZUM 2026-08-26 „⬜ V13-L2 laesst den
     * e2e-Lauf ohnehin ohne `radio`-Bestand fahren" — ✅ GESCHLOSSEN in V23
     * (`playwright.config.ts:158`). `[data-rolle="radio-update-flaeche"]` steht in JEDEM Zweig
     * und fehlt genau dann, wenn die Insel an der Grenze bricht.
     *
     * ⚠️ DIE SEITE IST FUER BEIDE STUFEN OFFEN (`Spec:4374`, Rechtetafel `Spec:4444-4454`) —
     * und sie ist die Flaeche, um deretwillen es die Updater-Stufe gibt. Der Abruf hier laeuft
     * mit der ADMIN-Gruppe, wie jeder Fall dieser Datei; dass eine UPDATER-Person sie ebenfalls
     * erreicht, ist UNGEMESSEN — das ist seit dem 2026-08-26 ⬜ **V-L13** und NICHT mehr
     * ⬜ V-L3 (jene ist abgelesen, `riegel.test.ts:50-88`). Der namentliche Quelltext-Waechter
     * ist `UpdateSuche.test.tsx` („force-dynamic und den Riegel der Verwaltungs-Stufe").
     */
    await devLogin(page, { host: RADIO_HOST, groups: RADIO_ADMIN_GRUPPE });

    const antwort = await page.goto(radioUrl("/admin/software"));
    expect(antwort?.status(), "/admin/software auf dem radio-Host").toBe(200);

    await expect(
      page.locator('[data-rolle="radio-update-flaeche"]'),
      "die Insel ist an der RSC-Grenze gebrochen (Falle 1)",
    ).toHaveCount(1);

    /*
     * ⛔ OHNE SUCHTEXT STEHT DER LEERTEXT, NICHT EINE LEERE LISTE (1:1 `UpdateMode.tsx:68`).
     * Das ist zugleich die Abnahme der SERVERSEITIGEN Haelfte von E-V17: die Seite hat nichts
     * geladen, und die Flaeche fordert zum Suchen auf.
     */
    await expect(
      page.locator('[data-rolle="radio-update-leer"]'),
      "der Leertext ohne Suchtext fehlt",
    ).toHaveText("Gerät suchen, um es zu aktualisieren");

    /*
     * ⛔ REGIME B (E-V17): der Suchtext steht in der ADRESSZEILE, und der Server liest ihn.
     * Ein Aufruf mit gesetztem `q` darf die Seite nicht abwerfen — er ist der Weg, auf dem ein
     * geteilter Link und der Zurueck-Knopf funktionieren.
     */
    const mitSuche = await page.goto(radioUrl("/admin/software?q=41"));
    expect(mitSuche?.status(), "ein gesetzter Suchtext wirft die Seite ab").toBe(200);
    await expect(
      page.locator('[data-rolle="radio-update-flaeche"]'),
      "die Insel bricht mit gesetztem Suchtext",
    ).toHaveCount(1);
  });

  test("Fall 7: /admin/import fuehrt den zweiphasigen Import bis in die Datenbank", async ({ page }) => {
    /*
     * ⛔ DIESER FALL IST PFLICHTBESTANDTEIL VON AUFGABE V18, NICHT NACHBESSERUNG
     * (`Spec:4881-4882` fuer die Flaeche, `Spec:4887-4888` fuer den ECHTEN Schreibvorgang).
     *
     * ⛔ ER IST DER EINZIGE WAECHTER UEBER **FALLE 1 UND FALLE 9** AN INSEL 4:
     * `Upload.Dragger` und `Typography.Text` sind Compound-Zugriffe, die Vorschautabelle
     * traegt zwei `render`-Funktionen. Aus einer Server Component ist beides HTTP 500 bzw.
     * ein Serialisierungsfehler BEIM ABRUF; in jsdom gibt es keine RSC-Grenze, und
     * `ImportAssistent.test.tsx` bliebe unter dieser Mutation gruen.
     *
     * ⛔ UND ER IST DER EINZIGE, DER DIE ZWEI SERVERWEGE ZUSAMMEN FAEHRT: den Route Handler
     * `POST /admin/import/hochladen` (Entscheidung **E-V16**) und die Server Action
     * `importSchreibenAction`. Ein Vitest-Fall kann das nicht — dort gibt es weder Middleware
     * noch Action-Grenze.
     *
     * ⛔ **FALLE 10 (`CLAUDE.md`) GILT HIER AB DER ERSTEN ZEILE**, und zwar fuer den ROUTE
     * HANDLER: `next dev`/Turbopack uebersetzt ihn beim ERSTEN Treffer; landet der eigentliche
     * POST in diesem Fenster, loest der HMR-Kanal einen vollen Reload aus und der Browser
     * bricht die laufende Anfrage ab — `net::ERR_ABORTED`, NIE eine Antwort, und der Test
     * laeuft mit einer Meldung ins Zeitbudget, die nach etwas ganz anderem klingt. Abhilfe:
     * ein WARMLAUF-GET auf dieselbe Route vor dem ersten echten POST.
     *
     * ⬜ **V18-L1, EIGENTUEMER V23:** dass Next auf ein GET gegen einen Handler, der nur
     * `POST` ausfuehrt, mit **405** antwortet, ist hier ANGENOMMEN und NICHT GEMESSEN — der
     * Playwright-Lauf faellt erst in V23. Liest V23 einen anderen Code ab, ist das KEIN
     * Fehler dieser Aufgabe, sondern der abzulesende Wert; die Zeile wird dann dort auf ihn
     * gestellt. ⛔ Der ZWECK des Warmlaufs haengt nicht an der Zahl: er ist die Uebersetzung
     * der Route, und dass ueberhaupt eine Antwort kommt, ist die Aussage.
     *
     * ⛔ UND DIE ZWEITE TESTREGEL AUS FALLE 10: wer eine Anfrage ausloest, PRUEFT IHRE
     * ANTWORT (`page.waitForResponse`), statt auf eine spaetere Zustandsaenderung zu warten —
     * sonst laeuft jede abgelehnte Antwort (404, 405, 413, abgebrochen) still ins Zeitbudget.
     *
     * ⚠️ ✅ ⬜ V13-L2 IST IN V23 GESCHLOSSEN (`playwright.config.ts:158`) — ER BRAUCHT DEN SEED
     * TROTZDEM NICHT: der Import LEGT AN und setzt keine Bestandszeile voraus.
     */
    await devLogin(page, { host: RADIO_HOST, groups: RADIO_ADMIN_GRUPPE });

    // Der Warmlauf — Falle 10. Die 405 ist die Antwort eines UEBERSETZTEN POST-Handlers.
    const warmlauf = await page.request.get(radioUrl("/admin/import/hochladen"));
    expect(
      warmlauf.status(),
      "⬜ V18-L1: der Hochladen-Handler antwortet nicht — der erste echte POST liefe in Falle 10",
    ).toBe(405);

    const antwort = await page.goto(radioUrl("/admin/import"));
    expect(antwort?.status(), "/admin/import auf dem radio-Host").toBe(200);
    await expect(
      page.locator('[data-rolle="radio-import"]'),
      "die Insel ist an der RSC-Grenze gebrochen (Falle 1 / Falle 9)",
    ).toHaveCount(1);
    await expect(page.locator('[data-rolle="radio-import"]')).toHaveAttribute(
      "data-schritt",
      "upload",
    );

    /*
     * ⛔ EINE ISSI, DIE KEIN SEED UND KEIN ANDERER FALL DIESER DATEI FUEHRT — der Import muss
     * ANLEGEN koennen, und ein Zusammenstoss mit einem Bestand aus einem frueheren Lauf
     * machte aus `created` ein `unchanged`, ohne dass etwas rot wuerde.
     */
    const issi = `9${Date.now().toString().slice(-6)}`;
    const csv = `ISSI;Rufname\n${issi};V18-Probe\n`;

    /*
     * ⛔ DER PFAD WIRD VERANKERT UND NICHT MIT `includes` GESUCHT: `/admin/import` ist ein
     * ECHTES PRAEFIX von `/admin/import/hochladen`, und die zwei Server-Action-Wartestellen
     * weiter unten haengen an eben jenem `/admin/import`. Ein `includes` liesse die
     * Reihenfolge der Aufrufe darueber entscheiden, welche Antwort welcher Wartestelle
     * zufaellt — heute richtig, morgen still falsch.
     */
    const hochgeladen = page.waitForResponse(
      (a) => new URL(a.url()).pathname === "/admin/import/hochladen" && a.request().method() === "POST",
    );
    await page.locator('input[type="file"]').setInputFiles({
      name: "v18-probe.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf8"),
    });
    const hochladeAntwort = await hochgeladen;
    expect(hochladeAntwort.status(), "der Dateischritt wurde abgewiesen").toBe(200);
    expect(
      (await hochladeAntwort.json()).ok,
      "der Handler konnte die CSV nicht lesen",
    ).toBe(true);

    await expect(page.locator('[data-rolle="radio-import"]')).toHaveAttribute(
      "data-schritt",
      "mapping",
    );
    /* Die Kopfzeile „ISSI" trifft die Synonymtabelle — der Uebergang ist damit offen. */
    await expect(page.locator('[data-rolle="radio-import-hinweis"]')).toHaveText(
      "ISSI ist zugeordnet.",
    );

    /*
     * ⛔ DER PROBELAUF — `importSchreibenAction(..., true)`. Er ist eine Server Action und
     * damit ein POST auf DIESE Seite; `page.waitForResponse` haengt deshalb am Seitenpfad und
     * nicht am Handlerpfad.
     */
    const probelauf = page.waitForResponse(
      (a) => new URL(a.url()).pathname === "/admin/import" && a.request().method() === "POST",
    );
    await page.locator('[data-rolle="radio-import-weiter"]').click();
    expect((await probelauf).status(), "der Probelauf wurde abgewiesen").toBe(200);

    await expect(page.locator('[data-rolle="radio-import"]')).toHaveAttribute(
      "data-schritt",
      "preview",
    );
    await expect(
      page.locator('[data-rolle="radio-import-kennzahl"]'),
      "fuenf Klassen, nicht drei (Entscheidung in V9)",
    ).toHaveCount(5);

    const schreiblauf = page.waitForResponse(
      (a) => new URL(a.url()).pathname === "/admin/import" && a.request().method() === "POST",
    );
    await page.locator('[data-rolle="radio-import-ausfuehren"]').click();
    expect((await schreiblauf).status(), "der Schreiblauf wurde abgewiesen").toBe(200);

    await expect(page.locator('[data-rolle="radio-import-fertig"]')).toContainText(
      "Import abgeschlossen",
    );
    await expect(page.locator('[data-rolle="radio-import-bilanz"]')).toContainText("Neu: 1");

    /*
     * ⛔ DIE ZEILE STEHT WIRKLICH IN DER DATENBANK — und das ist die Haelfte, die kein
     * Vitest-Fall haben kann. Ohne sie bewiese der Abschnitt oben nur, dass der Assistent
     * seinen vierten Schritt zeigt.
     */
    const liste = await page.goto(radioUrl(`/admin/geraete?q=${issi}`));
    expect(liste?.status(), "die Geraeteliste nach dem Import").toBe(200);
    /*
     * ⛔ AUF DIE DATENZEILE GEGRIFFEN, NICHT AUF `table`: antd rendert bei gesetztem `scroll`
     * Kopf und Rumpf als ZWEI `<table>`-Elemente, und Playwrights strict mode faellt ueber
     * einen Griff, der zwei Knoten trifft. Dieselbe Form wie Fall 2
     * (`table tbody tr.ant-table-row`), dort mit derselben Begruendung fuer den
     * `.ant-table-placeholder`-Ausschluss.
     */
    await expect(
      page.locator("table tbody tr.ant-table-row").filter({ hasText: issi }),
      "das importierte Geraet steht nicht in der Liste",
    ).toHaveCount(1);
  });
  test("Fall 8: /admin/versionen zeigt die Tabelle und legt eine Version wirklich an", async ({
    page,
  }) => {
    /*
     * ⛔ DIESER FALL IST PFLICHTBESTANDTEIL VON AUFGABE V19, NICHT NACHBESSERUNG
     * (`Spec:4881-4882` fuer die Flaeche, `Spec:4887-4888` fuer den ECHTEN Schreibvorgang).
     *
     * ⛔ ER IST DER EINZIGE WAECHTER UEBER **FALLE 1 UND FALLE 9** AN INSEL 3: `Space.Compact`
     * ist ein Compound-Zugriff, und die Tabelle traegt vier `render`-Funktionen
     * (`SoftwareVersionsPage.tsx:89`, `:110`, `:116`, `:139`). Aus einer Server Component ist
     * das erste HTTP 500 und das zweite `Functions cannot be passed directly to Client
     * Components` — BEIM ABRUF. In jsdom gibt es keine RSC-Grenze, und
     * `VersionenTabelle.test.tsx` bliebe unter dieser Mutation gruen.
     *
     * ⛔ UND ER IST DER ERSTE ECHTE ABRUF EINER SEITE AUF DER **ADMIN-STUFE**
     * (`Spec:4376`). Der Quelltext-Scan in `admin/actions.test.ts` sagt, dass die Zeile
     * DASTEHT; dass sie GREIFT, ist ⬜ **V-L3** und wird hier gemessen — der Abruf laeuft mit
     * der Admin-Gruppe wie jeder Fall dieser Datei. ⛔ Dass eine UPDATER-Person hier 404 bekaeme,
     * misst „V-L3 D" unten (`clearCookies` und zweite Anmeldung), seit dem 2026-08-26.
     *
     * ⛔ DER WARMLAUF IST DER `page.goto` SELBST — Falle 10 (`CLAUDE.md`): `next dev`
     * uebersetzt die Route beim ERSTEN Treffer. Anders als in Fall 7 gibt es hier keinen
     * eigenen Route Handler; die Server Action postet auf DIESELBE Adresse, die der Abruf
     * gerade uebersetzt hat. ⛔ UND DIE ZWEITE TESTREGEL AUS FALLE 10 GILT UNVERAENDERT: wer
     * eine Anfrage ausloest, PRUEFT IHRE ANTWORT (`page.waitForResponse`), statt auf eine
     * spaetere Zustandsaenderung zu warten.
     *
     * ⚠️ ✅ ⬜ V13-L2 IST IN V23 GESCHLOSSEN (`playwright.config.ts:158`) — ER BRAUCHT DEN SEED
     * TROTZDEM NICHT: das Anlegen LEGT AN, wie der Import auf `/admin/import`.
     */
    await devLogin(page, { host: RADIO_HOST, groups: RADIO_ADMIN_GRUPPE });

    const antwort = await page.goto(radioUrl("/admin/versionen"));
    expect(antwort?.status(), "/admin/versionen auf dem radio-Host").toBe(200);
    await expect(
      page.locator('[data-rolle="radio-versionen-flaeche"]'),
      "die Insel ist an der RSC-Grenze gebrochen (Falle 1 / Falle 9)",
    ).toHaveCount(1);

    /*
     * ⛔ DIE FUENF SPALTENUEBERSCHRIFTEN SIND DIE 1:1-SPALTENPFLICHT
     * (`SoftwareVersionsPage.tsx:84-175`), ⛔ **NICHT der Falle-9-Beleg** — und diese
     * Unterscheidung ist gemessen, nicht formal: Ueberschriften entstehen aus `title` und
     * nicht aus `render`; sie stuenden auch ueber einer leeren Tabelle.
     *
     * ⚠️ HIER STAND BIS ZUM 2026-08-26 „ohne Seed (⬜ V13-L2) steht hier KEINE Zeile, also ist
     * noch keine `render`-Funktion gelaufen" — ✅ V23 hat den Seed gezogen, und er legt DREI
     * Softwareversionen an (`_lib/seedLokal.ts:117-128`). ⛔ DER BEWEIS FUER FALLE 1 UND FALLE 9
     * STEHT DAVON UNBERUEHRT ZWEI ZUSICHERUNGEN WEITER OBEN: eine ueber die RSC-Grenze
     * gereichte `render`-Funktion wirft BEIM ABRUF, die Seite antwortete also gar nicht erst
     * mit 200 (`expect(antwort?.status()).toBe(200)`), und ein Compound-Zugriff ist HTTP 500.
     *
     * ⛔ AUF `thead th` GEGRIFFEN, NICHT AUF `table`: antd rendert bei gesetztem `scroll` Kopf
     * und Rumpf als ZWEI `<table>`-Elemente, und Playwrights strict mode faellt ueber einen
     * Griff, der zwei Knoten trifft (dieselbe Begruendung wie in Fall 2 und Fall 7).
     */
    await expect(page.locator("thead th")).toHaveText([
      "Version",
      "Geräte",
      "Angelegt",
      "Reihenfolge",
      "Aktionen",
    ]);

    /*
     * ⛔ DER ERKLAERENDE HINWEIS STEHT WOERTLICH DA (`SoftwareVersionsPage.tsx:185`,
     * 1:1-Tafel Abschnitt E). Er ist die einzige Stelle, an der die Flaeche sagt, dass eine
     * neu angelegte Version NICHT automatisch zum Ziel wird — und der Schreibvorgang darunter
     * ist genau der Fall, in dem jemand das Gegenteil erwartet.
     */
    await expect(page.locator('[data-rolle="radio-versionen-hinweis"]')).toContainText(
      "Neu angelegte Versionen werden nicht automatisch zum Ziel",
    );

    /*
     * ⛔ EIN WERT, DEN KEIN SEED UND KEIN ANDERER FALL DIESER DATEI FUEHRT — `value` traegt
     * einen Unique-Index (`_db/schema.ts`), und ein Zusammenstoss mit einem Bestand aus einem
     * frueheren Lauf machte aus „angelegt" ein „Diese Version existiert bereits", ohne dass
     * etwas rot wuerde.
     */
    const wert = `E2E FW ${Date.now()}`;
    await page.locator('[data-rolle="radio-neuversion-eingabe"]').fill(wert);

    /*
     * ⛔ GEWARTET WIRD AUF DIE ANTWORT DER SERVER ACTION. Sie postet auf die Adresse DIESER
     * Seite; deshalb haengt die Wartestelle am Seitenpfad und nicht an einem Handlerpfad —
     * dieselbe Bauform wie in Fall 3 und im Probelauf von Fall 7.
     */
    const angelegt = page.waitForResponse(
      (a) => new URL(a.url()).pathname === "/admin/versionen" && a.request().method() === "POST",
    );
    await page.locator('[data-rolle="radio-neuversion-anlegen"]').click();
    expect((await angelegt).status(), "das Anlegen wurde abgewiesen").toBe(200);

    await expect(
      page.locator('[data-rolle="radio-neuversion-fehler"]'),
      "das Anlegefeld meldet einen Fehler statt anzulegen",
    ).toHaveCount(0);

    /*
     * ⛔ DIE ZEILE STEHT WIRKLICH IN DER DATENBANK — und das ist die Haelfte, die kein
     * Vitest-Fall haben kann. ⛔ NACH EINEM ECHTEN NEULADEN, nicht am Bildschirmzustand: nur
     * so ist gemessen, was `versionAnlegenAction` geschrieben hat und was
     * `versionenMitGeraetezahl` zurueckliest.
     */
    await page.reload();
    const neueZeile = page.locator("table tbody tr.ant-table-row").filter({ hasText: wert });
    await expect(neueZeile, "die angelegte Version steht nicht in der Liste").toHaveCount(1);

    /*
     * ⛔ UND SIE IST NICHT ZUM ZIEL GEWORDEN (`_db/schema.ts:80-82`, `admin/actions.ts`,
     * `versionAnlegenAction`; der Hinweistext oben sagt es dem Bedienenden). Waere sie es,
     * haette ein blosses Anlegen den Update-Stand JEDES Geraets umgestellt — genau der
     * Schaden, gegen den die Zeile steht.
     */
    await expect(
      neueZeile.locator('[data-rolle="radio-version-zielmarke"]'),
      "eine neu angelegte Version wurde automatisch zum Ziel",
    ).toHaveCount(0);
    await expect(
      neueZeile.locator('[data-rolle="radio-version-alsziel"]'),
      "die Zeile bietet den Knopf Als Ziel nicht an",
    ).toHaveCount(1);
  });

  test("Fall 9: /admin/zugaenge zeigt die Zugangsliste", async ({ page }) => {
    /*
     * ⛔ DIESER FALL IST PFLICHTBESTANDTEIL VON AUFGABE V20, NICHT NACHBESSERUNG
     * (`Spec:4881-4882`, dieselbe Bauform wie Fall 5; der Auftragsbrief nennt ihn namentlich,
     * `.superpowers/sdd/planteil4/briefs/V20.md:59`).
     *
     * ⛔ ER IST DER EINZIGE WAECHTER UEBER **FALLE 9** AN INSEL 8: die Tabelle traegt fuenf
     * `render`-Funktionen. Aus einer Server Component ist das `Functions cannot be passed
     * directly to Client Components` — BEIM ABRUF. In jsdom gibt es keine RSC-Grenze, und
     * `CodeTabelle.test.tsx` bliebe unter dieser Mutation gruen.
     *
     * ⛔ UND ER IST DER ZWEITE ECHTE ABRUF EINER SEITE AUF DER **ADMIN-STUFE**
     * (`Spec:4377`) — der schaerfste der drei, weil diese Seite jeden Zugangscode im Klartext
     * zeigt (`Spec:2180-2182`, `Spec:2249-2250`). Der Quelltext-Scan in `admin/actions.test.ts`
     * sagt, dass die Zeile DASTEHT; dass sie GREIFT, ist ⬜ **V-L3** und wird hier gemessen —
     * der Abruf laeuft mit der Admin-Gruppe wie jeder Fall dieser Datei. ⚠️ Dass eine
     * UPDATER-Person hier 404 bekaeme, misst dieser Fall NICHT; dafuer braeuchte er eine
     * zweite Anmeldung.
     *
     * ⛔ **ER LEGT KEINEN ZUGANG AN, UND DAS IST EINE BEGRUENDETE ABWEICHUNG VON FALL 8.** Dort
     * schreibt der Fall wirklich (`Spec:4887-4888`). ⛔ HIER GINGE DAS NICHT ZURUECK: aus
     * `zugangscodes` wird NIEMALS geloescht (NS-A6, `Spec:2204-2221`, `_actions/codes.ts:20-52`)
     * — jeder Lauf hinterliesse dauerhaft eine Zeile, und nach dem Cutover stuenden sie in der
     * Liste des Betreibers. Der Auftragsbrief verlangt genau das nicht: „200 mit sichtbarer
     * Tabelle" (`.superpowers/sdd/planteil4/briefs/V20.md:59`).
     *
     * ⛔ DER FALLE-9-BEWEIS HAENGT NICHT AM BESTAND DER TABELLE (⚠️ hier stand bis zum 2026-08-26
     * „dass sie leer ist", ⬜ V13-L2 — der Seed aus V23 legt ZWEI Zugangszeilen an,
     * `_lib/seedLokal.ts:187-197`). Ueberschriften entstehen aus `title`, nicht aus `render` —
     * der Beweis ist der Status 200 selbst: eine ueber die RSC-Grenze gereichte `render`-Funktion
     * wirft BEIM ABRUF, die Seite antwortete gar nicht erst mit 200. Wie in Fall 8 (Versionen).
     *
     * ⛔ DER WARMLAUF IST DER `page.goto` SELBST — Falle 10 (`CLAUDE.md`). Diese Seite loest
     * ohne Griff keine Anfrage aus; es gibt hier nichts, worauf `page.waitForResponse` warten
     * muesste.
     */
    await devLogin(page, { host: RADIO_HOST, groups: RADIO_ADMIN_GRUPPE });

    const antwort = await page.goto(radioUrl("/admin/zugaenge"));
    expect(antwort?.status(), "/admin/zugaenge auf dem radio-Host").toBe(200);
    await expect(
      page.locator('[data-rolle="radio-zugaenge-flaeche"]'),
      "die Insel ist an der RSC-Grenze gebrochen (Falle 9)",
    ).toHaveCount(1);

    /*
     * ⛔ AUF `thead th` GEGRIFFEN, NICHT AUF `table`: antd rendert bei gesetztem `scroll` Kopf
     * und Rumpf als ZWEI `<table>`-Elemente, und Playwrights strict mode faellt ueber einen
     * Griff, der zwei Knoten trifft (dieselbe Begruendung wie in den Faellen 2, 7 und 8).
     */
    await expect(page.locator("thead th")).toHaveText([
      "Bezeichnung",
      "Code",
      "Zustand",
      "Zuletzt benutzt",
      "Aktionen",
    ]);

    /*
     * ⛔ DAS ANLEGEFELD GEHOERT ZUR SELBEN INSEL und ist der einzige Teil der Flaeche, den ein
     * leerer Bestand sichtbar laesst — ohne es bewiese der Fall nur, dass ein `<div>` da ist.
     */
    await expect(page.locator('[data-rolle="radio-neucode-eingabe"]')).toHaveCount(1);

    /*
     * ⛔ DER HINWEIS ERKLAERT DEN FEHLENDEN LOESCHKNOPF (NS-A6). Er ist die einzige Stelle, an
     * der die Flaeche sagt, dass Sperren der einzige Widerruf ist — ohne ihn sucht eine
     * bedienende Person nach einer Loeschung, die es absichtlich nicht gibt.
     */
    await expect(page.locator('[data-rolle="radio-zugaenge-hinweis"]')).toContainText(
      "sperren ist der einzige Widerruf",
    );
  });

  test("Fall 5a: /admin/zugaenge/blatt druckt OHNE Kopfzeile und OHNE Navigationsleiste", async ({
    page,
  }) => {
    /*
     * ⛔ DIESER FALL IST PFLICHTBESTANDTEIL VON AUFGABE V21, NICHT NACHBESSERUNG
     * (`Spec:4883-4885`, Fall 5a, woertlich): „das ist die einzige Pruefung, die die
     * Route-Group `(druck)` von `(arbeit)` unterscheidet; ohne sie druckt das Blatt still
     * mit Suite-Kopfzeile und `controlHeight: 44`."
     *
     * ⛔ ER PRUEFT DIE ABWESENHEIT ZWEIER ELEMENTE — nicht die Anwesenheit des Blatts
     * (`.superpowers/sdd/planteil4/briefs/V21.md:58-59`). Was auf dem Papier steht, misst
     * `blatt/page.test.tsx`; was NICHT darauf steht, kann nur ein echter Abruf sagen.
     *
     * ⛔ DIE KONTROLLE STEHT VORNE, UND DAS IST KEINE REIHENFOLGE-KOSMETIK:
     * `toHaveCount(0)` geht auch dann durch, wenn es den Anker gar nicht gibt — die Lehre
     * steht ausgeschrieben in `e2e/lagerbuch-checklisten.spec.ts:112-123` („DIE KONTROLLE
     * ZUR VORIGEN ZEILE, und ohne sie waere jene ein NO-OP"). ⛔ STUENDE SIE HINTEN, killte
     * eine fehlschlagende Abwesenheitszusage sie mit, und der Lauf saegte nichts ueber den
     * Anker — dieselbe Ueberlegung, die Fall 4a zu einem eigenen `test()` gemacht hat.
     *
     * ⛔ DIE ANKER SIND SUITE-ANKER, KEINE MODULANKER: `suite-header` sitzt am `<Header>`
     * (`src/core/shell/SuiteHeader.tsx:75`), `modulleiste` an der `<nav>`
     * (`src/core/shell/Modulleiste.tsx:31`). Beide entstehen im `SuiteRahmen`
     * (`src/core/shell/SuiteRahmen.tsx:49-61`), den das `(arbeit)`-Layout ueber
     * `RadioVerwaltungsRahmen` zieht und das `(druck)`-Layout bewusst NICHT
     * (`admin/(druck)/layout.tsx:10-12`).
     *
     * ⛔ UND `minHeight: 100vh` IST DER ZWEITE HALBSATZ DES SCHADENS
     * (`src/core/shell/SuiteRahmen.tsx:50`): mit Shell erzeugte er leere Folgeseiten hinter
     * dem Bogen (`lagerbuch/verwaltung/(druck)/layout.tsx:10-12`). Der Anker dafuer ist
     * derselbe — ohne Kopfzeile gibt es keinen `Layout`-Rahmen, der ihn setzt.
     *
     * ⛔ DER WARMLAUF IST DER `page.goto` SELBST — Falle 10 (`CLAUDE.md`). Diese Seite loest
     * ohne Griff keine Anfrage aus.
     */
    await devLogin(page, { host: RADIO_HOST, groups: RADIO_ADMIN_GRUPPE });

    // DIE KONTROLLE: auf einer (arbeit)-Seite sind beide Anker da. Ohne sie waeren die drei
    // Zusicherungen darunter drei NO-OPs.
    const kontrolle = await page.goto(radioUrl("/admin/zugaenge"));
    expect(kontrolle?.status(), "/admin/zugaenge auf dem radio-Host").toBe(200);
    await expect(
      page.getByTestId("suite-header"),
      "der Kopfzeilen-Anker existiert nicht mehr — die Abwesenheitszusagen waeren blind",
    ).toHaveCount(1);
    await expect(
      page.getByTestId("modulleiste"),
      "der Navigations-Anker existiert nicht mehr — die Abwesenheitszusagen waeren blind",
    ).toHaveCount(1);

    const antwort = await page.goto(radioUrl("/admin/zugaenge/blatt"));
    expect(antwort?.status(), "/admin/zugaenge/blatt auf dem radio-Host").toBe(200);
    await expect(
      page.getByTestId("suite-header"),
      "das Blatt druckt mit Suite-Kopfzeile (Spec:4883-4885)",
    ).toHaveCount(0);
    await expect(
      page.getByTestId("modulleiste"),
      "das Blatt druckt mit Navigationsleiste (Spec:4883-4885)",
    ).toHaveCount(0);

    /*
     * ⛔ DER DRITTE GRIFF BELEGT, DASS DIE ABWESENHEIT VON DER SEITE KOMMT UND NICHT VON
     * EINER 404 MIT STATUS 200: ohne ihn bestuenden die zwei Zusicherungen oben auch ueber
     * einer leeren Antwort.
     */
    await expect(
      page.locator('[data-rolle="radio-blatt"]'),
      "der Bogen selbst fehlt — die zwei Abwesenheitszusagen messen dann nichts",
    ).toHaveCount(1);
  });

  test("das Druckblatt riegelt die Verwaltungsstufe ab", async ({ page }) => {
    /*
     * ⛔ ⬜ **V-L14 / T-L3 — DIE UEBERNAHME EINES FREMDEN POSTENS, UND DAS STEHT HIER, STATT
     * VERSCHWIEGEN ZU WERDEN.** Eigentuemer war laut `src/app/m/radio/riegel.test.ts:81-87`
     * „die Schlusspruefung von Planteil 4"; sie hat ihn nicht abgelesen. Planteil 5 uebernimmt
     * ihn AUSDRUECKLICH, statt ihn weiterzureichen — er gehoert in die e2e-Flaeche, und die
     * entsteht hier.
     *
     * ⛔ WAS BIS HEUTE FEHLTE: fuer `admin/(druck)` gab es keine Wirkprobe des PERSONEN-Riegels.
     * Die einzige Messung dort war Fall 5a („das Blatt druckt ohne Kopfzeile und ohne
     * Navigationsleiste") — und die betrifft die HUELLE, nicht die STUFE. Ein Blatt mit den
     * Zugangscodes IM KLARTEXT (`admin/(druck)/layout.tsx:14-21`) haette damit auf der
     * Verwaltungsstufe offenstehen koennen, ohne dass ein Tor rot wird.
     *
     * ⛔ DIE ZWEITE HAELFTE TRAEGT DEN FALL, wie bei „V-L3 D": ohne sie ist der 404 oben
     * mehrdeutig — er saehe genauso aus, wenn die Seite gar nicht existierte, wenn der
     * Host-Riegel griffe oder wenn die Updater-Gruppe im Serverprozess unbekannt waere
     * (⬜ V-L1 / Vorabscan-Fund F24: ein fehlender `SUITE_UPDATER_GROUP_RADIO` SCHLIESST die
     * Stufe). Erst „mit Admin 200, mit Updater 404, auf derselben Adresse" benennt die STUFE
     * als Ursache.
     *
     * ⚠️ ZWEI ANMELDUNGEN IN EINEM FALL, mit `clearCookies()` dazwischen — beides aus
     * demselben gemessenen Grund wie in „V-L3 D": zwei getrennte `test()` liessen eine
     * Haelfte still ausfallen, und ohne `clearCookies()` leitet `/login` eine bereits
     * angemeldete Person sofort weiter, das E-Mail-Feld erscheint nie und `devLogin` laeuft in
     * die vollen 90 s.
     *
     * ⛔ DIE AEUSSERE ADRESSFORM `/admin/zugaenge/blatt`, nie `/m/radio/admin/…` und nie mit
     * der Route-Group im Pfad: `(druck)` ist ein Dateiname-Klammerausdruck und steht in keiner
     * URL. Dieselbe Adresse fuehrt Fall 5a.
     */
    await devLogin(page, { host: RADIO_HOST, groups: RADIO_UPDATER_GRUPPE });
    const alsUpdater = await page.request.get(radioUrl("/admin/zugaenge/blatt"));
    expect(
      alsUpdater.status(),
      "das Druckblatt ist fuer die Updater-Stufe offen — die Zugangscodes stehen darauf im Klartext",
    ).toBe(404);

    await page.context().clearCookies();
    await devLogin(page, { host: RADIO_HOST, groups: RADIO_ADMIN_GRUPPE });
    const alsAdmin = await page.request.get(radioUrl("/admin/zugaenge/blatt"));
    expect(
      alsAdmin.status(),
      "das Druckblatt antwortet auch der Admin-Stufe nicht — der 404 oben misst dann nichts",
    ).toBe(200);
  });

  test("Fall 6: /admin/geraete/export liefert text/csv und beginnt mit dem BOM", async ({
    page,
  }) => {
    /*
     * ⛔ DIESER FALL IST PFLICHTBESTANDTEIL VON AUFGABE V22, NICHT NACHBESSERUNG
     * (`Spec:4886`, Fall 6; `.superpowers/sdd/planteil4/briefs/V22.md:67-68`).
     *
     * ⚠️ ZWEI FALL-NUMMERIERUNGEN LAUFEN IN DIESER DATEI NEBENEINANDER, und das steht hier,
     * statt zu verwirren: die Spec zaehlt elf Faelle und fuehrt den Export als **6**
     * (`Spec:4886`), waehrend diese Datei den Spec-Fall 5 („fuenf Seiten je 200") in die
     * Faelle 5 bis 9 aufgeteilt hat — je einer pro Seite, angelegt von V16 bis V20. Der
     * Name „Fall 6" ist deshalb ZWEIMAL vergeben; die tragende Adressierung ist der PFAD im
     * Titel, nicht die Nummer. Dieselbe bewusst stehen gelassene Doppelzaehlung wie in
     * Ruling **R-V11-2** (`.superpowers/sdd/planteil4/progress.md`), und aus demselben
     * Grund: vier Faelle umzunummerieren waere Aufwand ohne Zugewinn und eine neue
     * Fehlerquelle.
     *
     * ⛔ ER IST DER EINZIGE ECHTE ABRUF EINES ROUTE HANDLERS DIESES ZWEIGS. Was Vitest an
     * ihm strukturell nicht sehen kann, ist das Zusammenspiel mit Next selbst: ob die
     * Antwort ueberhaupt AUSGELIEFERT wird, wie sie hier gebaut ist — eine
     * vorgerenderte Route lieferte den Bestand des Bauzeitpunkts, und `route.ts`s
     * `export const dynamic = "force-dynamic"` ist der Riegel dagegen.
     *
     * ⛔ WARMLAUF-GET VOR DEM ECHTEN ABRUF (Falle 10, `CLAUDE.md`): `next dev` uebersetzt
     * einen Route Handler beim ERSTEN Treffer. Der erste Aufruf hier tut nichts weiter, als
     * dieses Fenster zu verbrauchen; gemessen wird der zweite.
     *
     * ⛔ DAS BOM WIRD ALS BYTEFOLGE GEPRUEFT, NICHT ALS TEXT. Playwrights `text()` dekodiert
     * mit eingeschaltetem BOM-Schnitt — der Fall pruefte dann seine eigene Dekodierung
     * statt der Antwort, und das ist die Familie der Testfallen 10 bis 12: ein Test, der
     * etwas anderes misst, als sein Name sagt.
     *
     * ⚠️ HIER STAND BIS ZUM 2026-08-26 „dass die Liste leer ist, schwaecht den Fall nicht
     * (⬜ V13-L2)". ✅ **Die Liste ist nicht mehr leer** — V23 hat `scripts/seed-lokal.ts
     * radio` in `webServer.command` gezogen. An der Aussage aendert das nichts: Kopfzeile und
     * BOM entstehen unabhaengig vom Bestand (`_lib/csv/spalten.ts:296-306`), und die Zeilen
     * selbst misst `route.test.ts`. Der Satz steht hier nur richtiggestellt, damit der
     * naechste Leser den Fall nicht fuer schwaecher haelt, als er ist.
     */
    await devLogin(page, { host: RADIO_HOST, groups: RADIO_ADMIN_GRUPPE });

    // DER WARMLAUF — seine Antwort wird bewusst nicht gemessen (Falle 10).
    await page.request.get(radioUrl("/admin/geraete/export"));

    const antwort = await page.request.get(radioUrl("/admin/geraete/export"));
    expect(antwort.status(), "/admin/geraete/export auf dem radio-Host").toBe(200);
    expect(
      antwort.headers()["content-type"],
      "ohne charset oeffnet deutsches Excel die Datei in seiner Systemkodierung",
    ).toBe("text/csv; charset=utf-8");
    expect(
      antwort.headers()["content-disposition"],
      "ohne Dateinamen speichert der Browser sie als `export` ohne Endung",
    ).toBe('attachment; filename="funkgeraete-export.csv"');

    const bytes = await antwort.body();
    expect(
      [bytes[0], bytes[1], bytes[2]],
      "das fuehrende UTF-8-BOM fehlt (Spec:4886)",
    ).toEqual([0xef, 0xbb, 0xbf]);
  });
  test("Fall 8: /m/radio/admin antwortet auf einem fremden Suite-Host mit 404", async ({ page }) => {
    /*
     * ⛔ DIESER FALL IST PFLICHTBESTANDTEIL VON AUFGABE V23, NICHT NACHBESSERUNG
     * (`Spec:4887-4891`, Fall 8; `.superpowers/sdd/planteil4/briefs/V23.md`, Zeile „Fall 8").
     *
     * ⛔ ER IST EIN GRUENER FALL UND KEIN `test.skip`. ⬜ V-L4 („erfordert einen zweiten
     * `baseURL`") ist am 2026-08-24 durch Messung gestrichen: das Repo faehrt genau diesen
     * Fall heute schon ueber eine ABSOLUTE URL mit demselben EINEN `baseURL`
     * (`e2e/lagerbuch-hosts.spec.ts:151-152`, `e2e/helpers/lagerbuch.ts:94`). Damit ist auch
     * `Spec:4889-4891` („nicht pruefbar") ueberholt — benannte Abweichung, gemessen.
     *
     * ⛔ DIE ANMELDUNG MIT DER RADIO-GRUPPE IST DIE VORAUSSETZUNG, DIE DEN FALL ERST
     * TRAGFAEHIG MACHT (woertlich `e2e/lagerbuch-hosts.spec.ts:145-149`): „sonst waere der 404
     * der GRUPPENRIEGEL und nicht der HOSTRIEGEL, und der Test bewiese das Falsche".
     * `AUTH_COOKIE_DOMAIN=".localtest.me"` (`playwright.config.ts`, `webServer.env`) traegt
     * die Sitzung vom `radio`-Host auf den fremden mit.
     *
     * ⛔ DER AEUSSERE PFAD IST `/m/radio/admin`, NICHT `/admin`. Auf dem fremden Host gibt es
     * keinen Modul-Rewrite; erreichbar ist die Flaeche dort nur ueber die suiteweite
     * Segmentform — und genau sie ist die Luecke, gegen die der Host-Riegel steht
     * (`core/routing.ts:68-76` gatet nach dem SEGMENT, nicht nach dem Host; ausgeschrieben in
     * `admin/(arbeit)/layout.tsx:20-24`).
     *
     * ⛔ DIE GEGENPROBE AUF DEM EIGENEN HOST STEHT DANEBEN, und ohne sie unterschiede der Fall
     * „404 weil der Riegel griff" nicht von „404 weil an der Adresse gar nichts liegt"
     * (Review-Befund 1 zu `e2e/lagerbuch-hosts.spec.ts:122-131`). Sie geht ueber DENSELBEN
     * aeusseren Pfad, nicht ueber `/admin`. ⛔ UND SIE PRUEFT DIE GLATTE 200 STATT `not.toBe(404)`:
     * ein 500 (Ausnahme im Layout) bestuende die weite Form — gemessen 2026-08-26, Sonde S-F1.
     *
     * `page.request` und nicht `page.goto`: derselbe Cookie-Kontext, der Statuscode direkt,
     * und kein `net::ERR_ABORTED` (dieselbe Begruendung wie `lagerbuch-hosts.spec.ts:133-139`).
     */
    await devLogin(page, { host: RADIO_HOST, groups: RADIO_ADMIN_GRUPPE });

    const fremd = await page.request.get(fremdUrl("/m/radio/admin"));
    expect(fremd.status(), `/m/radio/admin auf ${FREMDER_HOST}`).toBe(404);

    const eigen = await page.request.get(radioUrl("/m/radio/admin"));
    expect(
      eigen.status(),
      `/m/radio/admin auf ${RADIO_HOST} — ohne diese Zeile misst der 404 oben nichts`,
    ).toBe(200);
  });

  /*
   * ⬜ V-L3 — DIE VIER WIRKPROBEN DES VERWALTUNGSRIEGELS (`briefs/V23.md`, Schritte A bis D;
   * Ablageort der Antwort: der Kopfkommentar von `src/app/m/radio/riegel.test.ts`).
   *
   * ⛔ SIE SIND DER EIGENTLICHE ZWECK DIESER AUFGABE. `riegel.test.ts` ist ein
   * QUELLTEXT-Scan; er belegt eine Bauform, nicht eine Wirkung. Ob ein Riegel bei einem
   * ECHTEN Abruf greift, kann nur ein laufender Server sagen — und bis diese vier Faelle
   * existierten, sagte es niemand.
   *
   * ⛔ SIE BLEIBEN ALS DAUERFAELLE STEHEN UND SIND KEINE EINMALIGE ABLESUNG. Fuer D ist das
   * die tragende Auflage: `riegel.test.ts`s Klausel (a)/(e) lassen im `(arbeit)`-Zweig
   * `requireRadioAdmin(` UND `requireRadioVerwaltung(` zu, sie faengt eine faelschlich
   * ABGESENKTE Seite also strukturell nicht (`KONTEXT.md`, Nachtrag Planteil 4). Die
   * namentliche Zusicherung in `riegel.test.ts` haelt den QUELLTEXT der drei
   * Admin-Stufen-Seiten; Fall D haelt ihre WIRKUNG.
   */

  test("V-L3 A: /admin ohne Sitzung leitet auf den Suite-Login mit callbackUrl", async ({
    page,
  }) => {
    /*
     * ⛔ KEIN `devLogin` — DAS IST DER FALL. Ein anonymer Aufruf trifft
     * `_lib/zugang.ts:464`: `redirect(/login?callbackUrl=<absolutes Ziel>)`.
     *
     * ⛔ `maxRedirects: 0`, WEIL DIE ZUSAGE DER `Location`-KOPF IST UND NICHT DAS ENDZIEL.
     * Mit gefolgtem Umweg landete die Anfrage auf der Anmeldeseite, und die antwortet mit
     * 200 — der Fall bliebe dann auch dann gruen, wenn `/admin` selbst eine Anmeldemaske
     * rendern wuerde statt weiterzuleiten.
     *
     * ⛔ DER STATUSCODE STEHT ALS MENGE UND NICHT ALS ZAHL, und das ist die Auflage aus
     * ⬜ L7 (`_lib/zugang.ts:332-336`, woertlich): „`redirect()` waehlt den Code zur
     * Laufzeit; ein hier festgeschriebenes ‚302' waere eine Zusage ueber eine Bauform, die
     * Spec 1 nicht festlegt." Abgelesen wird er beim Cutover
     * (`docs/superpowers/plans/2026-08-18-plan4-radio-cutover.md:2091`), nicht hier.
     */
    const antwort = await page.request.get(radioUrl("/admin"), { maxRedirects: 0 });
    expect(
      [301, 302, 303, 307, 308],
      `/admin ohne Sitzung antwortete mit ${antwort.status()} statt einer Weiterleitung`,
    ).toContain(antwort.status());
    expect(
      antwort.headers()["location"],
      "die Weiterleitung fuehrt nicht auf den Suite-Login mit callbackUrl",
    ).toMatch(/^\/login\?callbackUrl=/);
    /*
     * ⛔ UND DAS ZIEL DER `callbackUrl` IST DER RADIO-HOST, NICHT DER ANMELDE-HOST: ein
     * relatives Ziel loeste sich gegen `/login` auf und schickte die angemeldete Person auf
     * die falsche Domain zurueck (`_lib/zugang.ts:310-315`).
     */
    expect(
      decodeURIComponent(antwort.headers()["location"] ?? ""),
      "die callbackUrl zeigt nicht absolut auf den radio-Host",
    ).toContain(`http://${RADIO_HOST}:`);
  });

  test("V-L3 B: /admin mit Sitzung, aber ohne beide Gruppen, antwortet 404 — nicht 403", async ({
    page,
  }) => {
    /*
     * ⛔ 404 UND NICHT 403 IST DIE ZUSAGE, NICHT IHRE NEBENSACHE (`Spec:691-694`, §1.5;
     * `_lib/zugang.ts:366-370`): was nicht freigegeben ist, sieht in dieser Suite aus wie
     * nicht vorhanden. Ein 403 verriete die Existenz der Verwaltungsroute an jede
     * angemeldete Person der Suite.
     *
     * ⛔ DIE LEERE GRUPPENLISTE IST DER FALL, und sie ist echt: `devLogin` fuellt das
     * `groups`-Feld mit `""` (`e2e/fixtures.ts:18`). Die Sitzung ist damit gueltig — der
     * anonyme Zweig aus Fall A greift also gerade NICHT, und was hier misst, ist der
     * Gruppenriegel.
     */
    await devLogin(page, { host: RADIO_HOST, groups: "" });

    const antwort = await page.request.get(radioUrl("/admin"));
    expect(
      antwort.status(),
      "/admin ohne beide Gruppen — 403 statt 404 verriete die Route (Spec:691-694)",
    ).toBe(404);
  });

  test("V-L3 C: /admin mit der Updater-Gruppe antwortet 200 und zeigt vier Menuepunkte", async ({
    page,
  }) => {
    /*
     * ⛔ DIE ZWEITE RECHTESTUFE, UND DIES IST IHRE EINZIGE WIRKPROBE. Betreiberentscheidung
     * C.6/B4 vom 2026-08-21 (`KONTEXT.md`): Admin verwaltet, Updater pflegt Geraetestaende.
     * `admin/(arbeit)/layout.tsx:61` traegt dafuer `requireRadioVerwaltung()` — die MILDERE
     * Form; stuende dort `requireRadioAdmin()`, saehe jede Updater-Person 404, bevor
     * irgendeine Seite liefe, bei gruenem typecheck, lint und build.
     *
     * ⛔ VIER MENUEPUNKTE, NICHT SIEBEN: `radioNav("updater")` blendet Import,
     * Softwareversionen und Zugaenge aus (`_lib/nav.ts:94`, Liste `:51`; `Spec:4202-4203`).
     * Ohne diese Zahl bliebe die Zusicherung „200" auch dann gruen, wenn das Layout wieder
     * `radioNav("admin")` einsetzte — und dann zeigte die Navigation drei Punkte, die in ein
     * `notFound()` fuehren.
     *
     * ⛔ GEZAEHLT WIRD INNERHALB DER MODULLEISTE. `nav-link` vergibt auch der Drawer
     * (`core/shell/SuiteNav.tsx:151`); eine freie Zaehlung ueber der ganzen Seite maesse
     * beide Ausprägungen zusammen und traefe die Vier nie.
     */
    await devLogin(page, { host: RADIO_HOST, groups: RADIO_UPDATER_GRUPPE });

    const antwort = await page.goto(radioUrl("/admin"));
    expect(antwort?.status(), "/admin mit der Updater-Gruppe").toBe(200);

    await expect(
      page.getByTestId("modulleiste").getByTestId("nav-link"),
      "die Navigation zeigt nicht genau vier Eintraege (radioNav(updater), _lib/nav.ts:94)",
    ).toHaveCount(4);
  });

  test("V-L3 D: /admin/versionen antwortet der Updater-Gruppe mit 404, der Admin-Gruppe mit 200", async ({
    page,
  }) => {
    /*
     * ⛔ DAS IST DIE WIRKPROBE DER NAMENTLICHEN ZUSICHERUNG (`briefs/V23.md`, Schritt D;
     * `KONTEXT.md`, Nachtrag Planteil 4, Abschnitt 2). `riegel.test.ts` faengt eine
     * faelschlich ABGESENKTE Seite im `(arbeit)`-Zweig STRUKTURELL NICHT: Klausel (a) und (e)
     * lassen dort beide Riegelnamen zu, weil sie sonst gegen `Spec:4367` rot-by-construction
     * waeren. Drei Seiten haengen daran — `/admin/versionen` (V19), `/admin/zugaenge` (V20)
     * und seit der Betreiberentscheidung ⬜ V-L5 auch `/admin/import` (V18).
     *
     * ⛔ DIE ZWEITE HAELFTE IST DIE, DIE DEN FALL TRAEGT. Ohne sie ist der 404 oben
     * mehrdeutig: er saehe genauso aus, wenn die Seite gar nicht existierte, wenn der
     * Host-Riegel griffe oder wenn die Updater-Gruppe im Serverprozess unbekannt waere
     * (⬜ V-L1 / Vorabscan-Fund F24 — ein fehlender `SUITE_UPDATER_GROUP_RADIO` SCHLIESST
     * die Stufe). Erst „mit Admin 200, mit Updater 404, auf derselben Adresse" benennt die
     * STUFE als Ursache.
     *
     * ⚠️ ZWEI ANMELDUNGEN IN EINEM FALL, und das ist Absicht: die zwei Haelften muessen
     * dieselbe Adresse in derselben Serverinstanz treffen. Zwei getrennte `test()` liessen
     * einen davon still ausfallen, ohne dass die Aussage rot wuerde.
     *
     * ⛔ `clearCookies()` VOR DER ZWEITEN ANMELDUNG, UND DAS IST GEMESSEN (2026-08-26, erster
     * Lauf dieses Falles): ohne sie leitet `/login` eine bereits angemeldete Person sofort
     * weiter, das E-Mail-Feld erscheint nie, und `devLogin` lief in die vollen 90 s
     * Zeitbudget — mit einer Meldung („waiting for getByLabel('email')"), die nach einer
     * kaputten Anmeldemaske klingt statt nach einer bestehenden Sitzung. Dieselbe Lehre und
     * dieselbe Abhilfe wie `e2e/aufgaben.spec.ts:1644-1656` und
     * `e2e/lagerbuch-checklisten.spec.ts:375-377`.
     */
    await devLogin(page, { host: RADIO_HOST, groups: RADIO_UPDATER_GRUPPE });
    const alsUpdater = await page.request.get(radioUrl("/admin/versionen"));
    expect(
      alsUpdater.status(),
      "/admin/versionen ist fuer die Updater-Stufe offen — die Absenkung ist wirksam geworden",
    ).toBe(404);

    await page.context().clearCookies();
    await devLogin(page, { host: RADIO_HOST, groups: RADIO_ADMIN_GRUPPE });
    const alsAdmin = await page.request.get(radioUrl("/admin/versionen"));
    expect(
      alsAdmin.status(),
      "/admin/versionen antwortet auch der Admin-Stufe nicht — der 404 oben misst dann nichts",
    ).toBe(200);
  });
});
