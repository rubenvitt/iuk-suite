/**
 * Migriert und seedet `lagerbuch.db` als eigenstaendiger Node-Prozess — gerufen
 * EINMAL aus `webServer.command` in `playwright.config.ts`, VOR `next dev`.
 *
 * ⚠️ WARUM DAS NOETIG IST UND NICHT `src/instrumentation.ts` GENUEGT: Next'
 * Dev-Server uebersetzt Module ON DEMAND je Route-Bundle und wertet den
 * Modul-Singleton in `_db/client.ts` dabei MEHRFACH aus. Jede Auswertung oeffnet
 * eine frische better-sqlite3-Verbindung — und in `next dev` sehen diese spaeteren
 * Verbindungen das Schema NICHT, das die Instrumentation-Verbindung gerade
 * migriert hat (empirisch bestaetigt: `sqlite_master` ueber eine frisch
 * geoeffnete Verbindung auf denselben aufgeloesten Dateipfad liefert Sekunden
 * nach erfolgreicher, gecheckpointeter Migration KEINE Tabellen — alles im selben
 * OS-Prozess). Die Migration HIER, in einem separaten `tsx`-Prozess, der beendet
 * ist BEVOR `next dev` startet, garantiert das Schema dauerhaft auf der Platte.
 * Die Begruendung steht wortgleich in `lagerbuch/e2e/migrate-db.ts:1-20`.
 *
 * ⚠️ ES WIRD `getDb()` DES MODULS BENUTZT, nie `getModuleDb` und nie
 * `seedAllModules()` (§12.6, Punkt 4). Der zweite Grund wiegt schwerer:
 * `seedAllModules()` ist die einzige core-Stelle mit `getModuleDb(<key>, schema)`,
 * und eine solche Verbindung KENNTE `lb_falte` NICHT (§5.13.2).
 *
 * ⚠️ DIE TOKEN-CODES GEHOEREN AUSDRUECKLICH NICHT IN `seedAllModules()`: ein
 * Seed-Zugangscode waere in einer Generalprobe ein GUELTIGER ANONYMER
 * SCHREIBZUGANG.
 *
 * ⚠️ `ensureHandlager` STEHT HIER NICHT. Die Handlager-Zeile ist
 * Schema-Vervollstaendigung und liegt seit Teil 1 in `0003_handlager.sql` (§4.3,
 * §12.6 Punkt 4).
 *
 * Alles ist IDEMPOTENT (`onConflictDoNothing`) — `playwright.config.ts` loescht
 * `./.data/e2e` zwar vor jedem Lauf, aber ein Seed, der beim zweiten Aufruf
 * bricht, ist beim Debuggen unbrauchbar.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openModuleDatabase, moduleDbPath } from "@/core/db";
import { getDb } from "@/app/m/lagerbuch/_db/client";
import {
  artikel, buchungen, chargen, checks, fahrzeugTemplates, geraete, lagerorte,
  lagerortVerfall, o2Flaschen, sollPositionen, tokens, newId,
} from "@/app/m/lagerbuch/_db/schema";
import { ENTNAHMEBOX_ID, HANDLAGER_ID } from "@/app/m/lagerbuch/_lib/konstanten";
import { AUSSONDERN_PRAEFIX, INVENTUR_PRAEFIX } from "@/app/m/lagerbuch/_lib/vorgang";
import {
  E2E_TOKEN_HELFER, E2E_TOKEN_CHECK, E2E_TOKEN_GERAETE, E2E_TOKEN_FAHRZEUG,
  E2E_FAHRZEUG_ID, E2E_FAHRZEUG_NAME, E2E_FAHRZEUG_ANDERES_ID, E2E_FAHRZEUG_ANDERES_NAME,
  E2E_LAST_ANZAHL, E2E_LAST_PRAEFIX,
  E2E_ZELLENTEXT_ARTIKEL, E2E_ZELLENTEXT_KOMMENTAR,
} from "./helpers/lagerbuch";

const JETZT = new Date();

/**
 * Der Verfall der Chargen, die NICHT in der Verfallsliste auftauchen sollen.
 *
 * ⚠️ „2030-01" WAR EINE ZEITBOMBE: ab Dezember 2029 faellt die Charge ins gelbe
 * Fenster (56 Tage), ab Februar 2030 ist sie abgelaufen — dann stuenden die
 * Helfer- und Check-Artikel mit in der Verfallsliste, die `verfallFixtures` als
 * Ein-Zeilen-Liste anlegt, und eine als „enthaelt" geschriebene Zusicherung
 * bliebe dabei gruen, waehrend die Liste sich still verdoppelt.
 *
 * ⚠️ NICHT `PSEUDO_VERFALL` ("2099-12") — das ist der Sentinel der geratenen
 * Charge (§5.3.2) und naehme einen anderen Zweig.
 */
const E2E_VERFALL_FERN = "2090-01";

/** Schema-frei migrieren — dieselbe Form wie `migrateAllModules()`
 *  (`core/bootstrap.ts:54-59`): eigene Verbindung, migrieren, schliessen. */
function migriere(): void {
  const sqlite = openModuleDatabase(moduleDbPath("lagerbuch"));
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/lagerbuch/_db/migrations" });
  sqlite.close();
}

/**
 * Aktiver Token + Artikel mit Bestand > 0 fuer `e2e/lagerbuch-helfer.spec.ts`.
 *
 * ⚠️ `e2e-artikel` GEHOERT AUSSCHLIESSLICH DIESEM FLOW. Keine Soll-Position
 * eines Fahrzeugs darf darauf zeigen — siehe `artikelMitBestand` (I-14).
 */
function helferFixtures(): void {
  getDb().insert(tokens).values({
    id: "e2e-token", code: E2E_TOKEN_HELFER, label: "E2E Helfer", aktiv: true,
    createdAt: JETZT, createdBy: "e2e", scopeLagerortId: null, zielTyp: null,
    zielId: null, lastUsedAt: null,
  }).onConflictDoNothing().run();

  artikelMitBestand(
    "e2e-artikel", "E2E Verbandpäckchen", "A1", "e2e-charge", "E2E-001", 10);
}

/** Artikel mit ABGELAUFENER Charge (Rest > 0) fuer die Verfallsliste + Aussondern. */
function verfallFixtures(): void {
  const db = getDb();
  db.insert(artikel).values({
    id: "e2e-verfall-artikel", name: "E2E Verfall NaCl", einheit: "Fl.", fach: "B2",
    mindestbestand: 0, aktiv: true, createdAt: JETZT,
  }).onConflictDoNothing().run();

  db.insert(chargen).values({
    id: "e2e-verfall-charge", artikelId: "e2e-verfall-artikel", chargenNr: "E2E-EXP",
    verfall: "2020-01", createdAt: JETZT,
  }).onConflictDoNothing().run();

  if (!db.select().from(buchungen).where(eq(buchungen.chargeId, "e2e-verfall-charge")).get()) {
    db.insert(buchungen).values({
      id: newId(), ts: JETZT, typ: "zugang", artikelId: "e2e-verfall-artikel",
      chargeId: "e2e-verfall-charge", lagerortId: HANDLAGER_ID, menge: 3,
      quelleTyp: "system", quelleId: "e2e", referenz: null, kommentar: null,
    }).run();
  }
}

/**
 * Ein Artikel MIT Charge und Handlager-Zugang, idempotent — das Muster, das
 * `helferFixtures` schon fuehrt, als Helfer fuer die uebrigen Flows.
 *
 * ⚠️ JEDER FLOW BRAUCHT SEINEN EIGENEN (I-14). Die drei Token trennen sauber das
 * JOURNAL (ueber `quelleId`, H10.3) — die Soll-Positionen beider Fahrzeuge
 * zeigten aber auf DENSELBEN `e2e-artikel`, dessen einziger Bestand im
 * HANDLAGER liegt, genau dem Bestand, den der Helfer-Flow liest. Der Nachfuellweg
 * eines Checks ist `umlagerung(von: HANDLAGER, …)`
 * (`schreibpfade/umlagerung.ts:38-41`, Quelle per Vorgabe `HANDLAGER_ID`); ein
 * abgeschlossener Check senkt also den Handlager-Bestand des Helfer-Flows.
 * Playwright faehrt alle Specs mit `workers: 1` gegen EINE SQLite-Datei — die
 * Helfer-Zusage „Bestand 10" waere damit DATEIREIHENFOLGE-ABHAENGIG.
 *
 * Der Fehler tritt heute nicht auf, weil es noch keinen Spec gibt, der einen
 * Check abschliesst. Er tritt bei der ERSTEN Check-Spec auf, und er aeussert
 * sich als rennabhaengige Roete, deren Ursache niemand im Seed sucht —
 * `lagerbuch/e2e/migrate-db.ts:84-88` schreibt genau diese Lehre aus.
 */
function artikelMitBestand(
  artikelId: string, name: string, fach: string,
  chargeId: string, chargenNr: string, menge: number,
): void {
  const db = getDb();
  db.insert(artikel).values({
    id: artikelId, name, einheit: "Stk.", fach,
    mindestbestand: 0, aktiv: true, createdAt: JETZT,
  }).onConflictDoNothing().run();

  db.insert(chargen).values({
    id: chargeId, artikelId, chargenNr, verfall: E2E_VERFALL_FERN, createdAt: JETZT,
  }).onConflictDoNothing().run();

  if (!db.select().from(buchungen).where(eq(buchungen.chargeId, chargeId)).get()) {
    db.insert(buchungen).values({
      id: newId(), ts: JETZT, typ: "zugang", artikelId, chargeId,
      lagerortId: HANDLAGER_ID, menge,
      quelleTyp: "system", quelleId: "e2e", referenz: null, kommentar: null,
    }).run();
  }
}

/**
 * EIGENER Token + Fahrzeug + ARTIKEL fuer den Check-Spec.
 * ⚠️ Ohne den zweiten Code buchte der Check zusaetzlich mit `quelleId=111-111` in
 * das Journal des Helfer-Flows hinein — Playwright faehrt alle Specs in EINEM
 * Worker gegen EINE Datei (`lagerbuch/e2e/migrate-db.ts:84-88`). Und ohne den
 * eigenen Artikel senkte sein Nachfuellweg den Handlager-Bestand, den der
 * Helfer-Flow zusichert (I-14, siehe `artikelMitBestand`).
 */
function checkFixtures(): void {
  const db = getDb();
  db.insert(tokens).values({
    id: "e2e-check-token", code: E2E_TOKEN_CHECK, label: "E2E Check", aktiv: true,
    createdAt: JETZT, createdBy: "e2e", scopeLagerortId: null, zielTyp: null,
    zielId: null, lastUsedAt: null,
  }).onConflictDoNothing().run();

  db.insert(lagerorte).values({
    id: E2E_FAHRZEUG_ID, name: E2E_FAHRZEUG_NAME, typ: "fahrzeug", kennung: "MS-E2E-1",
    aktiv: true, templateId: null, einheitenart: "fahrzeug",
  }).onConflictDoNothing().run();

  // Der Name ist bewusst > 28 Zeichen (Ruling A10, Plan T170): der Etikettenbogen-
  // Test misst daran, dass ein langer Artikelname den QR nicht unter 20mm
  // draengt (§8.4, 8-I Punkt 2). Ohne diese Verlaengerung ist die Zusicherung
  // ein No-op — der laengste Seed-Name hatte nur 20 Zeichen. Rein kosmetisch
  // (steril/Groesse angehaengt), keine Bedeutung fuer den Check-Flow selbst.
  artikelMitBestand(
    "e2e-check-artikel", "E2E Check Kompressen steril 10x10cm", "A2",
    "e2e-check-charge", "E2E-CHK", 20);

  db.insert(sollPositionen).values({
    id: "e2e-soll", fahrzeugId: "e2e-fahrzeug", fachLabel: "E2E Fach", sort: 0,
    artikelId: "e2e-check-artikel", soll: 3, templatePositionId: null,
    ueberschrieben: false, entfernt: false,
  }).onConflictDoNothing().run();

  // 300-bar-Flasche: der Fall, an dem der gestrichene `?? 200`-Rueckfall sichtbar
  // wird (§5.12). Sie steht bewusst am CHECK-Fahrzeug.
  db.insert(o2Flaschen).values({
    id: "e2e-o2", name: "E2E O2 300", lagerortId: "e2e-fahrzeug", groesseLiter: 10,
    nennfuelldruckBar: 300, aktiv: true, createdAt: JETZT,
  }).onConflictDoNothing().run();

  /**
   * ZWEI abgeschlossene Checks fuer `/verwaltung/checks/[id]` — der einzige Weg,
   * §11.5 Zustand 27 ECHT zu rendern (T176a1).
   *
   * ⚠️ WARUM SIE UEBERHAUPT HIER STEHEN. Die Detailseite ist eine Server
   * Component OHNE Insel, und dieses Repo schreibt aus, dass `build`,
   * `typecheck` und Vitest ihre schlimmsten Fehler dort strukturell NICHT sehen
   * (Compound-Zugriff auf antd, Icon-Import — HTTP 500 erst im echten Render).
   * Ohne eine Check-Zeile im Seed gab es die Route in der E2E-Suite nicht.
   *
   * ⚠️ SIE HAENGEN BEWUSST AM VORHANDENEN `e2e-fahrzeug`, nicht an einem neuen.
   * Ein zusaetzliches Fahrzeug taucht in der Flottenliste und im Helfer-Waehler
   * auf und veraendert damit fremde Zusicherungen; eine Check-Zeile tut das
   * nicht — keine Spec liest die Check-Historie.
   *
   * ⚠️ `completedAt` LIEGT IN DER VERGANGENHEIT. `lagerbuch-helfer.spec.ts:396`
   * liest den JUENGSTEN Check des Fahrzeugs vor und nach seinem Durchlauf und
   * verlangt eine NEUE Zeile; ein Seed-Check mit heutigem Zeitstempel koennte
   * dort je nach Sekunde gewinnen (`order by completed_at desc, id desc`).
   */
  const VOR_ZWEI_STUNDEN = new Date(JETZT.getTime() - 2 * 3_600_000);
  const VOR_DREI_STUNDEN = new Date(JETZT.getTime() - 3 * 3_600_000);

  db.insert(checks).values({
    id: "e2e-check-lesbar", fahrzeugId: "e2e-fahrzeug", quelleTyp: "token",
    quelleId: E2E_TOKEN_CHECK, startedAt: VOR_DREI_STUNDEN, completedAt: VOR_DREI_STUNDEN,
    ergebnis: JSON.stringify({
      version: 2,
      positionen: [{ sollPositionId: "e2e-soll", artikelId: "e2e-check-artikel", soll: 3, ist: 3 }],
      artikel: [{
        artikelId: "e2e-check-artikel", positionen: 1, sollSumme: 3, istSumme: 3,
        recordedVorher: 3, korrektur: 0, nachfuellGewuenscht: 0, nachfuellGebucht: 0,
      }],
      geraete: [], flaschen: [], verfall: [],
    }),
  }).onConflictDoNothing().run();

  /**
   * Der GEGENFALL, auf den es ankommt: ein gueltiges, aber LEERES V2-Ergebnis —
   * ein Check, der wirklich nichts zu melden hatte.
   *
   * ⚠️ Ohne diese Zeile war die E2E-Gegenprobe „gefuellt und lesbar" und damit
   * nicht die Unterscheidung, um die es geht (Review-Fund Minor 1). „Leer" und
   * „kaputt" sehen in der Datenbank fast gleich aus; nur hier zeigt sich, dass
   * die Seite sie trotzdem verschieden anzeigt.
   */
  const VOR_VIER_STUNDEN = new Date(JETZT.getTime() - 4 * 3_600_000);
  db.insert(checks).values({
    id: "e2e-check-leer", fahrzeugId: "e2e-fahrzeug", quelleTyp: "token",
    quelleId: E2E_TOKEN_CHECK, startedAt: VOR_VIER_STUNDEN, completedAt: VOR_VIER_STUNDEN,
    ergebnis: JSON.stringify({
      version: 2, positionen: [], artikel: [], geraete: [], flaschen: [], verfall: [],
    }),
  }).onConflictDoNothing().run();

  /**
   * DER VOLLSTAENDIGE CHECK — alle fuenf Abschnitte der Detailseite belegt (DRK-197).
   *
   * ⚠️ WARUM ER GEBRAUCHT WIRD, obwohl `e2e-check-lesbar` daneben steht: jener
   * traegt AUSSCHLIESSLICH Artikel. Geraete, Sauerstoff und Verfall sind dort
   * leer, und damit war der groesste Teil der dichtesten Verwaltungsseite nie
   * ECHT gerendert. Die Seite ist eine Server Component ohne Insel — genau die
   * Klasse, fuer die `build`, `typecheck` und Vitest die schlimmsten Fehler
   * strukturell nicht sehen (Compound-Zugriff auf antd, Zeichenimport: HTTP 500
   * schon beim Import). Ein gruener DOM-Test beweist dort nichts.
   *
   * ⚠️ JEDER ABSCHNITT TRAEGT EINEN AUFFAELLIGEN WERT, nicht einen ruhigen: eine
   * Zeile, die nichts zu melden hat, rendert in mehreren Abschnitten gar nichts
   * — der Fall waere dann gruen, ohne etwas gesehen zu haben.
   *
   * ⚠️ `e2e-geraet` LIEGT AN EINEM ANDEREN FAHRZEUG, und das ist hier richtig:
   * das Ergebnis ist ein SCHNAPPSCHUSS, die Seite loest den Namen aus dem Stamm
   * auf und prueft die heutige Zugehoerigkeit nicht. Ein zusaetzliches Geraet an
   * `e2e-fahrzeug` taeuchte dagegen in fremden Geraetelisten auf und veraenderte
   * Zusicherungen, die mit diesem Vorgang nichts zu tun haben.
   */
  const VOR_FUENF_STUNDEN = new Date(JETZT.getTime() - 5 * 3_600_000);
  db.insert(checks).values({
    id: "e2e-check-voll", fahrzeugId: "e2e-fahrzeug", quelleTyp: "token",
    quelleId: E2E_TOKEN_CHECK, startedAt: VOR_FUENF_STUNDEN, completedAt: VOR_FUENF_STUNDEN,
    ergebnis: JSON.stringify({
      version: 2,
      positionen: [{ sollPositionId: "e2e-soll", artikelId: "e2e-check-artikel", soll: 5, ist: 2 }],
      artikel: [{
        artikelId: "e2e-check-artikel", positionen: 1, sollSumme: 5, istSumme: 2,
        recordedVorher: 2, korrektur: 0,
        // Gewuenscht 3, gebucht 1 -> „nachgefuellt 1" UND „fehlt weiterhin 2".
        nachfuellGewuenscht: 3, nachfuellGebucht: 1,
      }],
      geraete: [{
        geraetId: "e2e-geraet", vorhanden: false, zustand: "Defekt",
        bemerkung: "E2E Riss im Gurt",
      }],
      // 40 von 300 bar — deutlich unter jeder Wechselschwelle.
      flaschen: [{ flascheId: "e2e-o2", druckBar: 40, nennfuelldruckBar: 300 }],
      verfall: [{ artikelId: "e2e-verfall-artikel", verfall: "2020-01", abgelaufen: true }],
    }),
  }).onConflictDoNothing().run();

  // Der Zustand selbst: KEIN JSON. Genau das, was `parseCheckErgebnis` mit
  // `unlesbar: true` beantwortet — und was vorher als „0 Positionen" durchging.
  db.insert(checks).values({
    id: "e2e-check-unlesbar", fahrzeugId: "e2e-fahrzeug", quelleTyp: "token",
    quelleId: E2E_TOKEN_CHECK, startedAt: VOR_ZWEI_STUNDEN, completedAt: VOR_ZWEI_STUNDEN,
    ergebnis: "{das ist kein json",
  }).onConflictDoNothing().run();
}

/** EIGENES Fahrzeug (damit der Check-Spec KEINEN Geraete-Schritt bekommt) +
 *  Token + Soll + ein Objekt-Geraet am Standort. */
function geraeteFixtures(): void {
  const db = getDb();
  db.insert(tokens).values({
    id: "e2e-geraete-token", code: E2E_TOKEN_GERAETE, label: "E2E Geräte", aktiv: true,
    createdAt: JETZT, createdBy: "e2e", scopeLagerortId: null, zielTyp: null,
    zielId: null, lastUsedAt: null,
  }).onConflictDoNothing().run();

  db.insert(lagerorte).values({
    id: E2E_FAHRZEUG_ANDERES_ID, name: E2E_FAHRZEUG_ANDERES_NAME, typ: "fahrzeug",
    kennung: "MS-E2E-2", aktiv: true, templateId: null, einheitenart: "fahrzeug",
  }).onConflictDoNothing().run();

  artikelMitBestand(
    "e2e-geraete-artikel", "E2E Geräte Pflaster", "A3",
    "e2e-geraete-charge", "E2E-GER", 20);

  db.insert(sollPositionen).values({
    id: "e2e-geraete-soll", fahrzeugId: "e2e-geraete-fahrzeug", fachLabel: "E2E Fach",
    sort: 0, artikelId: "e2e-geraete-artikel", soll: 2, templatePositionId: null,
    ueberschrieben: false, entfernt: false,
  }).onConflictDoNothing().run();

  db.insert(geraete).values({
    id: "e2e-geraet", typ: "objekt", name: "E2E Spineboard",
    lagerortId: "e2e-geraete-fahrzeug", aktiv: true, createdAt: JETZT,
    barcode: null, anmerkung: null, mtkFaellig: null,
    beschreibung: null, ablaufdatum: null,
  }).onConflictDoNothing().run();
}

/** Artikel UNTER Mindestbestand — sonst ist die Bestellvorschlagsliste leer und
 *  der Spec liefe ohne Zusicherung durch (§12.3, Regel 5). */
function bestellFixtures(): void {
  getDb().insert(artikel).values({
    id: "e2e-bestellung-artikel", name: "E2E Bestellung NaCl", einheit: "Fl.",
    fach: "C3", mindestbestand: 5, aktiv: true, createdAt: JETZT,
  }).onConflictDoNothing().run();
}

/**
 * Ein eigenes Fahrzeug fuer `lagerbuch-vorlagenfeld.spec.ts` (DRK-310), das der
 * Spec verknuepft und wieder loest. INAKTIV und ohne Soll, damit es weder auf
 * den Checklisten- noch auf den Etikettenboegen erscheint — `e2e-fahrzeug`
 * bleibt so unberuehrt von einer Vorlagenverknuepfung.
 */
function vorlagenFixtures(): void {
  const db = getDb();
  db.insert(fahrzeugTemplates).values({
    id: "e2e-vorlagenfeld-tpl", name: "E2E Vorlagenfeld", aktiv: true, createdAt: JETZT,
  }).onConflictDoNothing().run();
  db.insert(lagerorte).values({
    id: "e2e-vorlagen-fahrzeug", name: "E2E Vorlagen-KTW", typ: "fahrzeug",
    kennung: "MS-E2E-3", aktiv: false, templateId: null, einheitenart: "fahrzeug",
  }).onConflictDoNothing().run();
}

/**
 * ZWEI EINHEITEN FUER `lagerbuch-einheitenart.spec.ts` (DRK-309): EINE TASCHE
 * und EINE, DIE NOCH NICHT ZUGEORDNET IST.
 *
 * ⚠️ DIE NICHT ZUGEORDNETE IST DIE WICHTIGERE VON BEIDEN. Sie bildet den
 * Zwischenstand aus Migration 0010 nach, die bewusst nicht backfillt — der
 * Zustand, in dem JEDE bestehende Anlage nach dem Rollout startet. Ein Seed,
 * der ueberall eine Art setzt, laesst die Spalte „nicht zugeordnet", ihren
 * Filter und den Nachtrag am Einheitenblatt an keiner Flaeche pruefbar.
 *
 * ⚠️ BEIDE INAKTIV und ohne Soll, aus demselben Grund wie `vorlagenFixtures`:
 * sonst stuenden sie auf den Checklisten- und Etikettenboegen, und zwei
 * fremde Specs zaehlten ploetzlich anders.
 */
function einheitenartFixtures(): void {
  const db = getDb();
  db.insert(lagerorte).values([
    { id: "e2e-tasche", name: "E2E Sanitätstasche", typ: "fahrzeug",
      kennung: null, aktiv: false, templateId: null, einheitenart: "tasche" },
    // OHNE `einheitenart` — der Zwischenstand, den die Spec nachtraegt.
    { id: "e2e-ohne-art", name: "E2E Rucksack ohne Art", typ: "fahrzeug",
      kennung: null, aktiv: false, templateId: null },
  ]).onConflictDoNothing().run();
}

/**
 * DREI FAHRZEUGE FUER `lagerbuch-verfall-fahrzeug.spec.ts` (DRK-298) — ZWEI mit
 * je einer ABGELAUFENEN Meldung, eins ganz OHNE.
 *
 * ⚠️ ZWEI GEMELDETE, NICHT EINS, UND DAS IST DER UNTERSCHIED ZWISCHEN EINEM
 * TEST UND EINER LEEREN GESTE. „Nach Fahrzeug filtern" ist Akzeptanzkriterium 1
 * — mit einer einzigen Meldung im Seed laesst eine Einschraenkung auf „dieses
 * Fahrzeug" genau dieselbe Zeile stehen, und die Zusicherung waere auch dann
 * gruen, wenn der Filter gar nichts taete. (Gemessen: die Trefferanzeige blendet
 * sich bei 1 von 1 korrekt aus und war ueberhaupt nicht im DOM.)
 *
 * ⚠️ DAS DRITTE IST KEIN FUELLSEL. „nichts faellig" und „nie angesehen" sehen in
 * der Fahrzeugliste verschieden aus, und genau diese Unterscheidung ist der
 * Zweck des Tickets; ohne ein Fahrzeug ohne jede Meldung liesse sie sich im
 * Browser nicht zeigen.
 *
 * ⚠️ AUCH DAS DRITTE BRAUCHT EIN SOLL. Die Erfassung wird gegen das aktive Soll
 * gemessen (Reviewbefund zu DRK-298); ein Fahrzeug ohne Sollposition hat
 * NICHTS ZU ERFASSEN und zeigt folgerichtig „—" statt einer Quote. Ohne die
 * Sollposition pruefte die Spec die Wissensluecke also gar nicht, sondern den
 * Fall „hier gibt es nichts zu sagen".
 *
 * ⚠️ BEIDE INAKTIV. `ChecklisteKnopf` ohne `fahrzeugId` meint ALLE AKTIVEN
 * Fahrzeuge — ein drittes aktives Fahrzeug haenge sonst an jedem Checklistenlauf
 * von `lagerbuch-checklisten.spec.ts` mit dran. Die Verwaltungsliste zeigt
 * inaktive Fahrzeuge (Spaltenfilter „inaktiv"), die Spec findet sie also.
 *
 * ⚠️ WIEDERVERWENDET WIRD `e2e-verfall-artikel`, kein neuer. Er gehoert bereits
 * dem Verfallsfluss, und ein weiterer aktiver Artikel verschoebe die Zahlen, die
 * fremde Specs an Artikelliste, Etiketten und Kennzahlen zusichern (I-14). Die
 * Soll-Position macht die Meldung erst plausibel: der SCHREIBweg
 * (`_actions/lagerortVerfall.ts`) verlangt sie, der Lesepfad fragt sie nie.
 */
function fahrzeugVerfallFixtures(): void {
  const db = getDb();
  db.insert(lagerorte).values([
    { id: "e2e-verfall-fahrzeug", name: "E2E Verfall-RTW", typ: "fahrzeug",
      kennung: "MS-E2E-4", aktiv: false, templateId: null, einheitenart: "fahrzeug" },
    { id: "e2e-verfall-fahrzeug-2", name: "E2E Verfall-KTW", typ: "fahrzeug",
      kennung: "MS-E2E-5", aktiv: false, templateId: null, einheitenart: "fahrzeug" },
    { id: "e2e-ungepflegt-fahrzeug", name: "E2E Ungepflegt-MTW", typ: "fahrzeug",
      kennung: "MS-E2E-6", aktiv: false, templateId: null, einheitenart: "fahrzeug" },
  ]).onConflictDoNothing().run();

  db.insert(sollPositionen).values([
    { id: "e2e-verfall-soll", fahrzeugId: "e2e-verfall-fahrzeug", fachLabel: "Fach E2E",
      sort: 0, artikelId: "e2e-verfall-artikel", soll: 1, templatePositionId: null,
      ueberschrieben: false, entfernt: false },
    { id: "e2e-verfall-soll-2", fahrzeugId: "e2e-verfall-fahrzeug-2", fachLabel: "Fach E2E",
      sort: 0, artikelId: "e2e-verfall-artikel", soll: 1, templatePositionId: null,
      ueberschrieben: false, entfernt: false },
    { id: "e2e-ungepflegt-soll", fahrzeugId: "e2e-ungepflegt-fahrzeug", fachLabel: "Fach E2E",
      sort: 0, artikelId: "e2e-verfall-artikel", soll: 1, templatePositionId: null,
      ueberschrieben: false, entfernt: false },
  ]).onConflictDoNothing().run();

  // ABGELAUFEN, nicht bloss warnend — und ein FESTES Datum weit in der
  // Vergangenheit, damit der Zustand nicht mit dem Kalendertag kippt. Derselbe
  // Artikel an zwei Fahrzeugen ist zulaessig: eindeutig ist (Lagerort, Artikel).
  db.insert(lagerortVerfall).values([
    { id: "e2e-verfall-meldung", lagerortId: "e2e-verfall-fahrzeug",
      artikelId: "e2e-verfall-artikel", verfall: "2020-01", erfasstAt: JETZT,
      quelleTyp: "system", quelleId: "e2e" },
    { id: "e2e-verfall-meldung-2", lagerortId: "e2e-verfall-fahrzeug-2",
      artikelId: "e2e-verfall-artikel", verfall: "2020-02", erfasstAt: JETZT,
      quelleTyp: "system", quelleId: "e2e" },
  ]).onConflictDoNothing().run();
}

/**
 * Ein Fahrzeug MIT ECHTEM BESTAND fuer `lagerbuch-aussondern-fahrzeug.spec.ts`
 * (DRK-303).
 *
 * ⚠️ EIN EIGENES FAHRZEUG UND NICHT `e2e-verfall-fahrzeug`: diese Spec SCHREIBT
 * (sie bucht Bestand ab), und `lagerbuch-verfall-fahrzeug.spec.ts` sichert an
 * jenem Fahrzeug feste Werte zu. Zwei Specs auf derselben Zeile sind genau die
 * Reihenfolgeabhaengigkeit, die isoliert gruen ist und im Verbund rot.
 *
 * ⚠️ WIEDERVERWENDET WERDEN ARTIKEL UND CHARGE des Verfallsflusses, kein neuer
 * Artikel: ein weiterer aktiver Artikel verschoebe die Zahlen, die fremde Specs
 * an Artikelliste, Etiketten und Kennzahlen zusichern (I-14). Der Bestand liegt
 * AM FAHRZEUG — der Handlager-Rest derselben Charge bleibt damit unberuehrt,
 * und genau diese Trennung ist die Invariante des Moduls (§5.2.1).
 *
 * ⚠️ KEINE `lagerort_verfall`-Zeile: sonst erschiene das Fahrzeug in der
 * Verfallsliste, die die Nachbarspec durchzaehlt. Die Zeile im Fahrzeugblatt
 * steht auch ohne sie — sie kommt aus der SOLL-Position und meldet „nicht
 * erfasst".
 */
function aussondernFahrzeugFixtures(): void {
  const db = getDb();
  db.insert(lagerorte).values({
    id: "e2e-aussondern-fahrzeug", name: "E2E Aussondern-RTW", typ: "fahrzeug",
    kennung: "MS-E2E-7", aktiv: false, templateId: null, einheitenart: "fahrzeug",
  }).onConflictDoNothing().run();

  db.insert(sollPositionen).values({
    id: "e2e-aussondern-soll", fahrzeugId: "e2e-aussondern-fahrzeug",
    fachLabel: "Fach E2E", sort: 0, artikelId: "e2e-verfall-artikel", soll: 4,
    templatePositionId: null, ueberschrieben: false, entfernt: false,
  }).onConflictDoNothing().run();

  // Idempotent ueber die Referenz: ein zweiter Seed-Lauf darf den Bestand nicht
  // verdoppeln, und `buchungen` traegt keinen eindeutigen Index dafuer.
  const schon = db.select().from(buchungen)
    .where(eq(buchungen.referenz, "e2e-aussondern-seed")).get();
  if (!schon) {
    db.insert(buchungen).values({
      id: newId(), ts: JETZT, typ: "zugang", artikelId: "e2e-verfall-artikel",
      chargeId: "e2e-verfall-charge", lagerortId: "e2e-aussondern-fahrzeug",
      menge: 4, quelleTyp: "system", quelleId: "e2e",
      referenz: "e2e-aussondern-seed", kommentar: null,
    }).run();
  }
}

/**
 * EIGENE Zeilen fuer `lagerbuch-entnahmebox.spec.ts` (DRK-314).
 *
 * ⚠️ EIN EIGENES FAHRZEUG, EIN EIGENER ARTIKEL, EINE EIGENE CHARGE — und jedes
 * davon einzeln begruendet:
 *
 *  * EIGENES FAHRZEUG, weil die Spec BUCHT. `e2e-aussondern-fahrzeug` traegt
 *    dieselbe Eigenschaft, und zwei schreibende Specs auf derselben Zeile sind
 *    genau die Reihenfolgeabhaengigkeit, die isoliert gruen ist und im Verbund
 *    rot (alle Specs teilen EINE Datenbank, `workers: 1`).
 *  * EIGENER ARTIKEL, obwohl `aussondernFahrzeugFixtures` ausdruecklich einen
 *    WIEDERVERWENDET. Der Unterschied ist die BOX: sie ist ein eigener
 *    Lagerort, und was die Spec dorthin bucht, steht danach in der
 *    Boxansicht — mit einem geteilten Artikel zaehlte jeder Lauf eine Zeile
 *    mehr, und eine als „genau eine" geschriebene Zusicherung waere
 *    laufabhaengig. INAKTIV ist er trotzdem nicht: die Helferflaeche zeigt nur,
 *    was Bestand hat, und ein inaktiver Artikel bliebe dort sichtbar (der
 *    Lesepfad filtert `artikel.aktiv` bewusst nicht).
 *  * ⚠️ MINDESTBESTAND 0 und ein Name ohne „Pflaster"/„Kompresse": sonst
 *    verschoebe er die Zahlen, die Bestellliste, Kennzahlen und der
 *    Bestandsexport zusichern (I-14).
 *
 * ⚠️ ZWEI CHARGEN, NICHT EINE. Die Chargenwahl der beiden Flaechen erscheint
 * NUR, wenn es mehr als eine gibt — mit einer einzigen bliebe der Zweig
 * ungeprueft, und zwar still: die Spec waere gruen, weil sie die Vorgabe
 * benutzt.
 *
 * ⚠️ BEIDE VERFALLSMONATE IM FERNEN BAND (`E2E_VERFALL_FERN` und ein Monat
 * darunter): ein naher Monat waere eine Zeitbombe fuer die Verfallsliste, die
 * eine Nachbarspec durchzaehlt.
 *
 * ⚠️ KEINE SOLL-POSITION. Der Anlass des Tickets ist „jemand hat zu viel drauf
 * gelegt" — genau das ist Bestand OHNE Soll, und der Lesepfad der Boxflaeche
 * geht deshalb ueber den BESTAND und nicht ueber `sollFuerFahrzeug`. Eine
 * Soll-Position hier machte die Spec blind fuer diese Entscheidung.
 */
function entnahmeboxFixtures(): void {
  const db = getDb();
  db.insert(lagerorte).values({
    id: "e2e-box-fahrzeug", name: "E2E Box-RTW", typ: "fahrzeug",
    kennung: "MS-E2E-9", aktiv: true, templateId: null, einheitenart: "fahrzeug",
  }).onConflictDoNothing().run();

  db.insert(artikel).values({
    id: "e2e-box-artikel", name: "E2E Box Rettungsdecke", einheit: "Stk.", fach: "BOX-1",
    mindestbestand: 0, aktiv: true, kategorie: "E2E Box", createdAt: JETZT,
  }).onConflictDoNothing().run();

  db.insert(chargen).values([
    { id: "e2e-box-charge-alt", artikelId: "e2e-box-artikel", chargenNr: "E2E-BOX-ALT",
      verfall: "2089-01", createdAt: JETZT },
    { id: "e2e-box-charge-neu", artikelId: "e2e-box-artikel", chargenNr: "E2E-BOX-NEU",
      verfall: E2E_VERFALL_FERN, createdAt: JETZT },
  ]).onConflictDoNothing().run();

  // Idempotent ueber die Referenz: ein zweiter Seed-Lauf darf den Bestand nicht
  // verdoppeln, und `buchungen` traegt keinen eindeutigen Index dafuer.
  const schon = db.select().from(buchungen)
    .where(eq(buchungen.referenz, "e2e-box-seed")).get();
  if (!schon) {
    for (const [chargeId, menge] of [
      ["e2e-box-charge-alt", 6], ["e2e-box-charge-neu", 6],
    ] as const) {
      db.insert(buchungen).values({
        id: newId(), ts: JETZT, typ: "zugang", artikelId: "e2e-box-artikel",
        chargeId, lagerortId: "e2e-box-fahrzeug", menge,
        quelleTyp: "system", quelleId: "e2e",
        referenz: "e2e-box-seed", kommentar: null,
      }).run();
    }
  }
}

/**
 * EIGENE Zeilen fuer `lagerbuch-einraeumen.spec.ts` (DRK-381) — der Weg ZURUECK
 * aus der Kiste in einen Schrank des Handlagers.
 *
 * ⚠️ EIGENE ZEILEN NEBEN `entnahmeboxFixtures`, OBWOHL BEIDE DIESELBE KISTE
 * BETREFFEN. Die Specs laufen gegen DIESELBE Datenbank (`workers: 1`), und
 * beide SCHREIBEN — die eine fuellt die Box, die andere leert sie. Auf
 * geteilten Zeilen waere jede Zusicherung der einen von der Reihenfolge der
 * anderen abhaengig: isoliert gruen, im Verbund rot. Genau die Abhaengigkeit,
 * die `entnahmeboxFixtures` fuer sich schon ausschliesst.
 *
 * ⚠️ DER BESTAND LIEGT DIREKT IN DER BOX, nicht auf einer Einheit. Diese Spec
 * misst den Rueckweg; ihn ueber den Hinweg vorzubereiten hiesse, in JEDEM Lauf
 * zuerst die Zusicherung einer anderen Spec mitzupruefen — und bei einem
 * Fehlschlag stuende die Ursache in der falschen Datei.
 *
 * ⚠️ REICHLICH BESTAND (je 40), weil die Spec ABBAUT. CI faehrt `retries: 2`
 * gegen dieselbe Datenbank, und der Seed ist idempotent — ein knapper Vorrat
 * waere im dritten Versuch aufgebraucht, und der Test meldete sich als „Menge
 * nicht gedeckt", also als etwas ganz anderes.
 *
 * ⚠️ ZWEI CHARGEN, NICHT EINE: die Chargenwahl der Einraeumflaeche erscheint
 * nur, wenn es mehr als eine gibt. Mit einer einzigen bliebe der Zweig
 * ungeprueft — und zwar STILL, weil die Spec dann die Vorbelegung benutzt.
 *
 * ⚠️ EIN EIGENER SCHRANK ALS ZIEL. Ein geteilter waere in der Zielwahl
 * derselbe Eintrag, den `lagerbuch-schraenke` stilllegt und reaktiviert — die
 * Zielzeile verschwaende dann je nach Reihenfolge.
 *
 * ⚠️ MINDESTBESTAND 0 und ein Name ohne „Pflaster"/„Kompresse": sonst
 * verschoebe der Artikel die Zahlen, die Bestellliste, Kennzahlen und
 * Bestandsexport zusichern (I-14).
 */
function einraeumenFixtures(): void {
  const db = getDb();
  db.insert(lagerorte).values({
    id: "e2e-einraeum-schrank", name: "E2E Einräum-Schrank", typ: "lager",
    parentId: HANDLAGER_ID, sortierung: 90, zugangshinweis: null, aktiv: true,
  }).onConflictDoNothing().run();

  db.insert(artikel).values({
    id: "e2e-einraeum-artikel", name: "E2E Einräum Rettungsdecke", einheit: "Stk.",
    fach: "EIN-1", mindestbestand: 0, aktiv: true, kategorie: "E2E Einräumen",
    createdAt: JETZT,
  }).onConflictDoNothing().run();

  db.insert(chargen).values([
    { id: "e2e-einraeum-charge-alt", artikelId: "e2e-einraeum-artikel",
      chargenNr: "E2E-EIN-ALT", verfall: "2089-02", createdAt: JETZT },
    { id: "e2e-einraeum-charge-neu", artikelId: "e2e-einraeum-artikel",
      chargenNr: "E2E-EIN-NEU", verfall: E2E_VERFALL_FERN, createdAt: JETZT },
  ]).onConflictDoNothing().run();

  // Idempotent ueber die Referenz: ein zweiter Seed-Lauf darf den Bestand nicht
  // verdoppeln, und `buchungen` traegt keinen eindeutigen Index dafuer.
  const schon = db.select().from(buchungen)
    .where(eq(buchungen.referenz, "e2e-einraeum-seed")).get();
  if (!schon) {
    for (const chargeId of ["e2e-einraeum-charge-alt", "e2e-einraeum-charge-neu"] as const) {
      db.insert(buchungen).values({
        id: newId(), ts: JETZT, typ: "zugang", artikelId: "e2e-einraeum-artikel",
        chargeId, lagerortId: ENTNAHMEBOX_ID, menge: 40,
        quelleTyp: "system", quelleId: "e2e",
        referenz: "e2e-einraeum-seed", kommentar: null,
      }).run();
    }
  }
}

/**
 * Ein Artikel MIT Kategorie fuer `lagerbuch-kategorien.spec.ts` (DRK-294).
 *
 * INAKTIV und ohne Charge, und beides mit Absicht: die Artikelliste zeigt
 * inaktive Artikel (`inklInaktiv: true`), Etiketten, Bestellliste, Kennzahlen und
 * Helfer-Ansicht lesen dagegen nur aktive — so zaehlt kein anderer Spec eine
 * Zeile mehr. Die Kategorie traegt ein `E2E`-Praefix, damit sie mit keiner
 * echten Kategorie zusammenfaellt.
 */
function kategorieFixtures(): void {
  getDb().insert(artikel).values({
    id: "e2e-kategorie-artikel", name: "E2E Kategorie Funkkabel", einheit: "Stk.", fach: "K1",
    mindestbestand: 0, aktiv: false, kategorie: "E2E Technik", createdAt: JETZT,
  }).onConflictDoNothing().run();
}

/**
 * DRK-299 — EIGENE aktive Artikel fuer `lagerbuch-inventur.spec.ts`.
 *
 * EIGENE, weil der Spec BUCHT: ein geteilter Artikel veraenderte den Bestand,
 * den andere Specs zusichern (I-14, siehe `artikelMitBestand`). Mindestbestand 0
 * (nicht in Bestellliste und „Kritische Artikel"), keine Soll-Position (nicht
 * auf Fahrzeugblatt und Checkliste), Kategorie NICHT `E2E Technik` (die zaehlt
 * `lagerbuch-kategorien.spec.ts`), Namen kuerzer als der laengste Etikettentitel
 * (`lagerbuch-mobil.spec.ts`) und ohne „Pflaster" (`lagerbuch-bestand-export`).
 *
 * ⚠️ VERFALL IM FERNEN BAND, nicht „2031-01" wie im Brief: `E2E_VERFALL_FERN`
 * schreibt aus, warum ein naher Monat eine Zeitbombe fuer die Verfallsliste ist.
 *
 * Der ZWEITE Artikel (ohne Charge, Fach `INV-2`) ist die gezaehlte Zeile, die
 * der Fachfilter ausblendet — der Spec zaehlt ihn per +/- auf seinen eigenen
 * Stand, damit nichts korrigiert wird und der Hinweis trotzdem erscheint.
 */
function inventurFixtures(): void {
  const db = getDb();
  for (const [id, name, fach] of [
    ["e2e-inventur-artikel", "E2E Inventur Kompressen", "INV-1"],
    ["e2e-inventur-zweit", "E2E Inventur Binden", "INV-2"],
  ] as const) {
    db.insert(artikel).values({
      id, name, einheit: "Stk.", fach,
      mindestbestand: 0, aktiv: true, kategorie: "E2E Inventur", createdAt: JETZT,
    }).onConflictDoNothing().run();
  }
  for (const [id, chargenNr, verfall, menge] of [
    ["e2e-inventur-charge-a", "E2E-INV-A", "2090-01", 5],
    ["e2e-inventur-charge-b", "E2E-INV-B", "2090-06", 3],
  ] as const) {
    db.insert(chargen).values({ id, artikelId: "e2e-inventur-artikel", chargenNr, verfall, createdAt: JETZT })
      .onConflictDoNothing().run();
    if (!db.select().from(buchungen).where(eq(buchungen.chargeId, id)).get()) {
      db.insert(buchungen).values({
        id: newId(), ts: JETZT, typ: "zugang", artikelId: "e2e-inventur-artikel", chargeId: id,
        lagerortId: HANDLAGER_ID, menge, quelleTyp: "system", quelleId: "e2e", referenz: null, kommentar: null,
      }).run();
    }
  }
  ortsFixtures();
}

/**
 * DRK-337 — EIN EIGENER SCHRANK MIT EINEM EIGENEN ARTIKEL.
 *
 * ⚠️ NICHT die Schraenke aus `lagerbuch-schraenke.spec.ts` mitbenutzen:
 * Playwright faehrt alle Specs in EINEM Worker gegen EINE Datei, und dieser
 * Spec BUCHT. Eine Korrektur in einem geteilten Schrank verschoebe die
 * Bestandszusagen des anderen Specs — derselbe Grund, aus dem
 * `inventurFixtures` schon heute eigene Artikel anlegt.
 *
 * Die Verteilung ist der ganze Fall: 4 auf der Wurzel („noch keinem Schrank
 * zugeordnet"), 6 im Schrank. Wer vor dem Schrank steht, muss 6 lesen — nicht
 * die Summe 10. Beide Zahlen sind verschieden und keine ist das Doppelte der
 * anderen, damit ein Test nicht versehentlich richtig liegt.
 */
function ortsFixtures(): void {
  const db = getDb();
  db.insert(lagerorte).values({
    id: "e2e-inventur-schrank", name: "E2E Inventurschrank", typ: "lager",
    kennung: null, aktiv: true, templateId: null,
    parentId: HANDLAGER_ID, sortierung: 70, zugangshinweis: null,
  }).onConflictDoNothing().run();
  db.insert(artikel).values({
    id: "e2e-inventur-ort", name: "E2E Inventur Ortszählung", einheit: "Stk.", fach: "INV-3",
    mindestbestand: 0, aktiv: true, kategorie: "E2E Inventur", createdAt: JETZT,
  }).onConflictDoNothing().run();
  db.insert(chargen).values({
    id: "e2e-inventur-charge-ort", artikelId: "e2e-inventur-ort",
    chargenNr: "E2E-INV-ORT", verfall: "2090-09", createdAt: JETZT,
  }).onConflictDoNothing().run();
  if (!db.select().from(buchungen).where(eq(buchungen.chargeId, "e2e-inventur-charge-ort")).get()) {
    for (const [lagerortId, menge] of [[HANDLAGER_ID, 4], ["e2e-inventur-schrank", 6]] as const) {
      db.insert(buchungen).values({
        id: newId(), ts: JETZT, typ: "zugang", artikelId: "e2e-inventur-ort",
        chargeId: "e2e-inventur-charge-ort", lagerortId, menge,
        quelleTyp: "system", quelleId: "e2e", referenz: null, kommentar: null,
      }).run();
    }
  }
}

/**
 * DRK-339 — EINE ABGELAUFENE CHARGE IN ZWEI SCHRAENKEN.
 *
 * Genau die Lage, in der die Verfallsliste den Ort ABFRAGEN muss statt ihn nur
 * zu nennen: eine Charge, deren Handlager-Rest auf zwei Orte verteilt ist.
 *
 * ⚠️ EIGENE SCHRAENKE UND EIN EIGENER ARTIKEL, nicht die aus
 * `ortsFixtures`/`lagerbuch-schraenke.spec.ts`: Playwright faehrt alle Specs in
 * EINEM Worker gegen EINE Datei, und dieser Spec BUCHT — er sondert einen der
 * beiden Schraenke aus. Auf einem geteilten Ort verschoebe das die
 * Bestandszusagen der anderen Specs.
 *
 * ⚠️ DER SPEC STELLT SEINEN ZUSTAND SELBST WIEDER HER, dieser Seed laeuft nur
 * einmal je Lauf. Die Wiederherstellung geht ueber eine GEGENBUCHUNG, nicht
 * ueber ein DELETE: `buchungen` ist append-only, ein Loeschversuch bricht am
 * Trigger `buchungen_no_delete` (Migration 0001).
 *
 * ⚠️ 4 UND 6, nicht 5 und 5: verschieden, und keine Zahl ist das Doppelte der
 * anderen — sonst laege eine Zusicherung versehentlich richtig. Der zweite
 * Schrank traegt einen Zugangshinweis, weil genau er in der Zeile als Zeichen
 * erscheint.
 */
const VERFALL_ORT_SCHRANK_A = "e2e-ortswahl-schrank-a";
const VERFALL_ORT_SCHRANK_B = "e2e-ortswahl-schrank-b";

function verfallOrtFixtures(): void {
  const db = getDb();
  db.insert(lagerorte).values([
    {
      id: VERFALL_ORT_SCHRANK_A, name: "E2E Ortswahl Schrank A", typ: "lager",
      kennung: null, aktiv: true, templateId: null,
      parentId: HANDLAGER_ID, sortierung: 81, zugangshinweis: null,
    },
    {
      id: VERFALL_ORT_SCHRANK_B, name: "E2E Ortswahl Schrank B", typ: "lager",
      kennung: null, aktiv: true, templateId: null,
      parentId: HANDLAGER_ID, sortierung: 82,
      zugangshinweis: "E2E Zugang nur über die GF",
    },
  ]).onConflictDoNothing().run();
  db.insert(artikel).values({
    /* ⚠️ DER NAME DARF KEIN WORT ENTHALTEN, NACH DEM EIN ANDERER SPEC SUCHT
     * (s. `vorgangFixtures`) — „Schere" kommt in keinem anderen Seed vor. */
    id: "e2e-ortswahl-artikel", name: "E2E Ortswahl Schere", einheit: "Stk.", fach: "OW-1",
    mindestbestand: 0, aktiv: true, createdAt: JETZT,
  }).onConflictDoNothing().run();
  db.insert(chargen).values({
    id: "e2e-ortswahl-charge", artikelId: "e2e-ortswahl-artikel", chargenNr: "E2E-OW",
    verfall: "2020-02", createdAt: JETZT,
  }).onConflictDoNothing().run();

  if (!db.select().from(buchungen).where(eq(buchungen.chargeId, "e2e-ortswahl-charge")).get()) {
    for (const [lagerortId, menge] of [
      [VERFALL_ORT_SCHRANK_A, 4], [VERFALL_ORT_SCHRANK_B, 6],
    ] as const) {
      db.insert(buchungen).values({
        id: newId(), ts: JETZT, typ: "zugang", artikelId: "e2e-ortswahl-artikel",
        chargeId: "e2e-ortswahl-charge", lagerortId, menge,
        quelleTyp: "system", quelleId: "e2e", referenz: null, kommentar: null,
      }).run();
    }
  }
}

/**
 * DRK-344 — drei Korrekturen auf EINEM eigenen Artikel, die sich NUR durch ihre
 * `referenz` unterscheiden.
 *
 * ⚠️ DAS PRAEFIX IST DER GANZE FALL. Alle drei tragen `typ: "korrektur"`; was
 * das Journal in der Spalte „Vorgang" schreibt, entscheidet allein `referenz`.
 * Ohne diese Zeilen liefe der Spec gegen eine Tabelle, in der die neuen
 * Vorgangsarten gar nicht vorkommen — er waere gruen, ohne etwas zu messen.
 *
 * ⚠️ EIGENER ARTIKEL, wie bei `checkFixtures`: Playwright faehrt alle Specs in
 * EINEM Worker gegen EINE Datei. Drei Korrekturen auf einem geteilten Artikel
 * verschoeben Bestandszusagen anderer Specs.
 *
 * Die Mengen sind absichtlich verschieden, damit eine Zeile nicht versehentlich
 * ueber eine andere zugesichert wird.
 */
function vorgangFixtures(): void {
  const db = getDb();
  db.insert(artikel).values({
    /*
     * ⚠️ DER NAME DARF KEIN WORT ENTHALTEN, NACH DEM EIN ANDERER SPEC SUCHT.
     * Gemessen: als der Artikel „E2E Vorgang Pflaster" hiess, fiel
     * `lagerbuch-bestand-export.spec.ts` — der sucht „Pflaster" und sichert zu,
     * dass GENAU EIN Artikel uebrigbleibt. Playwright faehrt alle Specs in EINEM
     * Worker gegen EINE Datei; ein Seed-Name ist damit geteilter Zustand.
     */
    id: "e2e-vorgang-artikel", name: "E2E Vorgang Wundauflage", einheit: "Stk.", fach: "VG-1",
    mindestbestand: 0, aktiv: true, createdAt: JETZT,
  }).onConflictDoNothing().run();
  db.insert(chargen).values({
    id: "e2e-vorgang-charge", artikelId: "e2e-vorgang-artikel", chargenNr: "E2E-VG",
    verfall: E2E_VERFALL_FERN, createdAt: JETZT,
  }).onConflictDoNothing().run();

  /*
   * ⚠️ JEDE ZEILE EINE EIGENE MINUTE, und das ist keine Kosmetik. Das Journal
   * sortiert `ts DESC, id DESC`; bei gleichem Zeitstempel entscheidet allein der
   * id-Tiebreaker, und der ordnet diese vier alphabetisch RUECKWAERTS
   * (zugang > inventur > handkorrektur > aussonderung) — eine Reihenfolge, die
   * mit der fachlichen nichts zu tun hat und sich beim naechsten Umbenennen
   * lautlos dreht. Der Spec sichert die Reihenfolge zu; also muss sie aus den
   * Daten kommen, nicht aus den Namen.
   *
   * ⚠️ DIE PRAEFIXE KOMMEN AUS `_lib/vorgang.ts`, nicht abgeschrieben. Ein
   * Tippfehler hier machte den Spec still wirkungslos: die Zeile stuende als
   * „Korrektur" da, und die Zusicherung „Aussonderung" faende sie nicht — was
   * wie ein Fehler in der Anzeige aussaehe statt wie einer im Seed.
   */
  const vorgangZeilen = [
    { id: "e2e-vorgang-zugang", menge: 30, referenz: null, kommentar: null, vorMinuten: 3 },
    { id: "e2e-vorgang-handkorrektur", menge: -2, referenz: null, kommentar: "E2E verzählt", vorMinuten: 2 },
    {
      id: "e2e-vorgang-inventur", menge: -3, kommentar: "E2E Jahresinventur",
      referenz: `${INVENTUR_PRAEFIX}e2e-vg-lauf`, vorMinuten: 1,
    },
    {
      id: "e2e-vorgang-aussonderung", menge: -4, kommentar: "E2E abgelaufen entsorgt",
      referenz: `${AUSSONDERN_PRAEFIX}${HANDLAGER_ID}`, vorMinuten: 0,
    },
  ] as const;
  for (const z of vorgangZeilen) {
    if (db.select().from(buchungen).where(eq(buchungen.id, z.id)).get()) continue;
    db.insert(buchungen).values({
      id: z.id,
      ts: new Date(JETZT.getTime() - z.vorMinuten * 60_000),
      typ: z.id === "e2e-vorgang-zugang" ? "zugang" : "korrektur",
      artikelId: "e2e-vorgang-artikel", chargeId: "e2e-vorgang-charge",
      lagerortId: HANDLAGER_ID, menge: z.menge,
      quelleTyp: "system", quelleId: "e2e", referenz: z.referenz, kommentar: z.kommentar,
    }).run();
  }
}

/**
 * DRK-372 — EINE Buchung mit einem ueberlangen Kommentar, allein fuer
 * `lagerbuch-zellentext.spec.ts`.
 *
 * ⚠️ DIE LAENGE IST DER GANZE FALL. Der Spec misst, dass die Freitextspalte
 * schmaler bleibt als ihr eigener Satz — mit einem kurzen Kommentar waere die
 * Zusicherung trivial wahr und der Lauf gruen, ohne etwas zu messen. `buchungen.
 * kommentar` hat keine Laengengrenze; der Satz hier ist der Altbestandsfall,
 * gegen den der Deckel gebaut ist.
 *
 * ⚠️ EIGENER ARTIKEL MIT EIGENEM NAMEN, wie bei `vorgangFixtures`: Playwright
 * faehrt alle Specs in EINEM Worker gegen EINE Datei. „Warnweste" kommt in
 * keinem anderen Seed vor — ein geteiltes Wort machte fremde Trefferzusagen
 * rennabhaengig.
 */
function zellentextFixtures(): void {
  const db = getDb();
  db.insert(artikel).values({
    id: "e2e-zellentext-artikel", name: E2E_ZELLENTEXT_ARTIKEL, einheit: "Stk.", fach: "ZT-1",
    mindestbestand: 0, aktiv: true, createdAt: JETZT,
  }).onConflictDoNothing().run();
  db.insert(chargen).values({
    id: "e2e-zellentext-charge", artikelId: "e2e-zellentext-artikel", chargenNr: "E2E-ZT",
    verfall: E2E_VERFALL_FERN, createdAt: JETZT,
  }).onConflictDoNothing().run();
  if (!db.select().from(buchungen).where(eq(buchungen.id, "e2e-zellentext-buchung")).get()) {
    db.insert(buchungen).values({
      id: "e2e-zellentext-buchung", ts: JETZT, typ: "zugang",
      artikelId: "e2e-zellentext-artikel", chargeId: "e2e-zellentext-charge",
      lagerortId: HANDLAGER_ID, menge: 5,
      quelleTyp: "system", quelleId: "e2e", referenz: null,
      kommentar: E2E_ZELLENTEXT_KOMMENTAR,
    }).run();
  }
}

/**
 * DRK-293 — zwei Artikel allein fuer `lagerbuch-sammelbearbeitung.spec.ts`.
 *
 * INAKTIV, aus demselben Grund wie `kategorieFixtures`: nur die Artikelliste
 * liest `inklInaktiv: true`, also zaehlt kein anderer Spec dadurch eine Zeile
 * mehr. Die Kategorie traegt ein `E2E`-Praefix und faellt mit keiner echten
 * zusammen — der Spec schiebt sie zwischen zwei solchen Werten hin und her,
 * damit ein zweiter Anlauf (`retries`) dieselbe Zusage pruefen kann.
 */
function sammelFixtures(): void {
  for (const [id, name] of [
    ["e2e-sammel-eins", "E2E Sammel Kompresse"],
    ["e2e-sammel-zwei", "E2E Sammel Dreiecktuch"],
  ] as const) {
    getDb().insert(artikel).values({
      id, name, einheit: "Stk.", fach: "S1",
      mindestbestand: 0, aktiv: false, kategorie: "E2E Sammel Eins", createdAt: JETZT,
    }).onConflictDoNothing().run();
  }
}

/**
 * DRK-334 — genug Artikel, dass die Artikeltabelle tatsaechlich virtualisiert.
 *
 * Ohne sie gaebe es den inneren Scrollcontainer gar nicht, und
 * `lagerbuch-artikel-mobil.spec.ts` pruefte eine gewoehnliche Tabelle — gruen,
 * und ohne die Aussage, um die es geht.
 *
 * INAKTIV und OHNE KATEGORIE: inaktiv, weil nur `/verwaltung/artikel`
 * `inklInaktiv: true` liest (Begruendung bei `E2E_LAST_ANZAHL`); ohne
 * Kategorie, weil `lagerbuch-kategorien.spec.ts` die Auswahlliste
 * „Kategorien dauerhaft ausblenden" zaehlt. Mindestbestand 0 haelt sie aus
 * „Kritische Artikel" und der Bestellliste heraus, auch wenn die je einmal
 * inaktive Artikel lesen sollten.
 *
 * ⚠️ SIE MUESSEN GANZ UNTEN STEHEN, UND DAFUER ZAEHLT DER NAME — nicht die
 * Einfuegereihenfolge. `artikelListe` hat zwar kein ORDER BY, aber die Tabelle
 * sortiert von sich aus aufsteigend nach Namen (`ArtikelTable.tsx`,
 * `sortierung` startet auf `name`/`ascend`). Deshalb traegt der Praefix ein
 * „ZZZ": alles, was ein Spec gezielt sucht, bleibt so in den ersten Zeilen und
 * damit im gerenderten Fenster der virtuellen Tabelle. Die volle Begruendung
 * steht bei `E2E_LAST_PRAEFIX`.
 */
function lastFixtures(): void {
  const db = getDb();
  for (let i = 1; i <= E2E_LAST_ANZAHL; i += 1) {
    const nr = String(i).padStart(3, "0");
    db.insert(artikel).values({
      id: `e2e-last-${nr}`, name: `${E2E_LAST_PRAEFIX} ${nr}`, einheit: "Stk.",
      fach: "L9", mindestbestand: 0, aktiv: false, kategorie: null, createdAt: JETZT,
    }).onConflictDoNothing().run();
  }
}

/**
 * DAS GEBUNDENE FAHRZEUG-KAERTCHEN — `e2e/lagerbuch-fahrzeug-kaertchen.spec.ts`
 * (DRK-302).
 *
 * Es zeigt auf DAS Fahrzeug, das `checkFixtures()` ohnehin anlegt, und braucht
 * deshalb kein eigenes: der Spec liest nur, er bucht nichts. Was er
 * hinterlaesst, ist `tokens.last_used_at` dieses einen Codes — und den liest
 * keine andere Spec.
 *
 * ⚠️ DIE REIHENFOLGE GEGENUEBER `checkFixtures()` IST EGAL — `tokens.ziel_id`
 * traegt bewusst KEINEN Fremdschluessel (`_db/schema.ts`), beim Einfuegen wird
 * also nichts geprueft. WAS ZAEHLT, IST DIE ID: zeigt das Kaertchen auf etwas
 * anderes als das Fahrzeug, das `checkFixtures()` anlegt, faellt die
 * Check-Seite auf die volle Wahl zurueck (der Fall „gebundenes Fahrzeug
 * geloescht"), und der Spec waere gruen fuer „ungebunden waehlt frei" und rot
 * fuer jeden anderen Test — ohne dass die Fehlermeldung auf die Ursache zeigte.
 * Genau deshalb lesen BEIDE Funktionen dieselbe Konstante `E2E_FAHRZEUG_ID` aus
 * `helpers/lagerbuch.ts` und keine Literale.
 */
function fahrzeugKaertchenFixtures(): void {
  getDb().insert(tokens).values({
    // ⚠️ DAS LABEL TRAEGT DEN FAHRZEUGNAMEN BEWUSST NICHT. Es landet im
    // Sitzungsetikett des Helfer-Rahmens („Zugang: Token … · <label>"), und ein
    // „E2E RTW Kärtchen" machte jede Zusicherung auf den Fahrzeugnamen im Spec
    // zahnlos: sie waere auch dann gruen, wenn die Ueberschrift ueber dem
    // Check-Schritt ganz fehlte.
    id: "e2e-fahrzeug-token", code: E2E_TOKEN_FAHRZEUG, label: "E2E Fahrzeugkärtchen",
    aktiv: true, createdAt: JETZT, createdBy: "e2e", scopeLagerortId: null,
    zielTyp: "fahrzeug", zielId: E2E_FAHRZEUG_ID, lastUsedAt: null,
  }).onConflictDoNothing().run();
}

/**
 * EIGENER ARTIKEL fuer `e2e/lagerbuch-check-angemeldet.spec.ts` (DRK-305).
 *
 * ⚠️ DIESELBE BEGRUENDUNG WIE BEI `checkFixtures()`, und sie ist keine
 * Foermlichkeit: Playwright faehrt alle Specs in EINEM Worker gegen EINE
 * Datenbankdatei. Der angemeldete Entnahme-Lauf schliesst eine echte Buchung ab;
 * liefe er auf `e2e-artikel`, senkte er bei jedem Lauf und bei jedem Retry den
 * Handlager-Bestand, den `lagerbuch-helfer.spec.ts` zusichert — und haenge
 * dessen Ergebnis still an der Reihenfolge und an der Zahl der Wiederholungen.
 * Der Befund kam aus der Codex-Review zu PR #164.
 *
 * KEIN eigenes Fahrzeug: gebucht wird auf `E2E_FAHRZEUG_ID`, das den Weg
 * Schrank → Fahrzeug ohnehin schon von `lagerbuch-helfer.spec.ts` erhaelt. Ein
 * drittes aktives Fahrzeug stuende dagegen in jeder Fahrzeugliste, jedem
 * Checklistenbogen und jeder Fahrzeugwahl der ganzen Suite.
 *
 * Die Menge ist grosszuegig (50): der Lauf entnimmt 1 je Durchgang, und der Seed
 * ist additiv-idempotent — er fuellt NICHT wieder auf
 * (`artikelMitBestand` schreibt die Zugangsbuchung nur beim ersten Mal).
 */
function angemeldetFixtures(): void {
  artikelMitBestand(
    "e2e-konto-artikel", "E2E Konto Kompresse", "A4",
    "e2e-konto-charge", "E2E-KONTO", 50);
}

migriere();
helferFixtures();
verfallFixtures();
checkFixtures();
geraeteFixtures();
fahrzeugKaertchenFixtures();
bestellFixtures();
vorlagenFixtures();
einheitenartFixtures();
fahrzeugVerfallFixtures();
aussondernFahrzeugFixtures();
entnahmeboxFixtures();
einraeumenFixtures();
kategorieFixtures();
inventurFixtures();
verfallOrtFixtures();
vorgangFixtures();
zellentextFixtures();
sammelFixtures();
angemeldetFixtures();
lastFixtures();
console.log(`[e2e] lagerbuch migriert + geseedet: ${moduleDbPath("lagerbuch")}`);
