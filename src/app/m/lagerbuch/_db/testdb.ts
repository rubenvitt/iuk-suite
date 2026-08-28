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
 * VIER EIGENSCHAFTEN, DIE JEDE EINZELN WEGLASSBAR AUSSAEHEN UND ES NICHT SIND:
 *
 * 1. DATEI-DB, NICHT :memory:. Nur der Dateiweg belegt, dass `migrate()` auf einer
 *    frisch angelegten Datei durchlaeuft — und genau das tut der Boot.
 * 2. `foreign_keys = ON`. Das Pragma ist eine VERBINDUNGS-Eigenschaft und in SQLite
 *    standardmaessig AUS. Ohne diese Zeile waeren saemtliche FK-Zusagen dieses
 *    Moduls gruen, ohne zu gelten.
 * 3. `lb_falte`. Dieselbe Funktion, die `_db/client.ts` registriert. Ohne sie
 *    scheitert jede Journalsuche im Test mit `no such function: lb_falte` — und
 *    zwar auf genau dem Codepfad, den der Produktivbetrieb faehrt.
 * 4. `journal_mode = WAL` + `synchronous = NORMAL` — DIESELBEN ZWEI PRAGMAS, DIE
 *    `openModuleDatabase` (src/core/db/index.ts:18-21) im Betrieb setzt. Sie stehen
 *    hier NICHT aus Treue zum Betrieb da, sondern weil ihr Fehlen zwei CI-Faelle
 *    von PR #80 gerissen hat. Gemessen an dieser Verbindung, VOR dieser Zeile:
 *    `journal_mode = delete`, `synchronous = 2` (FULL) — also ein `fsync` UND ein
 *    Journaldatei-Umlauf (anlegen, schreiben, entfernen) je `.run()` ausserhalb
 *    einer Transaktion. Auf dem CI-Runner mit langsamer Platte kostet das Faktor
 *    30 bis 125; lokal auf APFS ist es billig und deshalb unsichtbar.
 *
 *    Kosten je Einzel-Commit, lokal gemessen (500 Inserts, Median aus 5 Laeufen):
 *      delete + FULL (vorher)  0,254 ms   ← Ausgangslage
 *      delete + OFF            0,154 ms   ← nur 1,6x; der Journalumlauf bleibt
 *      WAL + NORMAL            0,009 ms   ← Faktor 28
 *    `synchronous = OFF` allein ist also NICHT der Hebel — WAL ist es.
 *
 *    ⚠️ Der Wechsel kann still scheitern (SQLite antwortet dann mit dem alten
 *    Modus, ohne zu werfen). Deshalb die Pruefung darunter: lieber laut als eine
 *    Vorrichtung, die ihre eigene Zusage nicht haelt.
 *
 *    KEIN DAUERHAFTIGKEITS-VERLUST, DER JEMANDEN ANGINGE: diese Datenbank liegt
 *    unter `mkdtempSync` und wird von `schliessen()` geloescht. Kein Test dieses
 *    Repos sichert Dauerhaftigkeit ueber einen Prozessabbruch hinweg zu. Wer
 *    Pragma-Werte PRUEFT, prueft sie an `openModuleDatabase` (core/db/index.test.ts,
 *    lagerbuch/_db/client.test.ts, radio/_db/leihen.test.ts) — nicht hier.
 *
 * ABGESPIELT, NICHT GEPUSHT: die DB entsteht durch `migrate()` gegen das echte
 * Verzeichnis. Ein schema-gepushter Aufbau macht `append-only.test.ts` gruen und
 * INHALTSLEER — drizzle-kit erzeugt keine Trigger, ein Push traegt sie also nie.
 */
export function migrierteTestDb(praefix = "lagerbuch-"): TestDb {
  const ordner = mkdtempSync(join(tmpdir(), praefix));
  const sqlite = new Database(join(ordner, "lagerbuch.db"));
  const journalModus = sqlite.pragma("journal_mode = WAL", { simple: true });
  if (journalModus !== "wal") {
    throw new Error(
      `migrierteTestDb: journal_mode blieb "${String(journalModus)}" statt "wal" — ` +
        "der Wechsel wurde still abgelehnt (siehe Kopfkommentar, Punkt 4).",
    );
  }
  sqlite.pragma("synchronous = NORMAL");
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
