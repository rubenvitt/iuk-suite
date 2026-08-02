import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openModuleDatabase, moduleDbPath, getModuleDb } from "@/core/db";
import { MODULES } from "@/core/registry";
import { validateHostConfig } from "@/core/hosts";
import { validateGroupConfig } from "@/core/groups";
import * as portalSchema from "@/app/m/portal/_db/schema";
import { seedPortal } from "@/app/m/portal/_lib/seed";
import * as qrSchema from "@/app/m/qr/_db/schema";
import { seedQr } from "@/app/m/qr/_lib/seed";
import * as feedbackSchema from "@/app/m/feedback/_db/schema";
import { seedFeedback } from "@/app/m/feedback/_lib/seed";
import { filesBootFehler, starteFilesHintergrund } from "@/app/m/files/_lib/boot";

// Module mit eigener SQLite-DB + Migrationen. Neue Module hier eintragen.
// Migrations-Pfad ist cwd-relativ: Dev = Repo-Root, Prod = /app (Dockerfile
// kopiert den Ordner an genau diesen Pfad in das standalone-Image).
export const MODULE_MIGRATIONS: { key: string; migrationsFolder: string }[] = [
  { key: "portal", migrationsFolder: "src/app/m/portal/_db/migrations" },
  { key: "qr", migrationsFolder: "src/app/m/qr/_db/migrations" },
  { key: "feedback", migrationsFolder: "src/app/m/feedback/_db/migrations" },
  // files: bewusst OHNE Schema-Import und OHNE Seed unten. Der Schema-Import
  // wäre toter Code — `migrateAllModules()` migriert schema-frei, einziger
  // Konsument der Importe ist `seedAllModules()`. Und ein Seed-Abgabelink wäre
  // in einer Generalprobe ein gültiger anonymer Schreibzugang.
  { key: "files", migrationsFolder: "src/app/m/files/_db/migrations" },
];

/**
 * Bricht den Boot ab, wenn `SUITE_HOST_*` nicht zu den bekannten Modulen passt
 * (Tippfehler im Variablennamen, doppelt vergebener Host, Protokoll/Port im
 * Wert). Fail fast: eine stille Fehlkonfiguration führte sonst dazu, dass eine
 * Domain auf den Portal-Fallback läuft und dort das falsche Modul zeigt.
 *
 * `async` seit dem Modul `files`: seine Boot-Prüfung 6 legt die Blob-Ablage an
 * und liest eine Probedatei zurück (Spec §5.6, §9.4) — das geht nur mit `await`.
 * Der Aufrufer MUSS awaiten; ohne das wird aus dem Startabbruch eine
 * unbehandelte Rejection, die nichts abbricht (bewacht in `bootstrap.test.ts`).
 */
export async function assertHostConfig(): Promise<void> {
  const keys = MODULES.map((m) => m.key);
  const errors = [
    ...validateHostConfig(keys),
    ...validateGroupConfig(keys),
    ...(await filesBootFehler()),
  ];
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

/**
 * Alles, was ein Modul einmal je Prozess im Hintergrund startet — gerufen aus
 * `src/instrumentation.ts` NACH `migrateAllModules()`, weil die Arbeiter
 * Tabellen lesen.
 *
 * Bewusst getrennt von `migrateAllModules()`: ein Migrationslauf ist auch aus
 * einem Import-Skript oder einem Test sinnvoll (`scripts/import/*.ts`), ein
 * Hintergrundarbeiter dort nie.
 */
export function startBackgroundWork(): void {
  starteFilesHintergrund();
}

export async function seedAllModules(): Promise<void> {
  await seedPortal(getModuleDb("portal", portalSchema));
  await seedQr(getModuleDb("qr", qrSchema));
  await seedFeedback(getModuleDb("feedback", feedbackSchema));
}
