import { test, expect, type Page } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";
import {
  E2E_TOKEN_HELFER,
  LAGERBUCH_ADMIN_GRUPPE,
  LAGERBUCH_HOST,
  lagerbuchUrl,
} from "./helpers/lagerbuch";

/**
 * DRK-297, Aufgabe 14 — der Schrank-Weg AM STUECK, im echten Browser.
 *
 * WAS KEIN ANDERES TOR SIEHT: die RSC-Grenze zwischen `page.tsx` und den
 * Client-Inseln (Fallen 1/6/7/9 — nur ein echter Abruf zeigt einen HTTP 500),
 * den tatsaechlichen Server-Action-Rundlauf von `createSchrank`/`createArtikel`/
 * `bucheZugang`, und den Zugangshinweis IM KLARTEXT auf der Helferansicht.
 * Vitest kennt keine RSC-Grenze und rendert `ArtikelDrawer` immer schon als
 * Client-Baum — ein Bruch an der Grenze waere dort unsichtbar.
 *
 * ⚠️ EIGENER SCHRANK **UND** EIGENER ARTIKEL, BEIDE SELBST ANGELEGT. Der
 * Auftrag verlangt nur einen eigenen Schrank („unabhaengig davon, was Aufgabe
 * 13 geliefert hat"), aber `e2e/seed-lagerbuch.ts` schreibt an mehreren
 * Stellen dieselbe Regel fuer Artikel aus: „JEDER FLOW BRAUCHT SEINEN EIGENEN"
 * (I-14) und `e2e-artikel` „GEHOERT AUSSCHLIESSLICH DIESEM FLOW" (dem
 * Helfer-Token-Weg aus `lagerbuch-helfer.spec.ts`). Jeder andere seedbare
 * Artikel traegt dieselbe Ausschliesslichkeits-Klausel eines anderen Specs.
 * Ein UI-erzeugter Artikel macht diesen Test unabhaengig von JEDER fremden
 * Spec und von der Einfuegereihenfolge der 200 Lastartikel (§E2E_LAST_PRAEFIX)
 * — er wird ueber die Suche gefunden, nie ueber Bildlauf im virtualisierten
 * Fenster.
 *
 * ⚠️ WARMLAUF-GET (Falle 10) IST HIER NICHT EINSCHLAEGIG, und das wird hier
 * ausgeschrieben statt stillschweigend uebergangen: Falle 10 gilt fuer ROUTE
 * HANDLER, die beim ERSTEN Treffer uebersetzt werden, waehrend ein `fetch(...,
 * {method:"POST"})` schon unterwegs ist. Alle drei Schreibvorgaenge hier sind
 * SERVER ACTIONS — ihr POST geht an dieselbe Seiten-URL, die der vorangehende
 * `page.goto(...)` (mit `waitForLoadState("networkidle")`) bereits vollstaendig
 * geladen und damit uebersetzt hat (Vorbild: `lagerbuch-inventur.spec.ts` und
 * `lagerbuch-checklisten.spec.ts` fuegen vor einer Server Action auf einer
 * schon besuchten Seite ebenfalls KEINEN separaten Warmlauf ein). Der einzige
 * echte GET-Route-Handler im Ablauf ist `/t/<code>` — eine volle Navigation
 * per `page.goto`, kein `fetch` aus einer schon offenen Seite heraus, und
 * damit strukturell nicht das Muster aus Falle 10 (das Abbrechen trifft einen
 * `fetch`, dessen Seite gerade per HMR neu laedt, nicht eine Navigation, auf
 * deren Antwort `page.goto` selbst wartet).
 *
 * ⚠️ JEDE AUSLOESENDE AKTION PRUEFT IHRE ANTWORT (Falle 10, zweite
 * Testregel): jeder Server-Action-Klick haengt an `page.waitForResponse` mit
 * dem `next-action`-Kopf als Filter (Vorbild `lagerbuch-inventur.spec.ts`),
 * NICHT nur an einer spaeteren Zustandsaenderung — sonst liefe eine
 * abgelehnte Antwort (Validierung, 403, abgebrochen) still ins Zeitbudget und
 * meldete sich als "Zeile erscheint nicht" statt als das, was sie ist.
 *
 * ⚠️ ZEILENGREIFER IST `[data-row-key]` (Falle 14) — nie `tbody tr`, nie
 * `getByRole("row")`. Die Artikeltabelle virtualisiert (200 Lastartikel,
 * `E2E_LAST_ANZAHL`), die Chargentabelle nicht (eine Handvoll Zeilen je
 * Artikel) — beide werden hier trotzdem gleich gegriffen, weil `[data-row-key]`
 * in BEIDEN Betriebsarten traegt.
 *
 * ⚠️ KLICKS AUF ANKER UEBER `klickeWennRuhig` (Falle 12): der Link von der
 * Helferansicht `/helfer` zu `/a/<id>` ist ein echter `<a href>`
 * (`ArtikelSuche.tsx`). Die Server-Action-Knoepfe sind KEINE Anker, aber sie
 * loesen jeweils die erste nennenswerte Interaktion nach einem frischen
 * `page.goto` aus — dieselbe Kategorie „Klick, nach dem die Huelle umbrechen
 * kann", die `lagerbuch-inventur.spec.ts` durchgaengig ueber `klickeWennRuhig`
 * fuehrt, nicht nur bei Ankern.
 *
 * ⚠️ RUECKGABEWERT DER WIEDERHOLUNG: `test.info().retry` steht in jedem
 * erzeugten Namen. CI faehrt `retries: 2` gegen DIESELBE Datenbank (`workers:
 * 1`); ohne die Versuchsnummer legte ein zweiter Versuch einen ZWEITEN Schrank
 * mit demselben Namen an, und der textbasierte `[data-row-key]`-Greifer traefe
 * dann auf zwei Zeilen (Playwright-Strict-Mode-Fehler, dessen Meldung nicht
 * auf die eigentliche Ursache zeigt).
 */

/**
 * ⚠️ NICHT `await`-en, BEVOR der ausloesende Klick passiert ist:
 * `page.waitForResponse(...)` beginnt zu lauschen, SOBALD es aufgerufen wird —
 * ein `await` an der Aufrufstelle wuerde auf eine Antwort warten, die es noch
 * gar nicht geben kann, weil der Klick, der sie ausloest, noch nicht
 * stattgefunden hat. Der Aufrufer haelt die zurueckgegebene PROMISE, klickt,
 * und `await`-et sie erst danach (Vorbild `lagerbuch-inventur.spec.ts`).
 */
function serverActionAntwort(page: Page) {
  return page.waitForResponse(
    (r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined,
    { timeout: 60_000 },
  );
}

test.describe("Lagerbuch Schraenke — Zugangsziel und Zugangshinweis (DRK-297)", () => {
  test.beforeEach(async ({ page }) => {
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("Schrank anlegen, Zugang mit Zielort buchen — Verteilung und Zugangshinweis erscheinen", async ({
    page,
  }) => {
    const versuch = test.info().retry;
    const schrankName = `E2E Schrank Versuch ${versuch}`;
    const zugangshinweis = `E2E Regal rechts Versuch ${versuch}`;
    const artikelName = `E2E Schrank-Artikel Versuch ${versuch}`;
    const einheit = "Stk.";
    const chargenNr = `E2E-SCHRANK-${versuch}`;
    const menge = 6;
    // Weit ausserhalb jeder Warn-/Ablaufschwelle (`LAGERBUCH_VERFALL_*_TAGE`),
    // aber NICHT der Sentinel `PSEUDO_VERFALL` ("2099-12") — der meint "kein
    // Verfall" und naehme einen anderen Zweig.
    const verfallsmonat = "2090-06";

    // ── 1) Verwaltung → Lagerorte, Schrank anlegen ────────────────────────
    const lagerorteSeite = await page.goto(lagerbuchUrl("/verwaltung/lagerorte"));
    expect(lagerorteSeite?.status(), "/verwaltung/lagerorte: HTTP").toBe(200);
    // Ohne Hydration traefe der Klick unten ein Element ohne Handler
    // (Begruendung in `lagerbuch-ux.spec.ts`, Vorbild `lagerbuch-inventur.spec.ts`).
    await page.waitForLoadState("networkidle");

    await klickeWennRuhig(page.getByRole("button", { name: "Neuer Schrank" }));
    const schrankDialog = page.getByRole("dialog");
    await schrankDialog.getByLabel("Name").fill(schrankName);
    await schrankDialog.getByLabel("Zugangshinweis").fill(zugangshinweis);

    const schrankAntwort = serverActionAntwort(page);
    await klickeWennRuhig(page.getByRole("button", { name: "Anlegen" }));
    expect((await schrankAntwort).ok(), "Schrank anlegen: Server Action").toBe(true);

    const schrankZeile = page.locator("[data-row-key]").filter({ hasText: schrankName });
    await expect(schrankZeile, "der neue Schrank muss in der Lagerorte-Liste stehen").toHaveCount(1);

    // ── 2) Verwaltung → Artikel, eigenen Artikel anlegen ──────────────────
    // Ein eigener Artikel statt eines geseedeten: siehe Kopfkommentar — jeder
    // vorhandene Kandidat ist einem anderen Flow vorbehalten.
    const artikelSeite = await page.goto(lagerbuchUrl("/verwaltung/artikel"));
    expect(artikelSeite?.status(), "/verwaltung/artikel: HTTP").toBe(200);
    await page.waitForLoadState("networkidle");

    await klickeWennRuhig(page.getByRole("button", { name: "Neuer Artikel" }));
    const artikelDialog = page.getByRole("dialog");
    await artikelDialog.getByLabel("Name").fill(artikelName);
    await artikelDialog.getByLabel("Fach").fill("E2E-S");
    await artikelDialog.getByLabel("Einheit").fill(einheit);

    const artikelAntwort = serverActionAntwort(page);
    await klickeWennRuhig(page.getByRole("button", { name: "Anlegen" }));
    expect((await artikelAntwort).ok(), "Artikel anlegen: Server Action").toBe(true);

    // Ueber die Suche finden, NIE ueber Bildlauf: die Tabelle virtualisiert
    // (200 Lastartikel, Falle 14), und ein frisch angelegter Artikel landet
    // alphabetisch irgendwo — moeglicherweise ausserhalb des zuerst
    // gerenderten Fensters.
    await page.getByRole("searchbox").fill(artikelName);
    const artikelKnopf = page.getByRole("button", { name: artikelName, exact: true });
    await expect(artikelKnopf).toBeVisible();
    await klickeWennRuhig(artikelKnopf);

    // ── 3) Zugang mit Zielort buchen ───────────────────────────────────────
    const zugangForm = page.locator('form[data-rolle="zugang-form"]');
    await expect(zugangForm).toBeVisible();

    const mengeFeld = zugangForm.getByLabel("Zugangsmenge");
    await mengeFeld.fill(String(menge));
    // Der Artikel ist fabrikneu und traegt keine Charge — "chargeId" steht
    // deshalb schon auf "+ Neue Charge" (initialValues), die Chargenfelder
    // erscheinen ohne weitere Auswahl.
    await zugangForm.getByLabel("Chargennummer").fill(chargenNr);

    // "Wohin": jetzt STEHEN zwei Ziele zur Wahl (Handlager-Wurzel + unser
    // Schrank) — die Automatik aus `ArtikelDrawer.tsx` waehlt nur vor, wenn es
    // GENAU einen Zielort gibt (`detail.zielOrte.length === 1`), hier also
    // NICHT. Explizit waehlen, sonst bliebe das Pflichtfeld leer.
    await klickeWennRuhig(zugangForm.getByRole("combobox", { name: "Wohin" }));
    await page.locator(".ant-select-item-option", { hasText: schrankName }).click();

    // Verfallsmonat — antds Monatsauswahl. Direkt eingetippt und mit Enter
    // bestaetigt statt ueber den Kalender zu einem 64 Jahre entfernten Monat
    // zu blaettern.
    const verfallFeld = zugangForm.getByLabel("Verfallsmonat");
    await verfallFeld.click();
    await verfallFeld.fill(verfallsmonat);
    await page.keyboard.press("Enter");
    // Panel schliessen ueber einen Klick auf eine inerte Ueberschrift, NICHT
    // ueber `Escape` — Escape ist bei antds Picker ein ABBRUCH und koennte den
    // gerade eingetippten Wert wieder verwerfen; ein Klick daneben schliesst
    // nur das Panel (Ausserhalb-Klick-Erkennung).
    await page.getByRole("heading", { name: "Zugang buchen" }).click();

    const zugangAntwort = serverActionAntwort(page);
    await klickeWennRuhig(page.getByRole("button", { name: "Zugang buchen" }));
    expect((await zugangAntwort).ok(), "Zugang buchen: Server Action").toBe(true);

    // ── 4) Die Chargentabelle zeigt "Schrank …: N Einheit" ────────────────
    // ⚠️ GEGEN DIE `aria-label="Chargen"`-TABELLE SCOPEN, nicht `[data-row-key]`
    // allein auf der ganzen Seite suchen: die Artikeltabelle bleibt HINTER dem
    // offenen Drawer im DOM stehen, und ihre Spalte "naechste Charge" zeigt
    // jetzt EBENFALLS unsere Chargennummer (`ArtikelTable.tsx` Zeile
    // `naechsteCharge.chargenNr`) — ohne Scope traf der Greifer zwei Zeilen
    // (Playwright-Strict-Mode-Fehler, gemessen im ersten Lauf dieser Datei).
    const chargenTabelle = page.getByRole("table", { name: "Chargen" });
    const chargeZeile = chargenTabelle.locator("[data-row-key]").filter({ hasText: chargenNr });
    await expect(chargeZeile, "die neue Charge muss in der Chargentabelle stehen").toBeVisible();
    await expect(chargeZeile).toContainText(`${schrankName}: ${menge} ${einheit}`);
    // Der Zugangshinweis steht ZUSAETZLICH als natives `title` am Chip
    // (Ruling A15, `Chip.tsx`) — nur ueber Hover waere er per Tastatur/Touch
    // nicht erreichbar.
    await expect(chargeZeile.locator(`[title="${zugangshinweis}"]`)).toHaveCount(1);

    // ── 5) Helferansicht öffnen ────────────────────────────────────────────
    const helferSeite = await page.goto(lagerbuchUrl(`/t/${E2E_TOKEN_HELFER}`));
    // `page.goto` folgt dem 303 von `/t/[code]/route.ts` automatisch (Vorbild:
    // der Kommentar zu `page.goto()` und 307 in `lagerbuch-etiketten.spec.ts`)
    // — der Status hier ist der der LANDESEITE `/helfer`, nicht der des 303.
    expect(helferSeite?.status(), "/t/<code>: HTTP").toBe(200);
    await expect(page).toHaveURL(/\/helfer$/);

    await page.getByRole("searchbox", { name: "Artikel suchen" }).fill(artikelName);
    const helferLink = page.getByRole("link", { name: new RegExp(artikelName) });
    await expect(helferLink).toBeVisible();
    await klickeWennRuhig(helferLink);
    await page.waitForURL(/\/a\//);

    // Positive Probe auf dem RICHTIGEN Zweig (§7.4.3 Ausgang 1, Helfer-Sitzung
    // statt Admin-Umleitung): ohne sie liesse ein fehlendes Helfer-Cookie den
    // Test still in der Verwaltungsansicht landen, die "Schrank: Menge" ohne
    // Zugangshinweis-Zeile ebenfalls zeigt — ein falscher Zweig, der wie ein
    // bestandener Test aussaehe.
    await expect(page.getByText(/^Zugang: Token/)).toBeVisible();

    // ── 6) Zugangshinweis im Klartext ──────────────────────────────────────
    const hinweisZeile = page.locator('[data-rolle="charge-zugangshinweis"]');
    await expect(hinweisZeile, "der Zugangshinweis muss ohne Interaktion sichtbar sein").toBeVisible();
    await expect(hinweisZeile).toContainText(`${schrankName}: ${zugangshinweis}`);
  });

  /**
   * DRK-349 — DER LOESCHWEG, UND ZWAR DER GANZE.
   *
   * ⚠️ DIE TRAGENDE ZUSICHERUNG IST DIE NACH DEM NEULADEN, nicht die
   * verschwundene Zeile. Genau das war der gemeldete Fehler: `loescheElement`
   * lief in einen Loeschzweig mit `WHERE typ = 'fahrzeug'`, traf einen Schrank
   * (`typ: "lager"`) nie und meldete trotzdem `{ ok: true }`. Der Dialog
   * schloss sich, die Liste laed neu — und weil `revalidatePath` unter
   * `next dev` nicht immer sofort durchschlaegt, koennte eine Zusicherung
   * allein auf die Zeile im selben Dokument sogar gruen werden, waehrend die
   * Zeile in der Datenbank steht. Ein frischer `page.goto` kann das nicht.
   *
   * ⚠️ EIGENER SCHRANK, NICHT DER AUS DEM TEST OBEN: der traegt nach seinem
   * Zugang eine Buchung und ist damit fachlich richtig UNloeschbar. Ein
   * Loeschtest darauf pruefte die Ablehnung, nicht den Loeschweg — und die
   * Ablehnungen stehen vollstaendig in `_actions/loeschen.test.ts` gegen eine
   * echte Datenbank.
   */
  test("leeren Schrank anlegen und wieder löschen — die Zeile ist auch nach dem Neuladen weg", async ({
    page,
  }) => {
    const versuch = test.info().retry;
    const schrankName = `E2E Löschschrank Versuch ${versuch}`;

    const lagerorteSeite = await page.goto(lagerbuchUrl("/verwaltung/lagerorte"));
    expect(lagerorteSeite?.status(), "/verwaltung/lagerorte: HTTP").toBe(200);
    await page.waitForLoadState("networkidle");

    await klickeWennRuhig(page.getByRole("button", { name: "Neuer Schrank" }));
    const anlegenDialog = page.getByRole("dialog");
    await anlegenDialog.getByLabel("Name").fill(schrankName);

    const anlegeAntwort = serverActionAntwort(page);
    await klickeWennRuhig(page.getByRole("button", { name: "Anlegen" }));
    expect((await anlegeAntwort).ok(), "Schrank anlegen: Server Action").toBe(true);

    const zeile = page.locator("[data-row-key]").filter({ hasText: schrankName });
    await expect(zeile, "der neue Schrank muss in der Liste stehen").toHaveCount(1);

    // ── Löschen ────────────────────────────────────────────────────────────
    // ⚠️ AUCH DIESER KLICK LOEST EINE SERVER ACTION AUS, und darum haengt auch
    // er an `page.waitForResponse` (Falle 10, zweite Testregel): der Dialog
    // ruft beim Oeffnen `pruefeLoeschbar`. Ohne die Zusicherung liefe eine
    // abgelehnte Vorpruefung (403, 500, abgebrochen) still in das Zeitbudget
    // der Zeile darunter und meldete sich als „der leere Schrank muss
    // löschbar sein" — eine Meldung, die auf die Loeschregeln zeigt, waehrend
    // in Wahrheit die Anfrage nie ankam.
    const pruefAntwort = serverActionAntwort(page);
    await klickeWennRuhig(zeile.getByRole("button", { name: "Löschen", exact: true }));
    expect((await pruefAntwort).ok(), "Löschbarkeit prüfen: Server Action").toBe(true);

    // Erst danach steht das Bestaetigungsfeld im Dialog. Auf das FELD zu warten
    // ist die fachliche Probe — es erscheint nur im Zweig `loeschbar: true`;
    // die Zeile darueber deckt den technischen Teil ab.
    const loeschDialog = page.getByRole("dialog");
    const bestaetigung = loeschDialog.getByLabel("Namen zur Bestätigung eingeben");
    await expect(bestaetigung, "der leere Schrank muss löschbar sein").toBeVisible();
    await bestaetigung.fill(schrankName);

    const loeschAntwort = serverActionAntwort(page);
    await klickeWennRuhig(loeschDialog.locator("[data-rolle='loeschen']"));
    expect((await loeschAntwort).ok(), "Schrank löschen: Server Action").toBe(true);

    await expect(zeile, "die Zeile muss aus der Liste verschwinden").toHaveCount(0);

    // ⚠️ DIE ZEILE, DIE DEN FEHLER VON DRK-349 GEFANGEN HAETTE.
    const nachNeuladen = await page.goto(lagerbuchUrl("/verwaltung/lagerorte"));
    expect(nachNeuladen?.status(), "/verwaltung/lagerorte nach dem Löschen: HTTP").toBe(200);
    await expect(
      page.locator("[data-row-key]").filter({ hasText: schrankName }),
      "der gelöschte Schrank darf auch nach einem frischen Abruf nicht mehr dastehen",
    ).toHaveCount(0);
  });
});
