import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "./schema";
import { loans } from "./schema";

const ORDNER = "src/app/m/radio/_db/migrations";

/**
 * DER PARTIELLE UNIQUE-INDEX IST DER EINZIGE RIEGEL DER INVARIANTE "hoechstens EINE
 * aktive Ausleihe je Geraet", und sein Fehlen ist GRUEN: die Altdaten erfuellen die
 * Invariante, der Import faellt nicht auf, und sichtbar wird es erst beim zweiten
 * Ausleihen desselben Geraets. `pnpm typecheck` und `pnpm build` fassen Migrationen nicht
 * an (§2.6, Folge (a)).
 *
 * GEGEN EINE TEMPORAERE DATEI-DB, NICHT :memory: — nur der Dateiweg belegt, dass
 * `migrate()` auf einer frisch angelegten Datei durchlaeuft, und genau das tut der Boot
 * (Hausform: src/app/m/lagerbuch/_db/testdb.ts:19-24).
 *
 * `foreign_keys = ON` ist eine VERBINDUNGS-Eigenschaft und in SQLite standardmaessig AUS.
 * Ohne diese Zeile waeren die FK-Zusagen dieses Schemas gruen, ohne zu gelten
 * (src/app/m/lagerbuch/_db/migrations.test.ts:32-34).
 */
let tmp: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "radio-migrations-"));
  sqlite = new Database(join(tmp, "radio.db"));
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: ORDNER });
  db = drizzle(sqlite, { schema });
});

afterAll(() => {
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
});

/** Eine Leihe, die nur in den Feldern abweicht, die der Test braucht. */
function leihe(werte: Partial<typeof loans.$inferInsert>): typeof loans.$inferInsert {
  return {
    id: `l-${Math.random().toString(36).slice(2, 10)}`,
    deviceId: "g-1",
    snapshotCallSign: "Muehlheim 1/83",
    borrowerName: "Seed Person",
    borrowedAt: new Date("2026-01-01T10:00:00Z"),
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
    ...werte,
  };
}

describe("radio-Migrationen: der partielle Unique-Index auf loans", () => {
  it("zwei aktive Leihen auf dasselbe Geraet werden abgewiesen", () => {
    db.insert(loans).values(leihe({ deviceId: "g-abweisung", returnedAt: null })).run();
    expect(() =>
      db.insert(loans).values(leihe({ deviceId: "g-abweisung", returnedAt: null })).run(),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it("eine zurueckgegebene und eine aktive Leihe auf dasselbe Geraet sind erlaubt", () => {
    // DIE PARTIALITAET SELBST. Ohne diesen Fall waere ein GEWOEHNLICHER Unique-Index
    // ebenfalls "gruen" — und der sperrte die Historie.
    db.insert(loans)
      .values(leihe({ deviceId: "g-gemischt", returnedAt: new Date("2026-02-01T10:00:00Z") }))
      .run();
    expect(() =>
      db.insert(loans).values(leihe({ deviceId: "g-gemischt", returnedAt: null })).run(),
    ).not.toThrow();
  });

  it("zwei zurueckgegebene Leihen auf dasselbe Geraet sind erlaubt", () => {
    // Der Index sperrt die Historie nicht — das ist die Voraussetzung dafuer, dass der
    // Importer die abgeschlossene Leihhistorie im Bulk schreiben kann (§2.6, Folge (b)).
    db.insert(loans)
      .values(leihe({ deviceId: "g-historie", returnedAt: new Date("2026-02-01T10:00:00Z") }))
      .run();
    expect(() =>
      db
        .insert(loans)
        .values(leihe({ deviceId: "g-historie", returnedAt: new Date("2026-03-01T10:00:00Z") }))
        .run(),
    ).not.toThrow();
  });

  it("loans_device_active_uidx existiert als partieller Unique-Index", () => {
    /*
     * STRUKTURPROBE, KEINE TEXTSUCHE — und der Unterschied ist gemessen (B1-B4,
     * docs/superpowers/plans/2026-08-18-plan1-radio-import.md, Abschnitt "Was dieser Plan
     * GEMESSEN hat"): die DDL schreibt den Index mit Backticks, und
     * `instr(sql,'WHERE returned_at IS NULL')` auf sqlite_master.sql ergibt 0. Ein Test,
     * der den Indextext greppt, ist deshalb rot gegen eine KORREKTE Migration.
     *
     * Dieser Fall prueft die Zeile direkt, damit ein kuenftiges `drizzle-kit generate` sie
     * nicht still verlieren kann — es sieht partielle Indizes nicht und emittiert sie nicht.
     */
    const zeilen = sqlite
      .prepare(`select name, "unique", partial from pragma_index_list('loans')`)
      .all() as { name: string; unique: number; partial: number }[];
    const treffer = zeilen.find((z) => z.name === "loans_device_active_uidx");
    expect(treffer, "loans_device_active_uidx fehlt in pragma_index_list('loans')").toBeDefined();
    expect(treffer).toEqual({ name: "loans_device_active_uidx", unique: 1, partial: 1 });
  });
});

describe("radio-Migrationen: das Journal, nicht die Migrationsprobe", () => {
  it("die when-Werte im Journal steigen streng und liegen nicht in der Zukunft", () => {
    /*
     * DAS TOR DES MIGRATORS IST ALLEIN `when` — kein Hashvergleich: das Gate steht in
     * node_modules/drizzle-orm/sqlite-core/dialect.js:660 als
     * `Number(lastDbMigration[2]) < migration.folderMillis`, der Hash wird bei :667 nur
     * GESCHRIEBEN, nie gelesen. Ein `when` in der Zukunft laesst jede kuenftige, VOR diesem
     * Zeitpunkt generierte Migration (die `when: Date.now()` setzt) auf einer bereits
     * migrierten Datenbank STILL ausfallen — kein Wurf, keine Fehlermeldung. Eine frische
     * Test-Datenbank kann das nie zeigen: `lastDbMigration` ist dort `undefined`
     * (src/app/m/radio/_lib/boot.test.ts:27-28 legt ebenfalls eine frische Datei an), also ist
     * dies eine Journal-Pruefung und keine Migrationsprobe. Hausform (+1000 ms je Folgeeintrag):
     * src/app/m/lagerbuch/_db/migrations/meta/_journal.json.
     */
    const journal = JSON.parse(
      readFileSync(join(ORDNER, "meta", "_journal.json"), "utf8"),
    ) as { entries: { when: number; tag: string }[] };
    const werte = journal.entries.map((e) => e.when);
    for (let i = 1; i < werte.length; i++) {
      expect(werte[i], `when von Eintrag ${i} muss > Eintrag ${i - 1} sein`).toBeGreaterThan(
        werte[i - 1],
      );
    }
    expect(werte.at(-1), "letztes when liegt in der Zukunft").toBeLessThanOrEqual(Date.now());
  });
});
