import { registerAuditFunctions } from "@/core/audit/context";
import type { Session } from "next-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "../_db/schema";
import { devices } from "../_db/schema";
import { suiteSuche } from "./suiteSuche";

// Eine eigene Datei je Fall, wie `lesepfade/geraete.test.ts`: `getModuleDb` ist nach Modul gekeyt.
let tmp: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;
const ZEIT = new Date("2026-06-14T07:12:00Z");

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "radio-suche-"));
  sqlite = new Database(join(tmp, "radio.db"));
  registerAuditFunctions(sqlite);
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/radio/_db/migrations" });
  db = drizzle(sqlite, { schema });
  db.insert(devices).values([
    { id: "a", issi: "6250001", rufname: "Rotkreuz Uelzen 11-83-1", serialNumber: "1PN012345", opta: "BY RK UE 11831", location: "Funkraum", createdAt: ZEIT, updatedAt: ZEIT },
    { id: "b", issi: "6250002", rufname: "Rotkreuz Uelzen 11-85-1", serialNumber: "1PN067890", location: "KTW 1", createdAt: ZEIT, updatedAt: ZEIT },
  ]).run();
});

afterEach(() => {
  vi.unstubAllEnvs();
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
});

const sitzung = (groups: string[]): Session => ({ user: { id: "u1", name: "Test", groups }, expires: "2099-01-01" } as Session);

describe("suiteSuche (radio) — Rechte", () => {
  it("anonym, ohne Gruppe und als Suite-Admin ohne Funkgruppe: null", () => {
    expect(suiteSuche("1PN", null, db)).toBeNull();
    expect(suiteSuche("1PN", sitzung([]), db)).toBeNull();
    // Der Suite-Admin zählt in `radio` bewusst nicht mit (`istRadioAdmin`).
    expect(suiteSuche("1PN", sitzung([process.env.ADMIN_GROUP ?? "admin"]), db)).toBeNull();
  });

  it("die Admin-Gruppe des Moduls sucht mit", () => {
    expect(suiteSuche("1PN", sitzung(["radio-admin"]), db)?.treffer).toHaveLength(2);
  });

  it("die Updater-Gruppe auch — sie öffnet dieselbe Geräteakte", () => {
    vi.stubEnv("SUITE_UPDATER_GROUP_RADIO", "radio-updater");
    expect(suiteSuche("1PN", sitzung(["radio-updater"]), db)?.treffer).toHaveLength(2);
  });
});

describe("suiteSuche (radio) — Felder", () => {
  const darf = sitzung(["radio-admin"]);

  it("findet Seriennummer, ISSI und OPTA und führt in die Geräteakte", () => {
    const [t] = suiteSuche("1PN067890", darf, db)!.treffer;
    expect(t).toMatchObject({ id: "b", titel: "Rotkreuz Uelzen 11-85-1", pfad: "/admin/geraete/b", art: "Funkgerät" });
    expect(t.merkmale).toContainEqual({ etikett: "Seriennummer", wert: "1PN067890" });
    expect(suiteSuche("6250001", darf, db)?.treffer.map((x) => x.id)).toEqual(["a"]);
    expect(suiteSuche("RK UE 11831", darf, db)?.treffer.map((x) => x.id)).toEqual(["a"]);
  });

  it("findet den Funkrufnamen, auch klein geschrieben", () => {
    expect(suiteSuche("uelzen 11-8", darf, db)?.treffer.map((x) => x.id)).toEqual(["a", "b"]);
  });
});
