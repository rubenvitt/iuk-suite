import { openModuleDatabase, moduleDbPath } from "@/core/db";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { falte } from "../_lib/suche";

/**
 * WARUM lagerbuch NICHT `getModuleDb` benutzt: `journalEintraege` sucht ueber
 * zwei Haelften (JS-Artikelname, SQL-Kommentar), und die Haelften falten heute
 * verschieden (§5.13.2). Die einzige Heilung, die NICHTS speichert — und damit
 * am Append-only-Trigger vorbeikommt —, ist eine benutzerdefinierte
 * SQLite-Funktion zur Abfragezeit. `openModuleDatabase` bietet dafuer keinen
 * Haken, und eine core-Erweiterung haette heute KEINEN zweiten Nutzniesser.
 *
 * DER CACHE-SCHLUESSEL IST DERSELBE, den `getModuleDb` benutzt
 * (`globalThis.__suiteDb["lagerbuch"]`, core/db/index.ts:25-35). Das ist die
 * eigentliche Absicherung gegen zwei Verbindungen auf dieselbe WAL-Datei: ein
 * spaeter hinzugefuegtes `getModuleDb("lagerbuch", schema)` faende den
 * vorhandenen Eintrag MIT registrierter Funktion vor, statt eine zweite
 * Verbindung ohne sie zu oeffnen. Der Quelltext-Scan in client.test.ts bleibt
 * trotzdem — er haelt die Bauform fest, aber er ist nicht mehr die einzige
 * Absicherung.
 *
 * DIE VIER PRAGMAS (WAL, foreign_keys, busy_timeout, synchronous) kommen
 * unveraendert aus `openModuleDatabase`; dieser Opener ergaenzt allein `lb_falte`.
 *
 * TRAEGT DIESE RAHMUNG NICHT, ist der benannte Rueckfall Entscheidung (a): die
 * Ungleichheit der beiden Suchhaelften 1:1 uebernehmen und ausschreiben — nicht
 * eine halb gebaute UDF.
 */
const g = globalThis as unknown as { __suiteDb?: Record<string, unknown> };

export function getDb() {
  g.__suiteDb ??= {};
  if (!g.__suiteDb["lagerbuch"]) {
    const sqlite = openModuleDatabase(moduleDbPath("lagerbuch"));
    sqlite.function("lb_falte", { deterministic: true },
      (v: string | null) => (v === null ? null : falte(v)));
    g.__suiteDb["lagerbuch"] = drizzle(sqlite, { schema });
  }
  return g.__suiteDb["lagerbuch"] as ReturnType<typeof drizzle<typeof schema>>;
}

export type DB = ReturnType<typeof getDb>;
