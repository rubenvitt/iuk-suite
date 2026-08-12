import { it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { mkdirSync, rmSync } from "node:fs";
import * as schema from "@/app/m/portal/_db/schema";

const TEST_DATA_DIR = "./.data/portal-einstellungen-test";

// getDb() geht über core/db/getModuleDb(), und das cacht die Verbindung
// PROZESSWEIT auf globalThis.__suiteDb["portal"] (core/db/index.ts:27-36).
// Vitest teilt sich einen JS-Realm über alle it() dieser Datei — ein bloßes
// rmSync trifft nur die Datei, nicht diesen Cache: die im ersten Test
// geöffnete Verbindung hält ihr Handle auf den inzwischen entfernten Inode
// und liefe an der frisch migrierten Datei komplett vorbei weiter, ohne dass
// je ein Fehler auftaucht (Fix-Runde 1, Befund aus der Durchsicht). Deshalb
// zwei zusätzliche Schritte gegenüber einem bloßen "Verzeichnis neu
// anlegen": die eigene, nur fürs Migrieren geöffnete Verbindung explizit
// schließen, und den globalen Cache verwerfen, damit der nächste
// getDb()-Aufruf im Testcode wirklich neu öffnet. Muster übernommen aus
// files/_lib/boot.test.ts ("frischeDatenbank"), das denselben Cache aus
// demselben Grund zurücksetzt.
beforeEach(() => {
  rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  process.env.DATA_DIR = TEST_DATA_DIR;
  mkdirSync(TEST_DATA_DIR, { recursive: true });
  const sqlite = new Database(`${TEST_DATA_DIR}/portal.db`);
  migrate(drizzle(sqlite, { schema }), { migrationsFolder: "./src/app/m/portal/_db/migrations" });
  sqlite.close();
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
});

it("liest null, solange nichts gesetzt ist", async () => {
  const { leseAnsprechpartner } = await import("@/app/m/portal/_lib/einstellungen");
  expect(await leseAnsprechpartner()).toBeNull();
});

it("liest den zuletzt gesetzten Wert", async () => {
  const { leseAnsprechpartner, setzeAnsprechpartner } = await import(
    "@/app/m/portal/_lib/einstellungen"
  );
  await setzeAnsprechpartner("IuK-Gruppe — iuk@kreisverband.example");
  expect(await leseAnsprechpartner()).toBe("IuK-Gruppe — iuk@kreisverband.example");
});

it("ein zweites Setzen überschreibt den ersten Wert (onConflictDoUpdate)", async () => {
  const { leseAnsprechpartner, setzeAnsprechpartner } = await import(
    "@/app/m/portal/_lib/einstellungen"
  );
  await setzeAnsprechpartner("erster Wert");
  await setzeAnsprechpartner("zweiter Wert");
  expect(await leseAnsprechpartner()).toBe("zweiter Wert");
});

// Der Leerzustand aus Task 6 unterscheidet "kein Ansprechpartner gepflegt" von
// "Ansprechpartner gepflegt" über genau diesen Rückgabewert — ein nur aus
// Leerraum bestehender Wert muss wie ein fehlender behandelt werden, sonst
// zeigt der Leerzustand fälschlich einen (leeren) Kontaktweg an.
it("behandelt einen nur aus Leerraum bestehenden Wert wie einen fehlenden", async () => {
  const { leseAnsprechpartner, setzeAnsprechpartner } = await import(
    "@/app/m/portal/_lib/einstellungen"
  );
  await setzeAnsprechpartner("   ");
  expect(await leseAnsprechpartner()).toBeNull();
});

// Isolationsbeweis (Fix-Runde 1): dieser Test setzt bewusst einen Wert, den
// KEIN nachfolgender Test mehr sehen darf. Ohne den Rücksetzweg im
// `beforeEach` oben würde er es doch — siehe Kommentar dort.
it("Isolationskanarienvogel: setzt einen Wert für den nächsten Test", async () => {
  const { setzeAnsprechpartner } = await import("@/app/m/portal/_lib/einstellungen");
  await setzeAnsprechpartner("darf im nächsten Test nicht mehr auftauchen");
});

it("liest wieder null, obwohl der vorige Test gerade einen Wert gesetzt hat", async () => {
  const { leseAnsprechpartner } = await import("@/app/m/portal/_lib/einstellungen");
  expect(await leseAnsprechpartner()).toBeNull();
});
