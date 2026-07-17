import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, sep } from "node:path";

const DATA_DIR = () => process.env.DATA_DIR ?? "./.data";

export function moduleDbPath(key: string): string {
  return `${DATA_DIR()}${sep}${key}.db`;
}

export function openModuleDatabase(path: string): Database.Database {
  if (path !== ":memory:") {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  return sqlite;
}

const g = globalThis as unknown as { __suiteDb?: Record<string, unknown> };

export function getModuleDb<TSchema extends Record<string, unknown>>(
  key: string,
  schema: TSchema,
): BetterSQLite3Database<TSchema> {
  g.__suiteDb ??= {};
  if (!g.__suiteDb[key]) {
    g.__suiteDb[key] = drizzle(openModuleDatabase(moduleDbPath(key)), { schema });
  }
  return g.__suiteDb[key] as BetterSQLite3Database<TSchema>;
}
