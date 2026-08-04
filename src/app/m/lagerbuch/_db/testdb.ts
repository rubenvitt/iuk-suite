import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "./schema";
import { falte } from "../_lib/suche";

export const MIGRATIONS_ORDNER = "src/app/m/lagerbuch/_db/migrations";

export type TestDb = {
  db: ReturnType<typeof drizzle<typeof schema>>;
  sqlite: Database.Database;
  schliessen: () => void;
};

/**
 * Eine frisch migrierte Test-Datenbank fuer alle `_db/*.test.ts` dieses Moduls.
 *
 * DREI EIGENSCHAFTEN, DIE JEDE EINZELN WEGLASSBAR AUSSAEHEN UND ES NICHT SIND:
 *
 * 1. DATEI-DB, NICHT :memory:. Nur der Dateiweg belegt, dass `migrate()` auf einer
 *    frisch angelegten Datei durchlaeuft — und genau das tut der Boot.
 * 2. `foreign_keys = ON`. Das Pragma ist eine VERBINDUNGS-Eigenschaft und in SQLite
 *    standardmaessig AUS. Ohne diese Zeile waeren saemtliche FK-Zusagen dieses
 *    Moduls gruen, ohne zu gelten.
 * 3. `lb_falte`. Dieselbe Funktion, die `_db/client.ts` registriert. Ohne sie
 *    scheitert jede Journalsuche im Test mit `no such function: lb_falte` — und
 *    zwar auf genau dem Codepfad, den der Produktivbetrieb faehrt.
 *
 * ABGESPIELT, NICHT GEPUSHT: die DB entsteht durch `migrate()` gegen das echte
 * Verzeichnis. Ein schema-gepushter Aufbau macht `append-only.test.ts` gruen und
 * INHALTSLEER — drizzle-kit erzeugt keine Trigger, ein Push traegt sie also nie.
 */
export function migrierteTestDb(praefix = "lagerbuch-"): TestDb {
  const ordner = mkdtempSync(join(tmpdir(), praefix));
  const sqlite = new Database(join(ordner, "lagerbuch.db"));
  sqlite.pragma("foreign_keys = ON");
  sqlite.function("lb_falte", { deterministic: true }, (v: string | null) =>
    v === null ? null : falte(v),
  );
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_ORDNER });
  const db = drizzle(sqlite, { schema });
  return {
    db,
    sqlite,
    schliessen: () => {
      sqlite.close();
      rmSync(ordner, { recursive: true, force: true });
    },
  };
}
