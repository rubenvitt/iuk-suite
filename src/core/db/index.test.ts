import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { rmSync } from "node:fs";
import { moduleDbPath, openModuleDatabase } from "@/core/db";

describe("core/db", () => {
  it("moduleDbPath honours DATA_DIR", () => {
    const prev = process.env.DATA_DIR;
    process.env.DATA_DIR = "./.data/testdir";
    expect(moduleDbPath("portal")).toBe("./.data/testdir/portal.db");
    process.env.DATA_DIR = prev;
  });
  it("openModuleDatabase creates file + sets WAL", () => {
    const p = "./.data/test/unit.db";
    rmSync("./.data/test", { recursive: true, force: true });
    const db = openModuleDatabase(p);
    expect(existsSync(p)).toBe(true);
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    db.close();
    rmSync("./.data/test", { recursive: true, force: true });
  });
});
