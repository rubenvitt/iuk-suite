import { readFileSync } from "node:fs";
import Database from "better-sqlite3";

/**
 * cwd-relativ, nicht relativ zu dieser Datei — Hausform: scripts/import/portal.test.ts:30
 * laedt "./src/app/m/portal/_db/migrations" genauso, und src/core/bootstrap.ts:18-19
 * begruendet es. Vitest laeuft aus dem Repo-Wurzelverzeichnis.
 */
const DDL_PFAD = "./scripts/import/fixtures/radio-quelle-ddl.sql";

/**
 * Eine LEERE Quell-Datenbank in der Form der Produktion von `radio-admin` (Freeze 265abd5).
 *
 * `foreign_keys = ON` steht hier, weil es in beiden echten Datenbanken scharf ist
 * (radio-admin/server/src/db/index.ts:28 und src/core/db/index.ts:19) und weil es eine
 * VERBINDUNGS-Eigenschaft ist, keine der Datei — dieselbe Begruendung wie in
 * src/app/m/lagerbuch/_db/migrations.test.ts:33-35. Ohne die Zeile liesse die Fixture ein
 * Waisen-Ereignis zu, und Aufgabe 8 haette keinen Fall, an dem sie den harten Abbruch zeigt.
 *
 * ⚠️ Der Aufrufer schliesst die Datenbank. `:memory:` haengt an der Verbindung: ein
 * vergessenes close() ist kein Datei-Leck, aber ein Speicher-Leck ueber die Testdatei hinweg.
 */
export function baueQuellDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(readFileSync(DDL_PFAD, "utf8"));
  return db;
}
