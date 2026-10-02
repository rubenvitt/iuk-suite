import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openModuleDatabase } from "@/core/db";
import * as schema from "../_db/schema";

/** Frische In-Memory-DB mit den echten Migrationen (inklusive Audit-Trigger). */
export function testDb() {
  const db = drizzle(openModuleDatabase(":memory:"), { schema });
  migrate(db, { migrationsFolder: "src/app/m/kommplan/_db/migrations" });
  return db;
}
export type TestDb = ReturnType<typeof testDb>;

/**
 * Ein Modul-Admin mit der Kennung `u1` — wie `WER` in den Tests der Planverwaltung: er verwaltet jeden geteilten Plan
 * (der Seed ist geteilt) und besitzt die privaten Kopien, die `WER` anlegt (`_lib/rechte.ts`).
 */
export const TEST_ADMIN = { nutzer: "u1", admin: true } as const;
