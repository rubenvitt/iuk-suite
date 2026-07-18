import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { migrateAllModules, shouldSeed } from "@/core/bootstrap";

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
