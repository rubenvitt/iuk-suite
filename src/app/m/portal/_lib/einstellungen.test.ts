import { it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { mkdirSync, rmSync } from "node:fs";
import * as schema from "@/app/m/portal/_db/schema";

const TEST_DATA_DIR = "./.data/portal-einstellungen-test";

// getDb() liest DATA_DIR; hier isolierte Datei setzen und Migrationen anwenden
// — selbes Muster wie services.test.ts. Verzeichnis vor jedem Lauf frisch
// anlegen, damit der Test bei wiederholtem `pnpm test` idempotent bleibt.
beforeEach(() => {
  rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  process.env.DATA_DIR = TEST_DATA_DIR;
  mkdirSync(TEST_DATA_DIR, { recursive: true });
  const db = drizzle(new Database(`${TEST_DATA_DIR}/portal.db`), { schema });
  migrate(db, { migrationsFolder: "./src/app/m/portal/_db/migrations" });
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
