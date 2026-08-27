import { existsSync } from "node:fs";
import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";
import { devLogin, klickeWennRuhig } from "./fixtures";
import { E2E_CODE_GESPERRT, RADIO_HOST, radioUrl } from "./helpers/radio";

/**
 * DIE ZWEI WEGE HEREIN UND DIE ZWEI RIEGELFORMEN DER SPERRE — Faelle 2 bis 5 der
 * Zusagentafel (`.superpowers/sdd/planteil5/briefs/KOPF.md`, Aufgabe T3).
 *
 * ⛔ WAS DIESE DATEI EINLOEST, UND WARUM ES BIS HEUTE UNBEWIESEN WAR. ⬜ **Z-L1** (dort auch
 * ⬜ A-L9 genannt) sagt: dass die Ausleih-Riegel bei einem ECHTEN Abruf greifen, ist nicht
 * belegt. Belegt war bisher nur, dass die Zeilen im Quelltext STEHEN —
 * `src/app/m/radio/riegel.test.ts` ist ein Quelltext-Scan, und
 * `src/app/m/radio/(ausleihe)/layout.tsx:38-41` (Datei 46 Zeilen) schreibt die Luecke selbst
 * aus: „Belegt ist, dass die Zeile hier steht (Quelltext-Scan), nicht dass sie wirkt;
 * abgelesen wird das in Planteil 5, beim ersten e2e-Lauf." Diese Datei ist jene Ablesung
 * fuer den Ausleihzweig; T2 (`e2e/radio-kiosk.spec.ts`) hat den Ast selbst getragen.
 *
 * ⛔ DIE DREI NAMEN SIND DIE GEBAUTEN (B7), NICHT DIE VERWORFENEN. Das Praedikat heisst
 * `ausleihZugangOderNull`, die Layout-/Seitenform `requireAusleihZugang`, die Action-Form
 * `requireAusleihSchreibend` — alle drei in `src/app/m/radio/_lib/ausleihZugang.ts`
 * (`:210`, `:236`, `:262`; Datei 267 Zeilen). ⛔ NICHT `requireRadioZugang` (Spec-Kapitel 4
 * und 6) und NICHT `kioskZugangOderNull` (der erste Entwurf von Kapitel 8). Wer hier den
 * falschen Namen in einen Kommentar schreibt, schickt den naechsten Leser in eine Datei,
 * die es nicht gibt.
 *
 * ⛔ DIE ANONYMITAETSZUSAGE (ENTSCHEIDUNG 7) IST DER KERN VON FALL 2, UND SIE IST KEIN
 * STATUSCODE. Spec:6818 woertlich: „angemeldet, mit Zugriff aus der Kachel, ohne Code:
 * Ausleihe erreichbar und **in der Sache anonym** — die Journalzeile traegt den
 * eingetippten Ausleihernamen, nicht die Kennung des Angemeldeten (Entscheidung 7)." Die
 * Journalzeile ist die Zeile in `loans`: `borrower_name` ist der eingetippte Name
 * (`src/app/m/radio/_db/schema.ts:217`, Datei 264 Zeilen), und `zugangscode_id` ist die
 * HERKUNFT des Zugangs, nicht die Identitaet der Person — fuer den Suite-Weg `NULL`
 * (`_db/schema.ts:221-230`, geschrieben in `_actions/ausleihe.ts:190` mit
 * `schreibend.zugang.weg === "code" ? … : null`, Datei 346 Zeilen). ⛔ WER NUR `200`
 * PRUEFT, HAT FALL 2 NICHT GEBAUT — deshalb steht die Zusage hier IN DER DATENBANK und
 * nicht auf dem Bildschirm.
 *
 * ⛔ DIE `aktiv`-VORBEDINGUNG IST EINE MESSUNG, KEINE ANNAHME. `_db/schema.ts:181` fuehrt
 * `aktiv` mit `.default(true)`, und `:178-180` warnt woertlich: „Ein Import oder ein Seed,
 * der alles als aktiv anlegt, reaktiviert still jeden gesperrten Code — und zwar genau die,
 * die gesperrt wurden, weil ein Kaertchen verschwunden ist." Liefe Fall 3 gegen einen
 * AKTIVEN `E2E_CODE_GESPERRT`, waere er gruen aus dem falschen Grund: das Gate zeigte dann
 * gar keine Meldung, sondern leitete weiter — und ein Test, der nur „keine
 * Server-Exception" pruefte, saehe das nicht. Deshalb traegt JEDER Fall unten seine
 * Vorbedingung als eigenes `expect` mit eigener Meldung.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⛔ FALL 4 WIRD UEBER DAS ANTWORTPROTOKOLL GEPRUEFT, NICHT UEBER DIE ENDADRESSE
 * ────────────────────────────────────────────────────────────────────────────
 * Eine Endadresse allein unterscheidet „ueber den Abmelde-Handler umgeleitet" nicht von
 * „direkt am Gate gelandet" — und genau dieser Unterschied IST die Zusage (§8.7 Nr. 2). Der
 * Abmelde-Handler ist der EINZIGE Ort, an dem das tote Cookie verschwindet: eine Server
 * Component darf keines loeschen (`cookies()` ist dort versiegelt, `set`/`delete`/`clear`
 * WERFEN — ausgeschrieben in `src/app/m/radio/abmelden/route.ts:12-27`, Datei 105 Zeilen).
 * Faellt der Umweg weg, bleibt eine tote Cookie-Zeile stehen, und die Endadresse waere
 * trotzdem das Gate.
 *
 * ⛔ DIE FORM IST DIE GEMESSENE DES HAUSES: die Kette wird HOP FUER HOP mit
 * `page.request.get(url, { maxRedirects: 0 })` gefahren (Bauform-Zulaessigkeitstafel Nr.
 * 27). Vorbild ist `e2e/lagerbuch-helfer.spec.ts:285` („DIE KETTE WIRD HOP FUER HOP
 * GEPRUEFT (`maxRedirects: 0` an jeder Stufe)"), die Hops `:302` und `:308` (Datei 523
 * Zeilen). ⚠️ `page.on("response", …)` ist die vom Haus AUSDRUECKLICH VERWORFENE Form —
 * `lagerbuch-helfer.spec.ts:187` woertlich: „`page.request` MIT `maxRedirects: 0`, NICHT
 * `page.on(\"response\")`". ⛔ Das gilt insbesondere fuer die `Set-Cookie`-Zusage mit
 * `Max-Age=0`: sie steht auf der Antwort des ABMELDE-HANDLERS, nicht auf der des Gates —
 * ohne `maxRedirects: 0` folgte `page.request` der Umleitung und saehe nur die Kopfzeilen
 * der Endseite.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⚠️ WAS DIESE DATEI AN DATEN HINTERLAESST — vollstaendig, weil `workers: 1` eine
 * gemeinsame SQLite-Datei bedeutet
 * ────────────────────────────────────────────────────────────────────────────
 *   - ZWEI EIGENE `zugangscodes`-ZEILEN (`CODE_FALL4`, `CODE_FALL5`), beide am Ende
 *     GESPERRT. ⛔ Sie werden NICHT aufgeraeumt, und das ist folgenlos: aus `zugangscodes`
 *     wird nie geloescht (§3.2.4; `_db/schema.ts:221-230` nennt das als Grund dafuer, dass
 *     `loans.zugangscode_id` ueberhaupt ein Fremdschluessel sein darf). ⛔ UND SIE SIND DER
 *     GRUND, WARUM HIER KEIN `E2E_CODE_AKTIV` STEHT: T2 (`e2e/radio-kiosk.spec.ts`) braucht
 *     ihn einloesbar, und `workers: 1` heisst EINE gemeinsame Datei, nicht eine gemeinsame
 *     Reihenfolgezusage.
 *   - ZWEI `loans`-ZEILEN aus Fall 2 (eine gebuchte) — Fall 5 bucht NICHTS, das ist seine
 *     Zusage.
 *   - `zugangscodes.last_used_at` von `CODE_FALL4` und `CODE_FALL5`: bei der Einloesung
 *     gesetzt (`_lib/schreibpfade/codeEinloesung.ts:70`, Datei 77 Zeilen). `E2E_CODE_AKTIV`
 *     bleibt unberuehrt.
 *   - ⚠️ GENAU EIN FEHLVERSUCH AM GATE, und zwar in Fall 3.
 *     `RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN` traegt die Vorgabe **5**
 *     (`src/app/m/radio/_lib/grenzen.ts:82`), und alle Specs teilen sich unter `workers: 1`
 *     denselben Absenderschluessel. ⛔ Wer hier einen zweiten Fehlversuch-Fall anlegt,
 *     riskiert, seine eigene Zusicherung durch seine eigene Vorbedingung („Zu viele
 *     Fehlversuche") zu ersetzen — dieselbe Auflage schreibt `lagerbuch-helfer.spec.ts:32-36`
 *     fuer sich aus. Eine ERFOLGREICHE Einloesung kostet nichts: die drei Zaehler liegen
 *     HINTER der Codepruefung (`_actions/gate.ts:119-124`, Datei 155 Zeilen).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⛔ WELCHE ZEILE WELCHEN FALL TRAEGT — GEMESSEN AM 2026-08-27, NICHT ABGELEITET
 * ────────────────────────────────────────────────────────────────────────────
 * SECHS Mutationssonden — nachgezaehlt, nicht geschaetzt —, je eine Zeile im Produktcode
 * entfernt und danach ein Lauf dieser Datei. ⛔ KEINE ergab 0 rot:
 *
 *   | entfernte Zeile                                          | rot           |
 *   |----------------------------------------------------------|---------------|
 *   | `ausleihZugang.ts:181` — die `!zeile.aktiv`-Haelfte       | Fall 4, Fall 5|
 *   | `codeEinloesung.ts:64` — die `!zeile.aktiv`-Haelfte       | Fall 3        |
 *   | `_actions/ausleihe.ts:124-142` — der Schreibpfad-Riegel   | Fall 5        |
 *   | `_actions/ausleihe.ts:178` — der Name statt der Kennung   | Fall 2        |
 *   | `ausleihZugang.ts:240` — der Umweg ueber `/abmelden`      | Fall 4        |
 *   | `abmelden/route.ts:103` — die Raeumung des Cookies        | Fall 4        |
 *
 * ⚠️ DIE LETZTE STEHT NICHT IM AUFGABENBRIEF und ist trotzdem noetig: die Sonde auf
 * `ausleihZugang.ts:240` faerbt Fall 4 schon an HOP 1 — also bevor die
 * `Max-Age=0`-Zusicherung ueberhaupt gelesen wird — und sagt ueber sie deshalb nichts.
 *
 * ⛔ EINE ABWEICHUNG VOM AUFGABENBRIEF, UND SIE IST GEMESSEN, NICHT BEHAUPTET. Der Brief
 * (`.superpowers/sdd/planteil5/briefs/T3.md`, Sonde S-T3a) erwartet, dass die
 * `!zeile.aktiv`-Haelfte in `_lib/ausleihZugang.ts` FALL 3 rot macht. Das kann sie
 * strukturell nicht: Fall 3 tippt einen gesperrten Code ins Gate-Feld, und dieser Weg laeuft
 * ueber `einloesenAmGate` → `loeseCodeEin` (`_actions/gate.ts:115`) —
 * `_lib/ausleihZugang.ts` liegt gar nicht auf ihm. Der Riegel, den FALL 3 bewacht, steht in
 * `_lib/schreibpfade/codeEinloesung.ts:64`; die Zeile in `ausleihZugang.ts:181` bewacht den
 * LESEPFAD, und der ist Fall 4 (plus Fall 5, weil `requireAusleihSchreibend` denselben Rumpf
 * `befund` benutzt, `ausleihZugang.ts:265`). ⛔ FALL 3 IST DESHALB NICHT AUF DIE ANDERE ZEILE
 * UMGEBAUT WORDEN: die Zusage aus Spec:6819 („benannte deutsche Meldung AM FELD") ist
 * genau die Gate-Meldung, und ein Umbau haette sie gegen eine Umleitungskette getauscht.
 * ⚠️ Beide Zeilen SIND bewacht — nur von den Faellen, auf deren Pfad sie liegen.
 */

/**
 * ⚠️ DER PFAD KOMMT NICHT AUS `moduleDbPath()`. `DATA_DIR=./.data/e2e` steht nur in
 * `playwright.config.ts` (`webServer.env`) und erreicht ausschliesslich den SERVERprozess;
 * im Testprozess ist die Variable nicht gesetzt, `moduleDbPath` liefe auf
 * `./.data/radio.db` und laese EINE ANDERE DATEI als die, in die der Server schreibt.
 * Wortlaut und Vorbild: `e2e/radio-kiosk.spec.ts` (dieselbe Konstante) und
 * `e2e/lagerbuch-hosts.spec.ts:55`.
 *
 * ⛔ KEIN `getDb()` UND KEIN `getModuleDb()` — deren Cache ist per Modulschluessel gekeyt,
 * nicht per `DATA_DIR` (`src/core/db/index.ts:25-36`), und `getDb()` IST
 * `getModuleDb("radio", schema)` (`src/app/m/radio/_db/client.ts:22-24`).
 */
const DB_PFAD = "./.data/e2e/radio.db";

/** Eine frische, schreibgeschuetzte Verbindung je Aufruf — die Zeilen werden VOR und NACH
 *  jedem Schritt gelesen, und ein wiederverwendetes Handle koennte eine gepufferte
 *  (veraltete) Sicht zeigen. Dieselbe Bauform wie `e2e/lagerbuch-helfer.spec.ts:61-72`. */
function lesend<T>(arbeit: (db: Database.Database) => T): T {
  expect(
    existsSync(DB_PFAD),
    `${DB_PFAD} fehlt — laeuft der e2e-Server mit DATA_DIR=./.data/e2e?`,
  ).toBe(true);
  const db = new Database(DB_PFAD, { readonly: true });
  try {
    return arbeit(db);
  } finally {
    db.close();
  }
}

function schreibend<T>(arbeit: (db: Database.Database) => T): T {
  const db = new Database(DB_PFAD);
  try {
    return arbeit(db);
  } finally {
    db.close();
  }
}

/**
 * Die Codezeile, so wie der Riegel sie sieht: ueber den PRIMAERSCHLUESSEL wird
 * nachgeschlagen (`_lib/ausleihZugang.ts:180`), hier ueber `code`, weil der Test den
 * Klartext hat und die `id` erst sucht.
 *
 * ⚠️ `aktiv` KOMMT ALS ZAHL, NICHT ALS `boolean`: Drizzles `mode: "boolean"`
 * (`_db/schema.ts:181`) ist eine Sicht der ORM-Schicht, in der Datei steht ein `integer`.
 * Diese Datei liest mit rohem SQL und vergleicht deshalb gegen `1` und `0`.
 */
function codeZeile(code: string): { id: string; aktiv: number } | undefined {
  return lesend(
    (db) =>
      db.prepare("select id, aktiv from zugangscodes where code = ?").get(code) as
        | { id: string; aktiv: number }
        | undefined,
  );
}

function setzeAktiv(id: string, aktiv: boolean): void {
  schreibend((db) => db.prepare("update zugangscodes set aktiv = ? where id = ?").run(aktiv ? 1 : 0, id));
}

/**
 * Legt einen laufeigenen Zugangscode an und gibt seine `id` zurueck.
 *
 * ⛔ `insert or ignore` PLUS EIN ANSCHLIESSENDES `update … set aktiv = 1`, NICHT EIN BLOSSES
 * `insert`: `zugangscodes.code` traegt `.unique()` (`_db/schema.ts:171`), und unter
 * `--repeat-each` oder `retries` liefe derselbe Fall ein zweites Mal auf einer Datei, in der
 * die Zeile schon steht — und zwar GESPERRT, weil der erste Durchgang sie gesperrt hat. Ein
 * blosses `insert` waere dort ein Constraint-Fehler, ein `insert or ignore` allein liesse
 * die Vorbedingung „aktiv" still falsch werden.
 *
 * ⚠️ `created_at` IN SEKUNDEN, NICHT IN MILLISEKUNDEN: `mode: "timestamp"`
 * (`_db/schema.ts:187`) speichert Sekunden. Ein Millisekundenwert waere typkorrekt, wuerde
 * gespeichert und ergaebe beim Lesen ein Datum im Jahr 55000 — genau die Faktor-1000-Klasse,
 * vor der der Plan an anderer Stelle warnt.
 *
 * ⚠️ `created_by` IST `notNull` (`_db/schema.ts:189`) und ein reines Auditfeld
 * (Entscheidung 7). Der Wert hier ist erkennbar ein Testwert und keine Kennung eines
 * Menschen.
 */
function legeCodeAn(code: string, id: string, bezeichnung: string): string {
  schreibend((db) => {
    db.prepare(
      "insert or ignore into zugangscodes (id, code, bezeichnung, aktiv, created_at, created_by) values (?, ?, ?, 1, ?, ?)",
    ).run(id, code, bezeichnung, Math.floor(Date.now() / 1000), "e2e-t3");
    db.prepare("update zugangscodes set aktiv = 1 where code = ?").run(code);
  });
  const zeile = codeZeile(code);
  expect(zeile, `der laufeigene Code ${code} liess sich nicht anlegen`).toBeTruthy();
  return zeile!.id;
}

/**
 * Die AKTIVE Leihe eines Geraets — `returned_at IS NULL` heisst „aktive Leihe"
 * (`_db/schema.ts:199`). ⛔ Der Griff ist die `device_id` und NICHT der Rufname: nur so
 * bezeugt die Zeile das Geraet, das DIESER Lauf gewaehlt hat, und die Zusicherung auf
 * `borrower_name` bleibt eine Zusicherung ueber den INHALT statt ueber die Existenz.
 * Der partielle Unique-Index `loans_device_active_uidx`
 * (`_db/migrations/0001_loans_aktiv_uidx.sql`) garantiert hoechstens eine solche Zeile.
 */
function aktiveLeihe(
  geraetId: string,
): { id: string; borrower_name: string; zugangscode_id: string | null } | undefined {
  return lesend(
    (db) =>
      db
        .prepare(
          "select id, borrower_name, zugangscode_id from loans where device_id = ? and returned_at is null",
        )
        .get(geraetId) as
        | { id: string; borrower_name: string; zugangscode_id: string | null }
        | undefined,
  );
}

/**
 * Das Ausleih-Sitzungscookie. ⛔ Der Name steht als Literal, weil er der VERTRAG mit dem
 * Browser ist und kein konfigurierter Wert: `AUSLEIH_COOKIE = "radio_ausleihe"`
 * (`src/app/m/radio/_lib/ausleihSitzung.ts:35`, Datei 221 Zeilen). Dieselbe Bauform traegt
 * `e2e/lagerbuch-helfer.spec.ts:220` (`helfer_session=`) und `e2e/radio-kiosk.spec.ts`.
 */
const AUSLEIH_COOKIE_NAME = "radio_ausleihe";
const AUSLEIH_COOKIE_ANFANG = `${AUSLEIH_COOKIE_NAME}=`;

/**
 * DIE ZWEI LAUFEIGENEN CODES, IN DER KANONISCHEN FORM AUS §3.2.1: 28 Zeichen
 * Crockford-Base32 in sieben Vierergruppen, der Bindestrich TEIL des gespeicherten Werts.
 *
 * ⛔ DIE FORM IST NICHT KOSMETIK. `loeseCodeEin` normalisiert NICHT selbst
 * (`_lib/schreibpfade/codeEinloesung.ts:39-47`); der Einloeseweg normalisiert VORHER
 * (`t/[code]/route.ts:108`, Datei 162 Zeilen) und sucht dann auf GLEICHHEIT gegen
 * `zugangscodes.code`. Ein Wert ausserhalb des Alphabets („0123456789ABCDEFGHJKMNPQRSTVWXYZ",
 * ohne I, L, O, U — `_lib/code.ts:53`, Datei 168 Zeilen) ueberlebte die Normalisierung nicht
 * unveraendert, und der Fall fiele an seiner eigenen Vorbedingung statt an der Flaeche, die
 * er misst.
 *
 * ⛔ ZWEI CODES UND NICHT EINER: Fall 4 sperrt seinen Code waehrend einer laufenden Sitzung,
 * Fall 5 waehrend eines ausgefuellten Formulars. Ein gemeinsamer Code machte den zweiten
 * Fall von der Reihenfolge des ersten abhaengig — und eine Reihenfolgeannahme ist genau die
 * Klasse, die `workers: 1` NICHT zusichert.
 */
const CODE_FALL4 = "T3F4-Q7XN-2MHV-9ZKD-5PRW-6BSG-8YCA";
const CODE_FALL5 = "T3F5-K9WM-4RTV-6X2Y-B7HN-3DPZ-J5KW";
const CODE_FALL4_ID = "e2e-t3-fall4";
const CODE_FALL5_ID = "e2e-t3-fall5";

/** Die aeusseren Pfade. `radio` liegt hinter einem Modul-Host-Rewrite; der Browser sieht
 *  `/geraete`, Next sieht `/m/radio/geraete` (`_actions/ausleihe.ts:86`, `LISTENPFAD`). */
const PFAD_GATE = "/";
const PFAD_GERAETE = "/geraete";
const PFAD_AUSLEIHEN = "/ausleihen";

const GATE_CODEFELD = "[data-rolle='gate-code']";
const GATE_WEITER = "[data-rolle='gate-weiter']";
const GATE_MELDUNG = "[data-rolle='gate-meldung']";
const AUSWAHLZEILE_FREI = "[data-rolle='radio-auswahlzeile'][data-frei='ja']";
/** Das sichtbare Namensfeld traegt keinen `name`; sein `id` ist der stabile Griff
 *  (`src/app/m/radio/_ui/EntleiherFeld.tsx:138`). */
const NAMENSFELD = "#radio-entleiher";
const ENTLEIHER_WERT = "[data-rolle='radio-entleiher-wert']";
const AUSWAHL_WERT = "[data-rolle='radio-auswahl-wert']";
const AUSLEIHEN_KNOPF = "[data-rolle='radio-ausleihen']";
const AUSLEIH_FEHLER = "[data-rolle='radio-ausleih-fehler']";

/**
 * DER SATZ ZU `gesperrt`, EINMAL — und er steht in dieser Datei als Literal, weil er
 * BILDSCHIRMTEXT ist und deshalb seine Umlaute behaelt (Ausnahme der Hausregel). Seine
 * Quelle ist `src/app/m/radio/_lib/gateTexte.ts:71` (Datei 113 Zeilen); `_lib/meldungen.ts:297`
 * (Datei 503 Zeilen) schreibt ihn ausdruecklich NICHT ab, sondern holt ihn ueber
 * `gateMeldung("gesperrt", null)!` — deshalb ist derselbe Satz die Zusage an BEIDEN
 * Meldungsorten dieser Datei (Gate und Ausleihformular).
 *
 * ⛔ DER SATZ ZU `code` IST EIN ANDERER, UND DER UNTERSCHIED IST FACHLICH
 * (`gateTexte.ts:63-67`): am Gate weiss der Einloeseweg nur „unbekannt ODER gesperrt";
 * im Lesepfad wurde die Codezeile gelesen, dort steht es genau. Wer die zwei zusammenlegt,
 * verliert die Auskunft des zweiten Falls.
 */
const SATZ_CODE_UNBEKANNT_ODER_GESPERRT =
  "Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung.";
const SATZ_GESPERRT = "Dieser Zugangs-Code wurde gesperrt. Wende dich an die Leitung.";

/**
 * ⬜ T-L2, GEMESSEN STATT ERFUNDEN: der Statuscode, mit dem `redirect()` aus einer SERVER
 * COMPONENT auf einen GET antwortet. ⚠️ ABGELESEN AM 2026-08-27 beim ersten Lauf dieser
 * Datei: **307**, nicht 303 — der 303 des Abmelde-Handlers (Hop 2 unten) kommt aus einer
 * SELBST GEBAUTEN Antwort (`abmelden/route.ts:88`) und ist deshalb ein anderer Wert. Er
 * steht als KONSTANTE da, weil ihn zwei Hops derselben Kette teilen und zwei Literale beim
 * naechsten Next-Sprung auseinanderliefen.
 *
 * ⛔ ER WIRD MIT `toBe` GEPRUEFT UND NICHT MIT EINEM BEREICH. `toBeGreaterThanOrEqual(300)`
 * plus `toBeLessThan(400)` ist die Form des Vorbilds (`lagerbuch-helfer.spec.ts:303-304`),
 * und sie ist hier zu schwach: sie kann einen 302 nicht von einem 307 unterscheiden, und
 * genau der Unterschied entscheidet, ob der Browser die Methode beibehaelt. NT11
 * (`riegel.test.ts`) verbietet diese Aufweichung fuer Zaehlzusagen ausdruecklich; die
 * Begruendung traegt hier genauso.
 */
const UMLEITUNG_SERVER_COMPONENT = 307;

test.describe("radio-Zugang", () => {
  /* ══════════════════════════════════════════════════════════════════════════
   * FALL 2 — der ZWEITE Weg herein (Spec §3.5), und die Anonymitaet in der Sache
   * ══════════════════════════════════════════════════════════════════════════ */
  test("Zugang ueber die Suite-Kachel, ohne Code", async ({ page }) => {
    /*
     * ⛔ EIN LAUFEIGENER NAME UND EINE LAUFEIGENE KENNUNG. Der Name ist der Schluessel der
     * DB-Zusage unten; die Kennung ist das, was dort NICHT stehen darf. Beide entstehen IM
     * Testkoerper, damit ein `retry` nicht auf der Zeile des vorherigen Versuchs laeuft.
     * ⛔ OHNE UMLAUT — die eiserne Regel gilt fuer zitierte Werte.
     */
    const entleiher = `Suite T3 ${Date.now()}`;
    const email = "t3-suite@localtest.me";
    /*
     * Die Kennung, die der Server aus dieser Anmeldung baut: `dev:${email}`
     * (`src/core/auth/config.ts:63`). Sie ist der `sub` der Suite-Sitzung und damit genau
     * der Wert, den `_lib/ausleihZugang.ts:150` als `weg: "suite"` fuehrt.
     */
    const kennung = `dev:${email}`;

    /*
     * ⛔ `groups: ""` UND NICHT `groups: []` (Bauform-Zulaessigkeitstafel Nr. 20): die
     * Signatur nimmt einen String (`e2e/fixtures.ts:5`).
     * ⛔ UND OHNE JEDE GRUPPE, DAS IST DIE ZUSAGE: fuer `weg: "suite"` wird KEINE Gruppe
     * verlangt (Auflage 5, `_lib/ausleihZugang.ts:138-142`) — `radio` steht mit
     * `requiresAuth: false` in der Registry, und die Ausleihe ist absichtlich anonym. Eine
     * Anmeldung MIT `RADIO_ADMIN_GRUPPE` bewiese den Fall nicht: sie liesse offen, ob die
     * Gruppe oder die blosse Sitzung den Zugang traegt.
     */
    await devLogin(page, { host: RADIO_HOST, email, groups: "" });

    /*
     * ⛔ VORBEDINGUNG 1 — KEIN AUSLEIH-COOKIE IM KONTEXT. Sie ersetzt die
     * „Code aktiv/gesperrt"-Messung der drei anderen Faelle, weil dieser Fall gar keinen
     * Code benutzt, und sie ist die tragende: laege ein `radio_ausleihe` im Kontext, ginge
     * `befund` zwar TROTZDEM ueber die Suite-Sitzung herein (Schritt 2 steht vor Schritt 3,
     * `_lib/ausleihZugang.ts:148-155`) — aber der Fall koennte das nicht mehr belegen, und
     * die Zusage „ohne Code" waere unbewiesen.
     */
    const kekse = await page.context().cookies();
    expect(
      kekse.find((k) => k.name === AUSLEIH_COOKIE_NAME),
      "Vorbedingung — dieser Fall geht OHNE Ausleih-Cookie herein; es liegt eines im Kontext",
    ).toBeUndefined();

    /*
     * ⛔ DIE ERREICHBARKEIT, UND ZWAR AN DER WEICHE. `/` ist das Gate; mit gueltigem Zugang
     * leitet es selbst auf `/geraete` weiter (`src/app/m/radio/page.tsx:75-76`, Datei 160
     * Zeilen). Dass der Abruf DORT landet, ist der Beleg, dass `ausleihZugangOderNull` die
     * Suite-Sitzung als Zugang gelten laesst — eine 200 auf `/` waere das Gegenteil.
     */
    const weiche = await page.goto(radioUrl(PFAD_GATE));
    expect(
      weiche?.status(),
      "Fall 2 — die Gate-Weiche antwortet der Suite-Sitzung nicht mit 200",
    ).toBe(200);
    expect(
      new URL(page.url()).pathname,
      "Fall 2 — die Suite-Sitzung wurde an der Gate-Weiche nicht als Zugang anerkannt",
    ).toBe(PFAD_GERAETE);

    /*
     * ⛔ DIESER GET IST ZUGLEICH DER WARMLAUF DER AUSLEIH-ACTION (Falle 10a): die Server
     * Action postet auf DIESELBE Route, und ihre Erstuebersetzung faellt damit hierher
     * statt in das Zeitbudget des POST.
     */
    const ausleihseite = await page.goto(radioUrl(PFAD_AUSLEIHEN));
    expect(
      ausleihseite?.status(),
      "Fall 2 — /ausleihen antwortet der Suite-Sitzung nicht mit 200",
    ).toBe(200);
    expect(
      new URL(page.url()).pathname,
      "Fall 2 — der Abruf ist nicht auf /ausleihen geblieben (Umweg ans Gate?)",
    ).toBe(PFAD_AUSLEIHEN);

    /*
     * ⛔ ERST DAS GERAET, DANN DER NAME: ohne gewaehltes Geraet ist das Namensfeld gesperrt
     * (`_ui/AusleihVorgang.tsx:428`, Datei 494 Zeilen). Die Auswahl schreibt sich mit
     * `router.replace` in die URL zurueck — deshalb `klickeWennRuhig` (Falle 12).
     */
    const erstesFreies = page.locator(AUSWAHLZEILE_FREI).first();
    await klickeWennRuhig(erstesFreies);
    await klickeWennRuhig(page.locator(NAMENSFELD));
    await page.locator(NAMENSFELD).fill(entleiher);

    await expect(
      page.locator(ENTLEIHER_WERT),
      "das versteckte Namensfeld traegt den getippten Namen nicht",
    ).toHaveValue(entleiher);
    const auswahlWert = await page.locator(AUSWAHL_WERT).inputValue();
    expect(auswahlWert, "es wurde kein Geraet uebernommen").not.toBe("");
    /*
     * ⛔ DER GRIFF FUER DIE DB-ZUSAGE. `auswahlSchreiben` verbindet die Ids mit Komma
     * (`_lib/auswahl.ts:112-113`, Datei 114 Zeilen); hier ist genau eine gewaehlt.
     */
    const geraetId = auswahlWert.split(",")[0];

    /*
     * ⛔ VORBEDINGUNG 2 — DAS GERAET HAT KEINE AKTIVE LEIHE. Ohne sie waere „nach dem Buchen
     * gibt es eine Zeile" auch dann gruen, wenn der POST nichts getan haette und die Zeile
     * aus dem Seed staende. ⚠️ Die Auswahlzeile traegt `data-frei='ja'`; diese Messung
     * bestaetigt das in der DATENBANK, statt der Oberflaeche zu glauben.
     */
    expect(
      aktiveLeihe(geraetId),
      "Vorbedingung — das gewaehlte Geraet fuehrt bereits eine aktive Leihe",
    ).toBeUndefined();

    /*
     * ⛔ FALLE 10b — DIE ANTWORT WIRD GEPRUEFT, NICHT DIE FOLGEWIRKUNG
     * (Bauform-Zulaessigkeitstafel Nr. 22). ⚠️ Der Filter schliesst den ZWEITEN POST dieser
     * Seite aus: das Namensfeld ruft die Vorschlags-Action auf, die auf DENSELBEN Pfad
     * postet (`_ui/EntleiherFeld.tsx:120`). Nur der Formular-POST fuehrt den Feldnamen
     * `entleiher` (`_ui/AusleihVorgang.tsx:262`).
     */
    const [antwort] = await Promise.all([
      page.waitForResponse(
        (a) =>
          a.request().method() === "POST" &&
          new URL(a.url()).pathname === PFAD_AUSLEIHEN &&
          (a.request().postData() ?? "").includes("entleiher"),
      ),
      klickeWennRuhig(page.locator(AUSLEIHEN_KNOPF)),
    ]);
    expect(
      antwort.ok(),
      `die Ausleih-Action antwortete mit ${antwort.status()} statt mit einer Erfolgsantwort`,
    ).toBe(true);
    await page.waitForURL(/\/geraete\?gebucht=/);

    /* ══════ DIE ZUSAGE DES FALLS — IN DER DATENBANK, NICHT AUF DEM BILDSCHIRM ══════ */
    const zeile = aktiveLeihe(geraetId);
    expect(zeile, "Fall 2 — die Ausleihe hat keine Zeile in `loans` erzeugt").toBeTruthy();
    /*
     * ⛔ DIE ANONYMITAET IN DER SACHE, ERSTE HAELFTE (Entscheidung 7): die Journalzeile
     * traegt den EINGETIPPTEN Namen. Schriebe die Action stattdessen die Kennung des
     * Angemeldeten, staende hier `dev:t3-suite@localtest.me` — die Meldung nennt beides,
     * damit ein roter Lauf ohne zweiten Blick lesbar ist.
     */
    expect(
      zeile!.borrower_name,
      `Fall 2 — die Journalzeile traegt nicht den eingetippten Namen (erwartet "${entleiher}", die Kennung waere "${kennung}")`,
    ).toBe(entleiher);
    expect(
      zeile!.borrower_name,
      "Fall 2 — die Journalzeile traegt die Kennung des Angemeldeten",
    ).not.toContain(kennung);
    /*
     * ⛔ ZWEITE HAELFTE: `zugangscode_id` ist die HERKUNFT des Zugangs, nicht die Identitaet
     * der Person (`_db/schema.ts:225-233`). Fuer den Suite-Weg ist sie `NULL`
     * (`_actions/ausleihe.ts:190`). Diese Zeile ist zugleich der Beleg, dass der Vorgang
     * WIRKLICH ueber Weg 2 lief und nicht ueber ein liegengebliebenes Code-Cookie.
     */
    expect(
      zeile!.zugangscode_id,
      "Fall 2 — die Leihe traegt eine Zugangscode-Herkunft; sie lief nicht ueber die Suite-Sitzung",
    ).toBeNull();
  });

  /* ══════════════════════════════════════════════════════════════════════════
   * FALL 3 — der gesperrte Code am Gate
   * ══════════════════════════════════════════════════════════════════════════ */
  test("gesperrter Code am Gate", async ({ page }) => {
    /*
     * ⛔ DIE VORBEDINGUNG IST DIE GANZE AUSSAGEKRAFT DIESES FALLS. Liefe er gegen einen
     * AKTIVEN Code, loeste das Gate ihn ein und leitete weiter — und ein Fall, der nur
     * „keine Server-Exception" prueft, waere dabei gruen. `_db/schema.ts:181` fuehrt `aktiv`
     * mit `.default(true)`, `:178-180` warnt vor genau diesem Seed-Fehler.
     */
    const zeile = codeZeile(E2E_CODE_GESPERRT);
    expect(zeile, `der Seed muss ${E2E_CODE_GESPERRT} fuehren`).toBeTruthy();
    expect(
      zeile!.aktiv,
      "Vorbedingung — E2E_CODE_GESPERRT traegt aktiv = 1; der Seed hat den gesperrten Code still reaktiviert",
    ).toBe(0);

    const gate = await page.goto(radioUrl(PFAD_GATE));
    expect(gate?.status(), "Fall 3 — das Gate antwortet dem anonymen Abruf nicht mit 200").toBe(
      200,
    );
    expect(
      new URL(page.url()).pathname,
      "Fall 3 — der anonyme Abruf ist nicht auf dem Gate geblieben",
    ).toBe(PFAD_GATE);

    await page.locator(GATE_CODEFELD).fill(E2E_CODE_GESPERRT);

    /*
     * ⛔ DIE ANTWORT WIRD GEPRUEFT, NICHT NUR DIE FOLGEWIRKUNG (Falle 10b,
     * Bauform-Zulaessigkeitstafel Nr. 22). Eine abgebrochene Action haette GAR KEINE Antwort
     * und liefe still ins Zeitbudget; ein Wurf im Riegel waere 500 und damit nicht `ok()`.
     * ⚠️ `ok()` UND KEINE ZAHL: eine Server Action waehlt ihre Antwortform selbst, und eine
     * hier festgeschriebene Zahl waere eine Zusage ueber eine Bauform, die dieses Repo nicht
     * festlegt — dieselbe Auflage wie bei „V-L3 A" in `e2e/radio-verwaltung.spec.ts`.
     */
    const [antwort] = await Promise.all([
      page.waitForResponse(
        (a) => a.request().method() === "POST" && new URL(a.url()).pathname === PFAD_GATE,
      ),
      klickeWennRuhig(page.locator(GATE_WEITER)),
    ]);
    expect(
      antwort.ok(),
      `Fall 3 — das Gate antwortete mit ${antwort.status()}; ein gesperrter Code ist ein Betriebsfall, kein Serverfehler`,
    ).toBe(true);

    /*
     * ⛔ „KEIN SERVER-EXCEPTION" WIRD AUSDRUECKLICH ZUGESICHERT, weil genau das der Bestand
     * war, den diese Zusage ersetzt (`e2e/lagerbuch-helfer.spec.ts:250-252` schreibt die
     * alte Fassung aus: dort war der ABSTURZ die erwartete Ausgabe).
     */
    await expect(
      page.getByText(/server-side exception/i),
      "Fall 3 — die Seite zeigt eine englische Fehlerseite statt der deutschen Meldung",
    ).toHaveCount(0);

    /*
     * ⛔ DIE MELDUNG STEHT AM FELD, und der Ort ist tragend: `data-rolle="gate-meldung"` ist
     * derselbe Ort, an dem auch ein `?grund=`-Satz aus der URL erscheint
     * (`_ui/GateFormular.tsx:148-152`, Datei 163 Zeilen). ⚠️ `toHaveText` und nicht
     * `toContainText`: der Wortlaut ist die Zusage, nicht seine Anwesenheit.
     */
    await expect(
      page.locator(GATE_MELDUNG),
      "Fall 3 — die benannte deutsche Meldung fehlt am Codefeld",
    ).toHaveText(SATZ_CODE_UNBEKANNT_ODER_GESPERRT);

    /*
     * ⛔ UND KEINE STUMME LANDUNG: der Abruf bleibt auf dem Gate. Ohne diese Zeile waere der
     * Fall auch dann gruen, wenn die Action den Code eingeloest und weitergeleitet haette
     * und die Meldung aus einem frueheren Zustand staende.
     */
    expect(
      new URL(page.url()).pathname,
      "Fall 3 — der gesperrte Code hat das Gate verlassen",
    ).toBe(PFAD_GATE);
  });

  /* ══════════════════════════════════════════════════════════════════════════
   * FALL 4 — Sperrung WAEHREND einer laufenden Sitzung, geprueft am Antwortprotokoll
   * ══════════════════════════════════════════════════════════════════════════ */
  test("Code sperren waehrend laufender Sitzung, dann neu laden", async ({ page }) => {
    const id = legeCodeAn(CODE_FALL4, CODE_FALL4_ID, "T3 Fall 4 (Sperrung waehrend der Sitzung)");
    expect(
      codeZeile(CODE_FALL4)!.aktiv,
      "Vorbedingung — der laufeigene Code muss VOR der Sperrung aktiv sein",
    ).toBe(1);

    /*
     * ⛔ `maxRedirects: 0` AN JEDER STUFE (Bauform-Zulaessigkeitstafel Nr. 27). Schon hier:
     * ohne ihn folgte `page.request` der 303 und diese Zeile bezeugte den Status der
     * Endseite.
     */
    const einloesung = await page.request.get(radioUrl(`/m/radio/t/${CODE_FALL4}`), {
      maxRedirects: 0,
    });
    expect(
      einloesung.status(),
      "Vorbedingung — die Einloesung des laufeigenen Codes antwortet nicht mit 303",
    ).toBe(303);
    /*
     * ⛔ `headersArray()` UND NICHT `headers()`: Playwright faltet Mehrfachkopfzeilen in
     * `headers()` mit „, " zusammen (`e2e/lagerbuch-helfer.spec.ts:189-192`).
     */
    const gesetzt = einloesung
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .find((h) => h.value.includes(AUSLEIH_COOKIE_ANFANG));
    expect(
      gesetzt,
      "Vorbedingung — die Einloesung hat keine Ausleih-Sitzung gesetzt; der Rest des Falls maesse nichts",
    ).toBeTruthy();

    /*
     * ⛔ UND DIE SITZUNG TRAEGT WIRKLICH — vor der Sperrung. Ohne diese Messung waere die
     * 3xx nach der Sperrung nicht von „diese Sitzung hat nie getragen" zu unterscheiden.
     * ⚠️ `page.request` teilt sich den Cookie-Speicher mit `page`
     * (`e2e/lagerbuch-helfer.spec.ts:293-296`), das Cookie aus der Einloesung liegt also
     * bereits im Kontext.
     */
    const vorSperre = await page.request.get(radioUrl(PFAD_GERAETE), { maxRedirects: 0 });
    expect(
      vorSperre.status(),
      "Vorbedingung — mit aktivem Code traegt die Sitzung den Lesepfad nicht",
    ).toBe(200);

    // Mitten in der Schicht gesperrt — der einzige Widerruf, den es gibt.
    setzeAktiv(id, false);
    expect(
      codeZeile(CODE_FALL4)!.aktiv,
      "Vorbedingung — die Sperrung hat die Codezeile nicht erreicht",
    ).toBe(0);

    /*
     * ══════ HOP 1 — der Lesepfad weist ab, UEBER den Abmelde-Handler ══════
     *
     * ⛔ DAS IST DER RIEGEL IM LESEPFAD BEI EINEM ECHTEN ABRUF. Er sitzt im gemeinsamen
     * Rumpf `befund`, Schritt 5 (`_lib/ausleihZugang.ts:180-181`), und ist die einzige
     * Widerrufsmechanik des Moduls: „ein signiertes Cookie kann man nicht zurueckrufen, eine
     * Datenbankzeile schon." Ohne ihn saehe ein gesperrter Code bis zu zwoelf Stunden weiter
     * den gesamten Geraetebestand samt Entleihernamen.
     */
    const hop1 = await page.request.get(radioUrl(PFAD_GERAETE), { maxRedirects: 0 });
    expect(hop1.status(), "Fall 4 — der gesperrte Zugang wurde im Lesepfad nicht umgeleitet").toBe(
      UMLEITUNG_SERVER_COMPONENT,
    );
    const zuAbmelden = hop1.headers()["location"];
    /*
     * ⛔ DER BENANNTE GRUND GEHOERT DAZU. `requireAusleihZugang` unterscheidet „gesperrt" von
     * „abgelaufen" (`_lib/ausleihZugang.ts:240`), und `_lib/gateTexte.ts:63-67` schreibt aus,
     * warum: der eine Satz sagt „unbekannt ODER gesperrt", der andere „wir wissen es genau".
     * Ein `/abmelden` ohne `?grund=` verloere die Auskunft am Gate.
     * ⛔ UND DIESE ZEILE IST DIE, DIE DEN UMWEG ERZWINGT: eine blosse Endadressen-Pruefung
     * unterschiede „ueber den Abmelde-Handler" nicht von „direkt ans Gate".
     */
    expect(
      zuAbmelden,
      "Fall 4 — die Umleitung geht nicht ueber den Abmelde-Handler mit benanntem Grund",
    ).toBe("/abmelden?grund=gesperrt");

    /*
     * ══════ HOP 2 — der Abmelde-Handler raeumt ══════
     *
     * ⛔ 303 UND NICHT 307: dies ist ein ROUTE HANDLER, der seine Antwort selbst baut
     * (`abmelden/route.ts:87-90`), kein `redirect()` aus einer Server Component. „Die Antwort
     * auf ein GET, das eine Wirkung hatte, ist ein ‚See Other'" (`abmelden/route.ts:84-85`).
     */
    const hop2 = await page.request.get(radioUrl(zuAbmelden), { maxRedirects: 0 });
    expect(hop2.status(), "Fall 4 — der Abmelde-Handler antwortet nicht mit 303").toBe(303);
    expect(
      hop2.headers()["location"],
      "Fall 4 — der Abmelde-Handler reicht den Grund nicht ans Gate weiter",
    ).toBe("/?grund=gesperrt");

    const raeumung = hop2
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .find((h) => h.value.includes(AUSLEIH_COOKIE_ANFANG));
    expect(
      raeumung,
      "Fall 4 — der Abmelde-Handler raeumt das Ausleih-Cookie nicht; ein totes Cookie bliebe stehen",
    ).toBeTruthy();
    /*
     * ⛔ `Max-Age=0` — geraeumt wird ueber `ausleihCookieOptionen(0)` und NICHT ueber
     * `cookies.delete(...)`, weil die Attribute beim Loeschen DIESELBEN sein muessen wie beim
     * Setzen (`abmelden/route.ts:92-102`, `_lib/ausleihSitzung.ts:207-219`).
     * ⛔ UND OHNE `Domain=`: das Cookie ist host-only, und genau das ist die zweite Haelfte
     * des Host-Riegels. Ein `Domain=`-Attribut streute die Kiosk-Sitzung ueber ALLE
     * Suite-Hosts. ⚠️ Ein Loeschen mit abweichenden Attributen bliebe WIRKUNGSLOS, und der
     * Browser meldete das nicht.
     */
    expect(
      raeumung!.value,
      "Fall 4 — die Raeumung traegt kein Max-Age=0",
    ).toContain("Max-Age=0");
    expect(
      raeumung!.value.toLowerCase(),
      "Fall 4 — die Raeumung traegt ein Domain-Attribut",
    ).not.toContain("domain=");

    /*
     * ══════ HOP 3 — das Gate, mit dem benannten Grund ══════
     *
     * ⛔ DER GRUND WIRD NICHT DURCHGEREICHT, SONDERN GEGEN EINEN GESCHLOSSENEN SATZ GEPRUEFT
     * (`abmelden/route.ts:71-72`, `_lib/gateTexte.ts:56-58`); dass er hier ANKOMMT, ist die
     * Zusage. Ohne diese Zeile waere `?grund=gesperrt` in Hop 2 ein Wert, den niemand liest.
     */
    const hop3 = await page.request.get(radioUrl("/?grund=gesperrt"), { maxRedirects: 0 });
    expect(hop3.status(), "Fall 4 — das Gate antwortet dem geraeumten Zugang nicht mit 200").toBe(
      200,
    );
    expect(
      await hop3.text(),
      "Fall 4 — das Gate zeigt den benannten Sperrgrund nicht an",
    ).toContain(SATZ_GESPERRT);

    /*
     * ══════ DER ZWEITE AUFRUF — ohne Umweg ans Gate ══════
     *
     * ⛔ DAS IST DIE PROBE AUFS EXEMPEL DER RAEUMUNG, und sie ist staerker als jede
     * Kopfzeilen-Zusicherung: `requireAusleihZugang` nimmt den Umweg ueber `/abmelden` NUR,
     * wenn ein Cookie DA WAR (`_lib/ausleihZugang.ts:239-240`, `hatteCookie`). Fehlt es,
     * geht die Umleitung unmittelbar aufs Gate — „auf einem Telefon ist das eine Runde statt
     * zwei". Landet dieser Aufruf wieder auf `/abmelden`, hat das `Max-Age=0` oben nicht
     * gewirkt, obwohl die Kopfzeile es zusagte.
     */
    const zweiter = await page.request.get(radioUrl(PFAD_GERAETE), { maxRedirects: 0 });
    expect(
      zweiter.status(),
      "Fall 4 — der zweite Aufruf wurde nicht umgeleitet",
    ).toBe(UMLEITUNG_SERVER_COMPONENT);
    expect(
      zweiter.headers()["location"],
      "Fall 4 — der zweite Aufruf nimmt erneut den Umweg; das Ausleih-Cookie wurde nicht wirklich geraeumt",
    ).toBe(PFAD_GATE);
  });

  /* ══════════════════════════════════════════════════════════════════════════
   * FALL 5 — der gesperrte Code an einer SCHREIBENDEN Action
   * ══════════════════════════════════════════════════════════════════════════ */
  test("gesperrter Code an einer schreibenden Action", async ({ page }) => {
    const entleiher = `Sperre T3 ${Date.now()}`;
    const id = legeCodeAn(CODE_FALL5, CODE_FALL5_ID, "T3 Fall 5 (Sperrung vor dem Absenden)");
    expect(
      codeZeile(CODE_FALL5)!.aktiv,
      "Vorbedingung — der laufeigene Code muss VOR der Sperrung aktiv sein",
    ).toBe(1);

    const einloesung = await page.request.get(radioUrl(`/m/radio/t/${CODE_FALL5}`), {
      maxRedirects: 0,
    });
    expect(
      einloesung.status(),
      "Vorbedingung — die Einloesung des laufeigenen Codes antwortet nicht mit 303",
    ).toBe(303);

    /*
     * ⛔ DIE SEITE WIRD GELADEN, SOLANGE DER CODE NOCH AKTIV IST — und das ist die einzige
     * Reihenfolge, in der dieser Fall ueberhaupt entstehen kann: der Riegel im LESEPFAD
     * (Fall 4) schickte einen schon gesperrten Zugang gar nicht erst auf diese Flaeche. Was
     * Fall 5 misst, ist die Lage „das Formular steht bereits ausgefuellt, und dazwischen wird
     * gesperrt" — genau der Fall, fuer den `requireAusleihSchreibend` NICHT umleitet, sondern
     * zurueckgibt (`_lib/ausleihZugang.ts:246-250`: ein `redirect()` „verwuerfe die
     * eingetragenen Werte: der Mensch haette vier Geraete und einen Namen eingegeben und
     * faende ein leeres Formular vor").
     */
    const seite = await page.goto(radioUrl(PFAD_AUSLEIHEN));
    expect(seite?.status(), "Fall 5 — /ausleihen antwortet dem aktiven Code nicht mit 200").toBe(
      200,
    );
    expect(
      new URL(page.url()).pathname,
      "Fall 5 — der Abruf ist nicht auf /ausleihen geblieben (Umweg ans Gate?)",
    ).toBe(PFAD_AUSLEIHEN);

    const erstesFreies = page.locator(AUSWAHLZEILE_FREI).first();
    await klickeWennRuhig(erstesFreies);
    await klickeWennRuhig(page.locator(NAMENSFELD));
    await page.locator(NAMENSFELD).fill(entleiher);

    await expect(
      page.locator(ENTLEIHER_WERT),
      "das versteckte Namensfeld traegt den getippten Namen nicht",
    ).toHaveValue(entleiher);
    const auswahlWert = await page.locator(AUSWAHL_WERT).inputValue();
    expect(auswahlWert, "es wurde kein Geraet uebernommen").not.toBe("");
    const geraetId = auswahlWert.split(",")[0];
    expect(
      aktiveLeihe(geraetId),
      "Vorbedingung — das gewaehlte Geraet fuehrt bereits eine aktive Leihe",
    ).toBeUndefined();

    // Mitten im Vorgang gesperrt, mit ausgefuelltem Formular.
    setzeAktiv(id, false);
    expect(
      codeZeile(CODE_FALL5)!.aktiv,
      "Vorbedingung — die Sperrung hat die Codezeile nicht erreicht",
    ).toBe(0);

    const [antwort] = await Promise.all([
      page.waitForResponse(
        (a) =>
          a.request().method() === "POST" &&
          new URL(a.url()).pathname === PFAD_AUSLEIHEN &&
          (a.request().postData() ?? "").includes("entleiher"),
      ),
      klickeWennRuhig(page.locator(AUSLEIHEN_KNOPF)),
    ]);
    /*
     * ⛔ KEIN ABSTURZ — das ist die halbe Zusage. `requireAusleihSchreibend` wirft nicht und
     * leitet nicht um; sie gibt `{ ok: false, grund }` zurueck, und die Action macht daraus
     * einen Ergebniswert (`_actions/ausleihe.ts:124-142`).
     */
    expect(
      antwort.ok(),
      `Fall 5 — die Ausleih-Action antwortete mit ${antwort.status()}; ein gesperrter Code ist ein Betriebsfall, kein Serverfehler`,
    ).toBe(true);
    await expect(
      page.getByText(/server-side exception/i),
      "Fall 5 — die Seite zeigt eine englische Fehlerseite statt der deutschen Meldung",
    ).toHaveCount(0);

    /*
     * ⛔ DIE MELDUNG STEHT AM FORMULAR, aus dem Ergebnistyp — kein Toast (Entscheidung E6),
     * kein `Alert type="error"` (`_ui/AusleihVorgang.tsx:456`). Der Satz ist derselbe wie am
     * Gate, weil `_lib/meldungen.ts:297` ihn ueber `gateMeldung("gesperrt", null)!` holt
     * statt ihn abzuschreiben.
     */
    await expect(
      page.locator(AUSLEIH_FEHLER),
      "Fall 5 — die deutsche Sperrmeldung fehlt am Ausleihformular",
    ).toHaveText(SATZ_GESPERRT);

    /*
     * ⛔ UND DIE EINGETRAGENEN FELDER BLEIBEN STEHEN. Das ist die zweite Haelfte, und sie ist
     * die, die eine Umleitung zerstoert haette: `useActionState` haelt die Insel montiert,
     * die Auswahl steht in der Adresse, der Name im Zustand. Ohne diese zwei Zeilen waere der
     * Fall auch dann gruen, wenn die Action die Werte verworfen haette.
     */
    await expect(
      page.locator(ENTLEIHER_WERT),
      "Fall 5 — der eingetippte Name ist nach der Absage verschwunden",
    ).toHaveValue(entleiher);
    await expect(
      page.locator(AUSWAHL_WERT),
      "Fall 5 — die Geraeteauswahl ist nach der Absage verschwunden",
    ).toHaveValue(auswahlWert);

    /*
     * ⛔ UND ES IST NICHTS GEBUCHT. Ohne diese Zeile bewiese der Fall nur, dass eine Meldung
     * erscheint — nicht, dass der Riegel den SCHREIBVORGANG verhindert hat.
     */
    expect(
      aktiveLeihe(geraetId),
      "Fall 5 — trotz gesperrtem Code wurde eine Leihe gebucht",
    ).toBeUndefined();
  });
});
