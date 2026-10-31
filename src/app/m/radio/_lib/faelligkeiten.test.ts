import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerAuditFunctions } from "@/core/audit/context";
import * as schema from "../_db/schema";
import { loans } from "../_db/schema";
import { darfRadioFaelligkeitenSehen, radioFaelligkeiten } from "./faelligkeiten";

const JETZT = new Date("2026-07-10T08:00:00Z");
const vorStunden = (h: number) => new Date(JETZT.getTime() - h * 3_600_000);

let tmp: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "radio-faellig-"));
  sqlite = new Database(join(tmp, "radio.db"));
  registerAuditFunctions(sqlite);
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/radio/_db/migrations" });
  db = drizzle(sqlite, { schema });
});
afterEach(() => {
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
});

function leihe(id: string, seit: Date, zurueck: Date | null = null) {
  return {
    id, deviceId: `g-${id}`, snapshotCallSign: `Rotkreuz ${id}`, borrowerName: "Anna Beispiel",
    borrowedAt: seit, returnedAt: zurueck, createdAt: seit, updatedAt: seit,
  };
}

describe("radioFaelligkeiten — offene Ausleihen als Fälligkeit", () => {
  it("ab 24 Stunden bald, ab 7 Tagen überfällig; zurückgegebene und frische fehlen", () => {
    db.insert(loans).values([
      leihe("frisch", vorStunden(3)),
      leihe("nacht", vorStunden(30)),
      leihe("woche", vorStunden(24 * 9)),
      leihe("zurueck", vorStunden(24 * 20), vorStunden(24 * 19)),
    ]).run();
    expect(radioFaelligkeiten(JETZT, db)).toEqual([
      {
        id: "leihe:woche", art: "Ausleihe", titel: "Funkgerät Rotkreuz woche", wo: null,
        zustand: "seit 9 Tagen ausgeliehen", dringlichkeit: "ueberfaellig",
        sortierung: vorStunden(24 * 9).toISOString(), pfad: "/admin/ausleihen", person: "Anna Beispiel",
      },
      {
        id: "leihe:nacht", art: "Ausleihe", titel: "Funkgerät Rotkreuz nacht", wo: null,
        zustand: "seit 1 Tag ausgeliehen", dringlichkeit: "bald",
        sortierung: vorStunden(30).toISOString(), pfad: "/admin/ausleihen", person: "Anna Beispiel",
      },
    ]);
  });
});

describe("darfRadioFaelligkeitenSehen — dasselbe Prädikat wie istRadioAdmin", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("Modul-Admin ja, Suite-Admin allein nein — dort stehen Klarnamen", () => {
    vi.stubEnv("ADMIN_GROUP", "betrieb");
    vi.stubEnv("SUITE_ADMIN_GROUP_RADIO", "funk-admin");
    expect(darfRadioFaelligkeitenSehen(["funk-admin"])).toBe(true);
    expect(darfRadioFaelligkeitenSehen(["betrieb"])).toBe(false);
    expect(darfRadioFaelligkeitenSehen(undefined)).toBe(false);
  });
});
