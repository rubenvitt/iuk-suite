// src/app/m/radio/_lib/boot.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "../_db/schema";
import { loans } from "../_db/schema";
import { retentionGrenze, raeumeLeihhistorie } from "./boot";

/**
 * EINE DATEI, DREI BESCHREIBENDE ORTE, KEINE ZEILE DOPPELT (Spec 1 B5): hier stehen die
 * REINEN Faelle ueber `retentionGrenze` und die DB-Faelle ueber `raeumeLeihhistorie`
 * (§8.2.5 / §2.7.3). Die fuenf TAKT-Faelle mit `vi.useFakeTimers()` (§2.7.2) und die
 * Boot-Pruefungen (§7.3.7) kommen mit Planteil 5 in DIESE Datei — nicht in eine zweite.
 * Es gibt KEIN `_lib/retention.test.ts`.
 */
let tmp: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

const JETZT = new Date("2026-08-17T12:00:00Z");

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "radio-boot-"));
  sqlite = new Database(join(tmp, "radio.db"));
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/radio/_db/migrations" });
  db = drizzle(sqlite, { schema });
});

afterAll(() => {
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  sqlite.prepare("delete from loans").run();
});

/** Eine Leihe, die nur in den Feldern abweicht, die der Fall braucht. Sekundengenaue
 *  Zeiten: `mode: "timestamp"` speichert Sekunden, Millisekunden gingen verloren. */
function leihe(werte: Partial<typeof loans.$inferInsert>): typeof loans.$inferInsert {
  return {
    id: `l-${Object.values(werte).join("-")}`,
    deviceId: "g-1",
    snapshotCallSign: "Muehlheim 1/83",
    borrowerName: "Seed Person",
    borrowedAt: new Date("2026-01-01T10:00:00Z"),
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
    ...werte,
  };
}

const tag = (d: Date) => d.toISOString().slice(0, 10);

describe("retentionGrenze — rein", () => {
  it("retentionGrenze auf 2026-08-17 ergibt 2026-06-17", () => {
    expect(tag(retentionGrenze(JETZT))).toBe("2026-06-17");
  });

  it("retentionGrenze auf 2026-04-30 ergibt 2026-03-02 — die Monatsende-Verschiebung der Quelle wird uebernommen", () => {
    /*
     * UEBERNOMMENES VERHALTEN, KEIN FEHLER. `setUTCMonth(getUTCMonth() - 2)` auf dem
     * 30. April ergibt "30. Februar" und normalisiert auf den 2. Maerz — der Cutoff wandert
     * an solchen Tagen bis zu zwei Tage NACH VORN und loescht ein wenig mehr, als die
     * Richtlinie woertlich sagt. Die Quelle rechnet zeichengleich so
     * (radio-admin/server/src/services/retentionService.ts:17-21), und Paritaet ist hier
     * das staerkere Argument als arithmetische Eleganz: eine korrigierte Monatsarithmetik
     * liesse im Ziel Zeilen stehen, die die Alt-App geloescht haette, und die Abweichung
     * fiele niemandem auf. Dieser Fall haelt die Entscheidung fest, damit sie nicht als
     * Fehler "repariert" wird.
     */
    expect(tag(retentionGrenze(new Date("2026-04-30T00:00:00Z")))).toBe("2026-03-02");
  });
});

describe("raeumeLeihhistorie — gegen die migrierte Datenbank", () => {
  it("eine am Cutoff-Tag zurueckgegebene Leihe bleibt", () => {
    // Die Grenze selbst ist AUSGESCHLOSSEN: `lt(returnedAt, grenze)`.
    db.insert(loans).values(leihe({ deviceId: "g-grenze", returnedAt: retentionGrenze(JETZT) })).run();
    expect(raeumeLeihhistorie(db, JETZT)).toBe(0);
    expect(db.select().from(loans).all()).toHaveLength(1);
  });

  it("eine einen Tag vor dem Cutoff zurueckgegebene Leihe geht", () => {
    const einenTagFrueher = new Date(retentionGrenze(JETZT).getTime() - 24 * 60 * 60 * 1000);
    db.insert(loans).values(leihe({ deviceId: "g-alt", returnedAt: einenTagFrueher })).run();
    expect(raeumeLeihhistorie(db, JETZT)).toBe(1);
    expect(db.select().from(loans).all()).toHaveLength(0);
  });

  it("eine AKTIVE Leihe bleibt, egal wie alt ihr borrowed_at ist", () => {
    /*
     * `returned_at IS NULL` ist keine Zeit und faellt nie unter einen Cutoff — auch nicht
     * bei einer jahrealten aktiven Leihe. Verhalten der Quelle
     * (radio-admin/server/src/repos/loanRepo.ts:191-196). Ein "aufraeumen, was zu lange
     * draussen ist" gibt es nicht und darf hier nicht entstehen: eine verschwundene aktive
     * Leihe ist der Verlust der Information, WER ein Geraet hat.
     */
    db.insert(loans)
      .values(
        leihe({
          deviceId: "g-uralt",
          borrowedAt: new Date("2019-01-01T10:00:00Z"),
          returnedAt: null,
        }),
      )
      .run();
    expect(raeumeLeihhistorie(db, JETZT)).toBe(0);
    expect(db.select().from(loans).all()).toHaveLength(1);
  });
});
