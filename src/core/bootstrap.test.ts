import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync, readFileSync, readdirSync } from "node:fs";
import Database from "better-sqlite3";
import { migrateAllModules, shouldSeed, MODULE_MIGRATIONS } from "@/core/bootstrap";

const DIR = "./.data/bootstrap-test";

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
});
afterEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("migrateAllModules", () => {
  it("creates portal.db with the services table", () => {
    migrateAllModules();
    expect(existsSync(`${DIR}/portal.db`)).toBe(true);
    const db = new Database(`${DIR}/portal.db`);
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='services'")
      .get() as { name?: string } | undefined;
    db.close();
    expect(row?.name).toBe("services");
  });
});

/**
 * Ein neues Modul muss an drei entkoppelten Stellen eingetragen werden:
 * `_db/`-Ordner, MODULE_MIGRATIONS hier, COPY-Zeile im Dockerfile. Vergisst man
 * eine davon, merkt man es nicht beim Bauen und nicht in den Tests, sondern
 * erst beim Boot des Prod-Images — also genau dort, wo es am teuersten ist.
 * Diese Tests koppeln die drei Stellen aneinander.
 */
describe("Modul-Registrierung ist vollständig", () => {
  const MODULE_DIR = "src/app/m";

  it("jedes Modul mit _db/ steht in MODULE_MIGRATIONS", () => {
    const withDb = readdirSync(MODULE_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(`${MODULE_DIR}/${e.name}/_db`))
      .map((e) => e.name);
    const registered = MODULE_MIGRATIONS.map((m) => m.key);
    expect(withDb.filter((k) => !registered.includes(k))).toEqual([]);
  });

  it("jeder Migrations-Ordner existiert und hat ein Journal", () => {
    for (const m of MODULE_MIGRATIONS) {
      expect(existsSync(m.migrationsFolder), `${m.key}: ${m.migrationsFolder}`).toBe(true);
      expect(existsSync(`${m.migrationsFolder}/meta/_journal.json`), m.key).toBe(true);
    }
  });

  it("jeder Migrations-Ordner wird ins Prod-Image kopiert", () => {
    // Ohne COPY fehlen die Migrationen im standalone-Image und der Boot
    // scheitert erst im Container, nicht im Build.
    const dockerfile = readFileSync("Dockerfile", "utf8");
    for (const m of MODULE_MIGRATIONS) {
      expect(dockerfile, `Dockerfile: COPY für ${m.key} fehlt`).toContain(m.migrationsFolder);
    }
  });
});

// Next's next-env.d.ts augments NodeJS.ProcessEnv with `readonly NODE_ENV`,
// so direct `process.env.NODE_ENV = ...` assignment (as in the task brief)
// fails `tsc --noEmit`. Use vi.stubEnv/unstubAllEnvs instead — the repo's own
// established pattern for this exact constraint (see devLogin.test.ts).
// Assertions and behavior are unchanged from the brief.
describe("shouldSeed", () => {
  it("is true when SUITE_SEED=1", () => {
    vi.stubEnv("SUITE_SEED", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(shouldSeed()).toBe(true);
  });
  it("is false in production without SUITE_SEED", () => {
    vi.stubEnv("SUITE_SEED", undefined);
    vi.stubEnv("NODE_ENV", "production");
    expect(shouldSeed()).toBe(false);
  });
});
