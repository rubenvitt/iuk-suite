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
     * ⬜ **V13-L2 — HEUTE SEEDET DER E2E-LAUF `radio` NICHT** (`core/bootstrap.ts:49-54`,
     * `playwright.config.ts:142`; Eigentuemer V23). Ohne Geraet gibt es keine Akte-Adresse und
     * damit auch keine Ereignisadresse; eine erfundene Id waere ein 404, den dieser Fall dann
     * als „Insel gebrochen" meldete. Deshalb faellt die Vorbedingung LAUT und mit eigener
     * Begruendung aus, statt die Zusicherung darunter stillschweigend zahnlos zu machen.
     */
    await page.goto(radioUrl("/admin/geraete"));
    const zeilen = page.locator("table tbody tr.ant-table-row");
    expect(
      await zeilen.count(),
      "⬜ V13-L2: ohne Geraet gibt es keine Ereignisadresse, die dieser Fall abrufen koennte",
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
     * ⛔ EIGENER `test()`, UND DAS IST KEINE KOSMETIK. Fall 4 oben faellt heute an seiner
     * ⬜ V13-L2-Vorbedingung aus (der e2e-Lauf seedet `radio` nicht); ein `expect(...)` WIRFT,
     * und alles danach in DEMSELBEN `test()` laeuft nie. Stuende diese Zusicherung dort unten,
     * waere sie bis V23 unerreichbar — und ein Bericht, der sie als „traegt auch ohne Seed"
     * fuehrte, behauptete Gruen als konstanten Text. ⛔ Genau diese Fehlerklasse ist in diesem
     * Haus vernarbt. Hier braucht sie nur eine Anmeldung und eine ausgedachte Id und laeuft
     * deshalb SCHON HEUTE.
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
     * Zweige (Tabelle und mobile Liste), und ⬜ V13-L2 laesst die Liste heute ohnehin leer —
     * der e2e-Lauf seedet `radio` nicht (`core/bootstrap.ts:49-54`,
     * `playwright.config.ts:142`; Eigentuemer V23). `[data-rolle="radio-ausleihen-flaeche"]`
     * steht in BEIDEN Zweigen und fehlt genau dann, wenn die Insel an der Grenze bricht.
     * Dieselbe Lehre wie in Fall 4 oben.
     *
     * ⚠️ DIE SEITE IST FUER BEIDE STUFEN OFFEN (`Spec:4373`, Rechtetafel `Spec:4444-4454`).
     * Der Abruf hier laeuft mit der ADMIN-Gruppe, wie jeder Fall dieser Datei; dass eine
     * UPDATER-Person sie ebenfalls erreicht, ist bis heute UNGEMESSEN — ⬜ **V-L3** haengt
     * daran mit, und der namentliche Quelltext-Waechter ist
     * `AusleihenTabelle.test.tsx` („die Seite traegt force-dynamic und den Riegel der
     * Verwaltungs-Stufe"). ⛔ Kein Satz hier behauptet etwas anderes.
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
     * keine (1:1 `UpdateMode.tsx:67-68`), und ⬜ V13-L2 laesst den e2e-Lauf ohnehin ohne
     * `radio`-Bestand fahren (`core/bootstrap.ts:49-54`, `playwright.config.ts:142`;
     * Eigentuemer V23). `[data-rolle="radio-update-flaeche"]` steht in JEDEM Zweig und fehlt
     * genau dann, wenn die Insel an der Grenze bricht.
     *
     * ⚠️ DIE SEITE IST FUER BEIDE STUFEN OFFEN (`Spec:4374`, Rechtetafel `Spec:4444-4454`) —
     * und sie ist die Flaeche, um deretwillen es die Updater-Stufe gibt. Der Abruf hier laeuft
     * mit der ADMIN-Gruppe, wie jeder Fall dieser Datei; dass eine UPDATER-Person sie ebenfalls
     * erreicht, ist bis heute UNGEMESSEN — ⬜ **V-L3** haengt daran mit, und der namentliche
     * Quelltext-Waechter ist `UpdateSuche.test.tsx` („die Seite traegt force-dynamic und den
     * Riegel der Verwaltungs-Stufe"). ⛔ Kein Satz hier behauptet etwas anderes.
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
     * ein WARMLAUF-GET auf dieselbe Route vor dem ersten echten POST. ⚠️ Die Antwort des
     * Warmlaufs ist ein 405 (der Handler kennt nur `POST`) — das ist der ERWARTETE Zustand
     * und genau das, was er beweisen soll: die Route ist uebersetzt und antwortet.
     *
     * ⛔ UND DIE ZWEITE TESTREGEL AUS FALLE 10: wer eine Anfrage ausloest, PRUEFT IHRE
     * ANTWORT (`page.waitForResponse`), statt auf eine spaetere Zustandsaenderung zu warten —
     * sonst laeuft jede abgelehnte Antwort (404, 405, 413, abgebrochen) still ins Zeitbudget.
     *
     * ⚠️ ER BRAUCHT KEINEN BESTAND (⬜ V13-L2): der Import LEGT AN. Das ist der eine Fall
     * dieser Datei, der ohne `radio`-Seed einen echten Schreibvorgang zeigen kann.
     */
    await devLogin(page, { host: RADIO_HOST, groups: RADIO_ADMIN_GRUPPE });

    // Der Warmlauf — Falle 10. Die 405 ist die Antwort eines UEBERSETZTEN POST-Handlers.
    const warmlauf = await page.request.get(radioUrl("/admin/import/hochladen"));
    expect(
      warmlauf.status(),
      "der Hochladen-Handler antwortet nicht — der erste echte POST liefe in Falle 10",
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

    const hochgeladen = page.waitForResponse(
      (a) => a.url().includes("/admin/import/hochladen") && a.request().method() === "POST",
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
      (a) => a.url().includes("/admin/import") && a.request().method() === "POST",
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
      (a) => a.url().includes("/admin/import") && a.request().method() === "POST",
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
    await expect(
      page.locator("table"),
      "das importierte Geraet steht nicht in der Liste",
    ).toContainText(issi);
  });
});
