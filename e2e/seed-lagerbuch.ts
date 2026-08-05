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
  artikel, buchungen, chargen, geraete, lagerorte, o2Flaschen, sollPositionen, tokens, newId,
} from "@/app/m/lagerbuch/_db/schema";
import { HANDLAGER_ID } from "@/app/m/lagerbuch/_lib/konstanten";
import {
  E2E_TOKEN_HELFER, E2E_TOKEN_CHECK, E2E_TOKEN_GERAETE,
} from "./helpers/lagerbuch";

const JETZT = new Date();

/** Schema-frei migrieren — dieselbe Form wie `migrateAllModules()`
 *  (`core/bootstrap.ts:54-59`): eigene Verbindung, migrieren, schliessen. */
function migriere(): void {
  const sqlite = openModuleDatabase(moduleDbPath("lagerbuch"));
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/lagerbuch/_db/migrations" });
  sqlite.close();
}

/** Aktiver Token + Artikel mit Bestand > 0 fuer `e2e/lagerbuch-helfer.spec.ts`. */
function helferFixtures(): void {
  const db = getDb();
  db.insert(tokens).values({
    id: "e2e-token", code: E2E_TOKEN_HELFER, label: "E2E Helfer", aktiv: true,
    createdAt: JETZT, createdBy: "e2e", scopeLagerortId: null, zielTyp: null,
    zielId: null, lastUsedAt: null,
  }).onConflictDoNothing().run();

  db.insert(artikel).values({
    id: "e2e-artikel", name: "E2E Verbandpäckchen", einheit: "Stk.", fach: "A1",
    mindestbestand: 0, aktiv: true, createdAt: JETZT,
  }).onConflictDoNothing().run();

  db.insert(chargen).values({
    id: "e2e-charge", artikelId: "e2e-artikel", chargenNr: "E2E-001",
    verfall: "2030-01", createdAt: JETZT,
  }).onConflictDoNothing().run();

  if (!db.select().from(buchungen).where(eq(buchungen.chargeId, "e2e-charge")).get()) {
    db.insert(buchungen).values({
      id: newId(), ts: JETZT, typ: "zugang", artikelId: "e2e-artikel",
      chargeId: "e2e-charge", lagerortId: HANDLAGER_ID, menge: 10,
      quelleTyp: "system", quelleId: "e2e", referenz: null, kommentar: null,
    }).run();
  }
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
 * EIGENER Token + Fahrzeug fuer den Check-Spec.
 * ⚠️ Ohne den zweiten Code buchte der Check zusaetzlich mit `quelleId=111-111` in
 * das Journal des Helfer-Flows hinein — Playwright faehrt alle Specs in EINEM
 * Worker gegen EINE Datei (`lagerbuch/e2e/migrate-db.ts:84-88`).
 */
function checkFixtures(): void {
  const db = getDb();
  db.insert(tokens).values({
    id: "e2e-check-token", code: E2E_TOKEN_CHECK, label: "E2E Check", aktiv: true,
    createdAt: JETZT, createdBy: "e2e", scopeLagerortId: null, zielTyp: null,
    zielId: null, lastUsedAt: null,
  }).onConflictDoNothing().run();

  db.insert(lagerorte).values({
    id: "e2e-fahrzeug", name: "E2E RTW", typ: "fahrzeug", kennung: "MS-E2E-1",
    aktiv: true, templateId: null,
  }).onConflictDoNothing().run();

  db.insert(sollPositionen).values({
    id: "e2e-soll", fahrzeugId: "e2e-fahrzeug", fachLabel: "E2E Fach", sort: 0,
    artikelId: "e2e-artikel", soll: 3, templatePositionId: null,
    ueberschrieben: false, entfernt: false,
  }).onConflictDoNothing().run();

  // 300-bar-Flasche: der Fall, an dem der gestrichene `?? 200`-Rueckfall sichtbar
  // wird (§5.12). Sie steht bewusst am CHECK-Fahrzeug.
  db.insert(o2Flaschen).values({
    id: "e2e-o2", name: "E2E O2 300", lagerortId: "e2e-fahrzeug", groesseLiter: 10,
    nennfuelldruckBar: 300, aktiv: true, createdAt: JETZT,
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
    id: "e2e-geraete-fahrzeug", name: "E2E Geräte RTW", typ: "fahrzeug",
    kennung: "MS-E2E-2", aktiv: true, templateId: null,
  }).onConflictDoNothing().run();

  db.insert(sollPositionen).values({
    id: "e2e-geraete-soll", fahrzeugId: "e2e-geraete-fahrzeug", fachLabel: "E2E Fach",
    sort: 0, artikelId: "e2e-artikel", soll: 2, templatePositionId: null,
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

migriere();
helferFixtures();
verfallFixtures();
checkFixtures();
geraeteFixtures();
bestellFixtures();
console.log(`[e2e] lagerbuch migriert + geseedet: ${moduleDbPath("lagerbuch")}`);
