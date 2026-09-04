import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

/**
 * Eine frische In-Memory-Datenbank je Testfall.
 *
 * `foreign_keys = ON` ist NICHT Vorsorge: SQLite hat den Schalter per Vorgabe AUS, und
 * ohne ihn liefe der Cascade-Test gruen, waehrend die Produktivdatenbank
 * (`core/db/index.ts` setzt ihn) sich anders verhaelt.
 */
export function testDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/zeichen/_db/migrations" });
  return db;
}
