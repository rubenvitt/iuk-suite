import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "./schema";

export const MIGRATIONS_ORDNER = "src/app/m/aufgaben/_db/migrations";

export type TestDb = {
  db: ReturnType<typeof drizzle<typeof schema>>;
  sqlite: Database.Database;
  schliessen: () => void;
};

/**
 * Eine frisch migrierte Test-Datenbank fuer `_lib/zugang.test.ts`, `_db/queries.test.ts` und
 * `_lib/seedLokal.test.ts` — DREI Verbraucher, deshalb ein gemeinsamer Helfer statt dreifacher
 * Boilerplate.
 *
 * ANDERS ALS `lagerbuch/_db/testdb.ts`: KEINE Datei-DB und KEINE registrierte SQLite-Funktion.
 * `lagerbuch` braucht beides — dort belegt der Dateiweg, dass `migrate()` auf einer frisch
 * angelegten Datei durchlaeuft, und `lb_falte` ist eine SQLite-Funktion, die die Journalsuche
 * registrieren muss. `aufgaben` hat kein Aequivalent zu `lb_falte`, und die eigene
 * `migrations.test.ts` dieses Moduls migriert bereits erfolgreich gegen `:memory:` — dieselbe
 * Bauform wie hier, nur bisher je Testdatei einzeln (vgl. `feedback/_db/queries.test.ts`).
 *
 * `foreign_keys = ON`, weil sonst FK-Zusagen (z. B. das Cascade von `verlauf`/`nachweise`/
 * `dateien` ueber `aufgabe_id`) im Test gruen waeren, ohne zu gelten.
 */
export function migrierteTestDb(): TestDb {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_ORDNER });
  return {
    db,
    sqlite,
    schliessen: () => sqlite.close(),
  };
}
