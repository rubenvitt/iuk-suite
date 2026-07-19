import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openModuleDatabase, moduleDbPath, getModuleDb } from "@/core/db";
import { MODULES } from "@/core/registry";
import { validateHostConfig } from "@/core/hosts";
import * as portalSchema from "@/app/m/portal/_db/schema";
import { seedPortal } from "@/app/m/portal/_lib/seed";

// Module mit eigener SQLite-DB + Migrationen. Neue Module hier eintragen.
// Migrations-Pfad ist cwd-relativ: Dev = Repo-Root, Prod = /app (Dockerfile
// kopiert den Ordner an genau diesen Pfad in das standalone-Image).
export const MODULE_MIGRATIONS: { key: string; migrationsFolder: string }[] = [
  { key: "portal", migrationsFolder: "src/app/m/portal/_db/migrations" },
];

/**
 * Bricht den Boot ab, wenn `SUITE_HOST_*` nicht zu den bekannten Modulen passt
 * (Tippfehler im Variablennamen, doppelt vergebener Host, Protokoll/Port im
 * Wert). Fail fast: eine stille Fehlkonfiguration führte sonst dazu, dass eine
 * Domain auf den Portal-Fallback läuft und dort das falsche Modul zeigt.
 */
export function assertHostConfig(): void {
  const errors = validateHostConfig(MODULES.map((m) => m.key));
  if (errors.length > 0) {
    throw new Error(`Ungültige Host-Konfiguration:\n  - ${errors.join("\n  - ")}`);
  }
}

// Schema-freies Migrieren: eigene Verbindung öffnen, migrieren, schließen.
// Muss vor dem ersten Request abgeschlossen sein (Instrumentation register()).
export function migrateAllModules(): void {
  for (const m of MODULE_MIGRATIONS) {
    const sqlite = openModuleDatabase(moduleDbPath(m.key));
    migrate(drizzle(sqlite), { migrationsFolder: m.migrationsFolder });
    sqlite.close();
  }
}

// Seed nur in Dev/CI/Generalprobe — nie in echter Prod.
export function shouldSeed(): boolean {
  return process.env.SUITE_SEED === "1" || process.env.NODE_ENV === "development";
}

export async function seedAllModules(): Promise<void> {
  await seedPortal(getModuleDb("portal", portalSchema));
}
