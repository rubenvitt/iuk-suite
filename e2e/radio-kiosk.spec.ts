import { existsSync } from "node:fs";
import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";
import { klickeWennRuhig } from "./fixtures";
import { E2E_CODE_AKTIV, RADIO_ENV, radioUrl } from "./helpers/radio";

/**
 * DER RUNDGANG DURCH DEN ANONYMEN AUSLEIHZWEIG — Fall 1 der Zusagentafel
 * (`.superpowers/sdd/planteil5/briefs/KOPF.md`, Aufgabe T2).
 *
 * ⛔ WAS ER BEWEIST, UND WARUM ES BIS HEUTE UNBEWIESEN WAR. `radio` fuehrt
 * `requiresAuth: false` (`src/core/registry.ts:198` traegt den Eintrag; die Folge steht
 * ausgeschrieben in `Spec:6584-6588`: „also antwortet JEDER Suite-Host auf `/m/radio/*`,
 * wenn das Modul seinen eigenen Riegel nicht traegt"). Die Kehrseite derselben Zeile ist
 * die Zusage dieses Falls: auf dem EIGENEN Host darf KEIN Login-Riegel im Weg stehen.
 * §8.2.4 haelt das als Bauform-Zusicherung fest — „der Riegel steht NICHT auf dem anonymen
 * Ausleih-Ast" —, und `src/app/m/radio/riegel.test.ts` ist ein QUELLTEXT-Scan: er belegt
 * eine Bauform, keine Wirkung. Ob der Ast bei einem ECHTEN Abruf traegt, kann nur ein
 * laufender Server sagen. ⬜ **Z-L1**, Zeile „der anonyme Ausleihzweig ueberhaupt".
 *
 * ⛔ E-G9 — WARUM ES KEINE `e2e/radio-tabellen.spec.ts` GIBT, und das ist eine
 * Entscheidung aus Belegen, kein Versehen. §8.4.1 nennt fuenf Spec-Dateien; die zwei
 * Auftraege von `radio-tabellen.spec.ts` sind aufgeteilt worden. Der eine — der Rundgang
 * ueber die VIER Kiosk-Seiten aus §8.4.2 — wird von DIESER Datei mitgetragen, weil ihr
 * Fluss alle vier der Reihe nach durchlaeuft. ⛔ **Bedingung, und sie ist die ganze
 * Begruendung: jede Station traegt ihre EIGENE Statuspruefung**, statt nur auf einen
 * Folgezustand zu warten (Stationen 1 bis 4 unten, je ein eigenes `expect` auf
 * `antwort.status()`). Der andere Auftrag — die Zellen-Luecke — geht als Ergaenzung in
 * `e2e/radio-verwaltung.spec.ts` (Aufgabe T5). Eine eigene Datei fuer denselben Abruf
 * waere kein zusaetzlicher Beweis.
 *
 * ⛔ DIE VIER KIOSK-SEITEN SIND GEZAEHLT, NICHT GESCHAETZT. Gemessen am 2026-08-27 mit
 * `find src/app/m/radio -name "page.tsx" | grep -v admin` sind es genau vier:
 * `src/app/m/radio/page.tsx` (das Gate, aeusserer Pfad `/`),
 * `(ausleihe)/geraete/page.tsx`, `(ausleihe)/ausleihen/page.tsx`,
 * `(ausleihe)/rueckgabe/page.tsx`.
 *
 * ⚠️ DIESER FALL LOEST `E2E_CODE_AKTIV` WIRKLICH EIN. `zugangscodes.last_used_at`
 * (`src/app/m/radio/_db/schema.ts:192`, Datei 264 Zeilen) traegt danach fuer den Rest des
 * Laufs einen gesetzten Wert. ⛔ Ein spaeterer Fall, der `last_used_at IS NULL` als
 * VORBEDINGUNG braucht, darf diesen Code nicht mehr verwenden — er legt sich einen
 * eigenen an oder sichert DIFFERENZIELL zu (so wie T4 es tut).
 * ⚠️ VERBRAUCHT WIRD DER CODE DABEI NICHT: `loeseCodeEin` prueft nur `!zeile ||
 * !zeile.aktiv` (`src/app/m/radio/_lib/schreibpfade/codeEinloesung.ts:64`) und schreibt
 * `lastUsedAt` bei JEDEM Treffer (`:70`, Datei 77 Zeilen). Deshalb darf der Warmlauf
 * unten denselben Code ein zweites Mal einloesen.
 *
 * ⬜ **T-L2 — DIE STATUSCODES SIND MESSWERTE, NICHT ZUSAGEN AUS DEM PLAN.** Abgelesen am
 * 2026-08-27 beim ersten gruenen Lauf dieser Datei: Gate `/` → **200**,
 * `/m/radio/t/<code>` → **303**, `/geraete` → **200**, `/ausleihen` → **200**,
 * `/rueckgabe` → **200**. Der Plan hatte 303 fuer die Einloese-Route und 200 fuer die drei
 * Ausleihflaechen vorbelegt; die Messung bestaetigt beides und ergaenzt das Gate.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DIE VIER FALLEN, DIE DIESEN FALL SONST FALSCH GRUEN ODER FALSCH ROT MACHEN
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ⛔ **FALLE 10, BEIDE HAELFTEN.** Ein POST auf einen Route Handler oder eine Server
 * Action kann waehrend deren ERSTUEBERSETZUNG abgebrochen werden (`net::ERR_ABORTED`,
 * `canceled: true`, NIE eine Antwort) — und das Symptombild fuehrt in die Irre: keine
 * Datenbankzeile, keine Protokollzeile, ein Lauf ins Zeitbudget mit einer Meldung, die
 * nach etwas anderem klingt. Abhilfe, beide Teile:
 *   (a) ein WARMLAUF-GET auf dieselbe Route VOR dem ersten echten POST. Er steht hier
 *       dreimal und kostet keine zusaetzliche Zeile: die Station-GETs SIND der Warmlauf —
 *       Station 3 (`/ausleihen`) waermt die Ausleih-Action, Station 4 (`/rueckgabe`) die
 *       Rueckgabe-Action, und fuer die Einloese-Route steht der Warmlauf ausdruecklich
 *       unter Zusage 1.
 *   (b) JEDER POST WIRD MIT `page.waitForResponse` AUF SEINE ANTWORT GEPRUEFT, statt nur
 *       auf eine spaetere Zustandsaenderung zu warten (Bauform-Zulaessigkeitstafel Nr. 22).
 *       Vorbild: `e2e/files-fileshare.spec.ts`.
 *
 * ⛔ **FALLE 12.** Ein `.click()` navigiert nicht, wenn die Huelle zwischen `mousedown` und
 * `mouseup` umbricht. Abhilfe: `klickeWennRuhig` (`e2e/fixtures.ts:93`). ⚠️ Der
 * Ausleihzweig laeuft anonym und ohne `SessionProvider`-Nachladung, die Falle ist hier
 * also SCHWAECHER als in `/admin` — aber die Geraeteauswahl schreibt ihre Wahl mit
 * `router.replace` in die URL (`src/app/m/radio/_ui/AusleihVorgang.tsx:244`) und der
 * Vorschlagskasten des Namensfelds haengt sich nachtraeglich ein. Beides bewegt die
 * Huelle. ⛔ Im Zweifel `klickeWennRuhig` — er kostet nichts, wenn nichts umbricht.
 *
 * ⛔ **DER DB-PFAD KOMMT NICHT AUS `moduleDbPath()`** — siehe die Begruendung an
 * `DB_PFAD` unten.
 *
 * ⛔ **DIE ZUSICHERUNGEN AUF DB-WERTE SIND DIFFERENZIELL, NICHT ABSOLUT.** Ein Vergleich
 * gegen `NULL` haengt am Seed-Zustand statt am Test selbst; unter `--repeat-each` oder
 * `retries` laeuft derselbe Fall ein zweites Mal auf einem VERAENDERTEN Bestand. Die Frage
 * lautet immer: „in welchem falschen Zustand waere das auch gruen?"
 * (`e2e/lagerbuch-hosts.spec.ts:209`, Datei 273 Zeilen). Deshalb traegt dieser Fall einen
 * LAUFEIGENEN Entleihernamen, und jede DB-Zusage wird gegen den Zustand VOR dem eigenen
 * Schritt gemessen.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⛔ SONDE S-T2c — SIE BLEIBT ALS KOMMENTAR STEHEN, WEIL SIE E-G9 TRAEGT
 * ────────────────────────────────────────────────────────────────────────────
 * Ersetzt man die Statuspruefung EINER Station durch ein blosses
 * `await page.waitForURL(...)`, bleibt dieser Fall gruen — und genau dann ist die Aussage
 * „der Rundgang aus §8.4.2 ist mitgetragen" FALSCH, denn eine Station, die mit 500
 * antwortet und trotzdem die erwartete Adresse traegt, faellt durch. Faellt diese
 * Bedingung, faellt E-G9, und `e2e/radio-tabellen.spec.ts` waere doch noetig. ⛔ Wer eine
 * der vier `status()`-Zusicherungen unten entfernt oder abschwaecht, entfernt damit die
 * Begruendung fuer eine fehlende Datei — und muss jene Datei anlegen.
 */

/**
 * ⚠️ DER PFAD KOMMT NICHT AUS `moduleDbPath()`. `DATA_DIR=./.data/e2e` steht nur in
 * `playwright.config.ts:182` (`webServer.env`) und erreicht ausschliesslich den
 * SERVERprozess. Im Testprozess ist die Variable nicht gesetzt; `moduleDbPath` liefe auf
 * `./.data/radio.db` und laese EINE ANDERE DATEI als die, in die der Server schreibt.
 * Wortlaut und Vorbild: `e2e/lagerbuch-hosts.spec.ts:55` (Vorbehalt) und `:68-69` (die
 * `existsSync`-Meldung).
 */
const DB_PFAD = "./.data/e2e/radio.db";

/**
 * Eine frische, schreibgeschuetzte Verbindung je Aufruf — die Zeile wird VOR und NACH
 * jedem Schritt gelesen, und ein wiederverwendetes Handle koennte eine gepufferte
 * (veraltete) Sicht zeigen. Dieselbe Bauform wie `e2e/lagerbuch-hosts.spec.ts:63-79`.
 *
 * ⛔ KEIN `getDb()` UND KEIN `getModuleDb()` — deren Cache ist per Modulschluessel gekeyt,
 * nicht per `DATA_DIR` (`src/core/db/index.ts:25-36`).
 */
function leihZeile(entleiher: string): { id: string; returned_at: number | null } | undefined {
  expect(
    existsSync(DB_PFAD),
    `${DB_PFAD} fehlt — laeuft der e2e-Server mit DATA_DIR=./.data/e2e?`,
  ).toBe(true);
  const db = new Database(DB_PFAD, { readonly: true });
  try {
    return db
      .prepare("select id, returned_at from loans where borrower_name = ?")
      .get(entleiher) as { id: string; returned_at: number | null } | undefined;
  } finally {
    db.close();
  }
}

/**
 * Das Ausleih-Sitzungscookie. ⛔ Der Name steht als Literal, weil er der VERTRAG mit dem
 * Browser ist und kein konfigurierter Wert: `AUSLEIH_COOKIE = "radio_ausleihe"`
 * (`src/app/m/radio/_lib/ausleihSitzung.ts:35`, Datei 221 Zeilen). Dieselbe Bauform traegt
 * `e2e/lagerbuch-helfer.spec.ts:220` (`helfer_session=`).
 */
const AUSLEIH_COOKIE_ANFANG = "radio_ausleihe=";

/**
 * ⛔ DIE SITZUNGSDAUER WIRD RELATIV ZUM KONFIGURIERTEN WERT GEPRUEFT, NIE GEGEN DIE ZAHL
 * `12` (§8.2.2, `Spec:6573` woertlich: „sonst wandert die Entscheidung in eine
 * Testdatei"). Die Quelle ist `RADIO_ENV` in `e2e/helpers/radio.ts` — derselbe Wert, den
 * `webServer.env` dem Server gibt (`playwright.config.ts:326`, `...RADIO_ENV`), also genau
 * die Zahl, gegen die der Server rechnet: `ausleihGueltigkeitSekunden()` ist
 * `grenzen().ausleihSitzungStunden * 3600` (`_lib/ausleihSitzung.ts:97-99`).
 */
const ERWARTETE_SITZUNG_SEKUNDEN = Number(RADIO_ENV.RADIO_AUSLEIH_SITZUNG_STUNDEN) * 3600;

/** Die aeusseren Pfade der drei Ausleihstationen — sie stehen zweimal (GET und POST). */
const PFAD_AUSLEIHEN = "/ausleihen";
const PFAD_RUECKGABE = "/rueckgabe";

const GATE_CODEFELD = "[data-rolle='gate-code']";
const AUSWAHLZEILE_FREI = "[data-rolle='radio-auswahlzeile'][data-frei='ja']";
/** Das sichtbare Namensfeld traegt keinen `name`; sein `id` ist der stabile Griff
 *  (`src/app/m/radio/_ui/EntleiherFeld.tsx:138`, gemessen ebenso in
 *  `_ui/AusleihVorgang.test.tsx:46`). */
const NAMENSFELD = "#radio-entleiher";
const ENTLEIHER_WERT = "[data-rolle='radio-entleiher-wert']";
const AUSWAHL_WERT = "[data-rolle='radio-auswahl-wert']";
const AUSLEIHEN_KNOPF = "[data-rolle='radio-ausleihen']";
const GEBUCHT_ZEILE = "[data-rolle='radio-gebucht']";
const RUECKGABE_SENDEN = "[data-rolle='radio-rueckgabe-senden']";
const RUECKGABE_ERFOLG = "[data-rolle='radio-rueckgabe-erfolg']";

test.describe("radio-Kiosk", () => {
  test("Code am Gate einloesen, Geraeteliste, ausleihen, zurueckgeben", async ({ page }) => {
    /*
     * ⛔ EIN LAUFEIGENER NAME, UND ER IST DER SCHLUESSEL JEDER DB-ZUSAGE UNTEN (Falle 4).
     * Er entsteht IM Testkoerper und nicht auf Modulebene: ein `retry` bekommt damit einen
     * eigenen Namen und laeuft nicht auf der Zeile des vorherigen Versuchs.
     * ⛔ OHNE UMLAUT — die eiserne Regel gilt fuer zitierte Werte.
     */
    const entleiher = `Kiosk T2 ${Date.now()}`;

    expect(
      Number.isFinite(ERWARTETE_SITZUNG_SEKUNDEN) && ERWARTETE_SITZUNG_SEKUNDEN > 0,
      "RADIO_AUSLEIH_SITZUNG_STUNDEN fehlt in RADIO_ENV — die Sitzungszusage haette keinen Bezugswert",
    ).toBe(true);

    /* ────────── STATION 1 von 4: das Gate, ANONYM (Zusage 3) ──────────
     *
     * ⛔ SIE STEHT VOR JEDER EINLOESUNG, und die Reihenfolge ist tragend: sobald das
     * Cookie im Kontext liegt, leitet dieselbe Seite auf `/geraete` weiter
     * (`src/app/m/radio/page.tsx:75-76`, Datei 160 Zeilen). Anonym ist „kein Zugang" hier
     * der REGELFALL (`Spec:2407`) — und genau das ist die Zusage: kein Login-Riegel.
     */
    const gate = await page.goto(radioUrl("/"));
    expect(gate?.status(), "Station 1 — das Gate antwortet dem anonymen Abruf nicht mit 200").toBe(
      200,
    );
    await expect(
      page.locator(GATE_CODEFELD),
      "Station 1 — das Codefeld fehlt; der anonyme Abruf ist irgendwo anders gelandet",
    ).toBeVisible();

    /*
     * ⛔ WARMLAUF DER EINLOESE-ROUTE (Falle 10a). Er darf denselben Code nehmen, weil
     * Codes NICHT verbraucht werden (`_lib/schreibpfade/codeEinloesung.ts:64`, `:70`) —
     * ohne diesen Beleg saehe der Warmlauf aus, als entwerte er die Vorbedingung der
     * Messung darunter. Seine Antwort wird bewusst verworfen: gemessen wird die zweite.
     */
    await page.request.get(radioUrl(`/m/radio/t/${E2E_CODE_AKTIV}`), { maxRedirects: 0 });

    /* ────────── ZUSAGEN 1, 2 und 6: die Antwort der Einloese-Route ──────────
     *
     * ⛔ `maxRedirects: 0` IST PFLICHT (Bauform-Zulaessigkeitstafel Nr. 27). Playwrights
     * `page.request.get` FOLGT Umleitungen standardmaessig; der Fall saehe dann den Status
     * der ENDSEITE (200) und DEREN Kopfzeilen — nie die 303 und nie ihr `Set-Cookie`. Das
     * Haus schreibt den Griff aus: `e2e/lagerbuch-helfer.spec.ts:187` („`page.request` MIT
     * `maxRedirects: 0`, NICHT `page.on(\"response\")`"), Fall `:194-201`; ebenso
     * `e2e/radio-verwaltung.spec.ts:1137` und `:1148`.
     */
    const einloesung = await page.request.get(radioUrl(`/m/radio/t/${E2E_CODE_AKTIV}`), {
      maxRedirects: 0,
    });

    // Zusage 1 — 303, nicht 302: die Antwort auf ein GET soll auch nach dem Folgen ein GET
    // sein (`src/app/m/radio/t/[code]/route.ts:157-161`, Datei 162 Zeilen).
    expect(
      einloesung.status(),
      "Zusage 1 — die Einloese-Route antwortet nicht mit 303",
    ).toBe(303);
    const ziel = einloesung.headers()["location"];
    /*
     * ⛔ RELATIV, UND MIT GENAU EINEM SCHRAEGSTRICH. Ein blosses `/^\//` liesse ein
     * protokoll-relatives `//fremder-host/pfad` durch — das ist keine relative Adresse,
     * sondern eine offene Weiterleitung. Dieselbe Form prueft `e2e/lagerbuch-helfer.spec.ts:214`.
     */
    expect(ziel, "Zusage 1 — das Location ist nicht relativ").toMatch(/^\/(?!\/)/);
    expect(ziel, "Zusage 1 — das Location ist absolut").not.toMatch(/^https?:/);
    /*
     * ⬜ T-L2, gemessen: das Ziel ist `/` und NICHT `/geraete`. Die Route kennt kein
     * hinterlegtes Codeziel; ohne `?returnTo=` leitet sie auf `/`
     * (`t/[code]/route.ts:137`), und die Gate-Weiche schickt von dort mit gueltigem Zugang
     * weiter auf `/geraete` (Entscheidung E1, `src/app/m/radio/page.tsx:76`).
     */
    expect(ziel, "Zusage 1 — das Ziel der Einloesung ist nicht die Gate-Weiche").toBe("/");

    /*
     * Zusage 2 — ⛔ `headersArray()` UND NICHT `headers()`. Playwright faltet
     * Mehrfachkopfzeilen in `headers()` mit „, " zusammen, und genau daran saehe eine
     * `Domain=`-Pruefung vorbei (`e2e/lagerbuch-helfer.spec.ts:189-192`).
     */
    const setzeCookie = einloesung
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie");
    const sitzungsCookie = setzeCookie.find((h) => h.value.includes(AUSLEIH_COOKIE_ANFANG));
    expect(
      sitzungsCookie,
      "Zusage 2 — dieselbe Antwort traegt kein Set-Cookie der Ausleih-Sitzung",
    ).toBeTruthy();
    /*
     * ⛔ OHNE `Domain=` — HOST-ONLY (§8.7 Nr. 2, `Spec:2437-2447`). Ein `Domain=`-Attribut
     * streute die Kiosk-Sitzung ueber ALLE Suite-Hosts; das host-only Cookie ist die
     * ZWEITE Haelfte des Host-Riegels (`t/[code]/route.ts:55-62`).
     */
    expect(
      sitzungsCookie!.value.toLowerCase(),
      "Zusage 2 — das Sitzungscookie traegt ein Domain-Attribut",
    ).not.toContain("domain=");

    /*
     * Zusage 6 — die Sitzungsdauer, RELATIV zum konfigurierten Wert. Die Zahl `12` steht
     * in dieser Datei nirgends; sie kommt aus `RADIO_ENV` (siehe
     * `ERWARTETE_SITZUNG_SEKUNDEN` oben).
     */
    const maxAge = /(?:^|;\s*)max-age=(\d+)/i.exec(sitzungsCookie!.value)?.[1];
    expect(maxAge, "Zusage 6 — das Sitzungscookie traegt kein Max-Age").toBeTruthy();
    expect(
      Number(maxAge),
      "Zusage 6 — die Cookie-Gueltigkeit passt nicht zum konfigurierten RADIO_AUSLEIH_SITZUNG_STUNDEN",
    ).toBe(ERWARTETE_SITZUNG_SEKUNDEN);

    /* ────────── STATION 2 von 4: die Geraeteliste (Zusage 3) ────────── */
    const uebersicht = await page.goto(radioUrl("/geraete"));
    expect(
      uebersicht?.status(),
      "Station 2 — /geraete antwortet der eingeloesten Sitzung nicht mit 200",
    ).toBe(200);
    await expect(
      page.locator("[data-rolle='radio-liste']"),
      "Station 2 — die Geraeteliste fehlt",
    ).toBeVisible();

    /* ────────── STATION 3 von 4: ausleihen (Zusage 3) ──────────
     *
     * ⛔ DIESER GET IST ZUGLEICH DER WARMLAUF DER AUSLEIH-ACTION (Falle 10a): die Server
     * Action postet auf DIESELBE Route, und ihre Erstuebersetzung faellt damit hierher
     * statt in das Zeitbudget des POST.
     */
    const ausleihseite = await page.goto(radioUrl(PFAD_AUSLEIHEN));
    expect(
      ausleihseite?.status(),
      "Station 3 — /ausleihen antwortet der eingeloesten Sitzung nicht mit 200",
    ).toBe(200);

    /*
     * ⛔ DIE VORBEDINGUNG WIRD GEMESSEN, NICHT ANGENOMMEN (Falle 4): vor diesem Schritt
     * gibt es zu diesem Namen KEINE Zeile. Ohne sie waere „nach dem Buchen existiert eine
     * Zeile" auch dann gruen, wenn der POST nichts getan haette und die Zeile aus einem
     * frueheren Versuch staende.
     */
    expect(
      leihZeile(entleiher),
      "Vorbedingung — zu diesem laufeigenen Namen darf noch keine Leihzeile bestehen",
    ).toBeUndefined();

    /*
     * ⛔ ERST DAS GERAET, DANN DER NAME: ohne gewaehltes Geraet ist das Namensfeld tot
     * (`_ui/EntleiherFeld.tsx:85`, `gesperrt`). Die Auswahl schreibt sich mit
     * `router.replace` in die URL zurueck — deshalb `klickeWennRuhig` (Falle 12).
     */
    const erstesFreies = page.locator(AUSWAHLZEILE_FREI).first();
    await klickeWennRuhig(erstesFreies);
    await klickeWennRuhig(page.locator(NAMENSFELD));
    await page.locator(NAMENSFELD).fill(entleiher);

    /*
     * ⛔ DIE ZWEI VERSTECKTEN FELDER SIND DER VERTRAG MIT DER ACTION
     * (`_ui/AusleihVorgang.tsx:261-262`). Sie werden VOR dem Absenden geprueft: ein
     * verschluckter Name saehe sonst aus wie ein Serverfehler, und ein leeres
     * Auswahlfeld liesse den Knopf gesperrt in ein Zeitbudget laufen.
     */
    await expect(
      page.locator(ENTLEIHER_WERT),
      "das versteckte Namensfeld traegt den getippten Namen nicht",
    ).toHaveValue(entleiher);
    await expect(
      page.locator(AUSWAHL_WERT),
      "das versteckte Auswahlfeld ist leer — es wurde kein Geraet uebernommen",
    ).not.toHaveValue("");

    /*
     * ⛔ FALLE 10b — DIE ANTWORT WIRD GEPRUEFT, NICHT DIE FOLGEWIRKUNG.
     *
     * ⚠️ UND DER FILTER MUSS DEN ZWEITEN POST DIESER SEITE AUSSCHLIESSEN: das Namensfeld
     * ruft nach `VERZOEGERUNG_MS` die Vorschlags-Action auf (`_ui/EntleiherFeld.tsx:117`),
     * die auf DENSELBEN Pfad postet. Sie traegt ihr Argument als serialisierten Aufruf und
     * NICHT als Formulardaten; nur der Formular-POST fuehrt den Feldnamen `entleiher`
     * (`_ui/AusleihVorgang.tsx:262`). Ohne diesen Filter bestaetigte der Fall womoeglich
     * die Antwort des Vorschlagsabrufs und liesse den eigentlichen POST ungeprueft.
     *
     * ⚠️ DER STATUSCODE STEHT ALS `ok()` UND NICHT ALS ZAHL: eine Server Action mit
     * `redirect()` waehlt ihre Antwortform selbst (`_actions/ausleihe.ts:218`), und eine
     * hier festgeschriebene Zahl waere eine Zusage ueber eine Bauform, die dieses Repo
     * nicht festlegt — dieselbe Auflage wie in `e2e/radio-verwaltung.spec.ts` bei „V-L3 A".
     * Ein abgebrochener POST (Falle 10) haette GAR KEINE Antwort und liefe hier ins
     * Zeitbudget; ein Serverfehler waere 500 und damit nicht `ok()`.
     */
    const [ausleihAntwort] = await Promise.all([
      page.waitForResponse(
        (antwort) =>
          antwort.request().method() === "POST" &&
          new URL(antwort.url()).pathname === PFAD_AUSLEIHEN &&
          (antwort.request().postData() ?? "").includes("entleiher"),
      ),
      klickeWennRuhig(page.locator(AUSLEIHEN_KNOPF)),
    ]);
    expect(
      ausleihAntwort.ok(),
      `die Ausleih-Action antwortete mit ${ausleihAntwort.status()} statt mit einer Erfolgsantwort`,
    ).toBe(true);

    /*
     * Die Folgewirkung steht ZUSAETZLICH da, nicht anstelle der Antwortpruefung: die
     * Action leitet auf `/geraete?gebucht=<n>` (`_actions/ausleihe.ts:218`).
     */
    await page.waitForURL(/\/geraete\?gebucht=/);
    await expect(
      page.locator(GEBUCHT_ZEILE),
      "die Erfolgszeile der Uebersicht fehlt nach dem Buchen",
    ).toBeVisible();

    /*
     * ⛔ ZUSAGE 4, ERSTE HAELFTE — DIREKT AUS DER DB, DIFFERENZIELL. Die Zeile gab es vor
     * dem POST nicht (Vorbedingung oben); jetzt gibt es sie, und sie ist AKTIV
     * (`returned_at IS NULL` heisst „aktive Leihe", `_db/schema.ts:199`).
     */
    const nachAusleihe = leihZeile(entleiher);
    expect(
      nachAusleihe,
      "Zusage 4 — die Ausleihe hat keine Zeile in `loans` erzeugt",
    ).toBeTruthy();
    expect(
      nachAusleihe!.returned_at,
      "Zusage 4 — die frische Leihe ist nicht aktiv (returned_at ist bereits gesetzt)",
    ).toBeNull();

    /* ────────── STATION 4 von 4: die Rueckgabe (Zusage 3) ──────────
     *
     * ⛔ AUCH DIESER GET IST DER WARMLAUF SEINER ACTION (Falle 10a).
     */
    const rueckgabeseite = await page.goto(radioUrl(PFAD_RUECKGABE));
    expect(
      rueckgabeseite?.status(),
      "Station 4 — /rueckgabe antwortet der eingeloesten Sitzung nicht mit 200",
    ).toBe(200);

    /*
     * ⛔ ZUSAGE 4, ZWEITE HAELFTE — DIE LISTE AKTIVER LEIHEN ZEIGT GENAU DIESE ZEILE. Der
     * Griff ist die `id` aus der DB und nicht der Rufname: ein Rufname kann mehrfach
     * vorkommen, eine `id` nicht, und nur so bezeugt die Karte die Zeile, die DIESER Lauf
     * geschrieben hat (`_ui/RueckgabeListe.tsx:186-187`, `data-id`).
     */
    const karte = page.locator(`[data-rolle='radio-leihkarte'][data-id='${nachAusleihe!.id}']`);
    await expect(
      karte,
      "Zusage 4 — die frische Ausleihe steht nicht in der Liste aktiver Leihen",
    ).toBeVisible();

    /* ────────── ZUSAGE 5: `returned_at` wird bei der Rueckgabe gesetzt ────────── */
    await klickeWennRuhig(karte);
    await expect(
      page.locator(RUECKGABE_SENDEN),
      "der Rueckgabedialog hat sich nicht geoeffnet",
    ).toBeVisible();

    const [rueckgabeAntwort] = await Promise.all([
      page.waitForResponse(
        (antwort) =>
          antwort.request().method() === "POST" &&
          new URL(antwort.url()).pathname === PFAD_RUECKGABE,
      ),
      klickeWennRuhig(page.locator(RUECKGABE_SENDEN)),
    ]);
    expect(
      rueckgabeAntwort.ok(),
      `die Rueckgabe-Action antwortete mit ${rueckgabeAntwort.status()} statt mit einer Erfolgsantwort`,
    ).toBe(true);

    await expect(
      page.locator(RUECKGABE_ERFOLG),
      "die Erfolgszeile der Rueckgabe fehlt",
    ).toBeVisible();

    /*
     * ⛔ GELESEN AUS DER DB, NICHT AUS DER OBERFLAECHE — und DIFFERENZIELL gegen den
     * Zustand vor diesem Schritt: dieselbe `id`, deren `returned_at` oben nachweislich
     * `NULL` war, traegt jetzt einen Wert. „Es gibt irgendeine zurueckgegebene Zeile"
     * waere auf einem veraenderten Bestand auch gruen.
     */
    const nachRueckgabe = leihZeile(entleiher);
    expect(
      nachRueckgabe?.id,
      "Zusage 5 — die Leihzeile ist nach der Rueckgabe verschwunden oder eine andere",
    ).toBe(nachAusleihe!.id);
    expect(
      nachRueckgabe!.returned_at,
      "Zusage 5 — returned_at ist nach der Rueckgabe weiterhin NULL",
    ).not.toBeNull();
  });
});
