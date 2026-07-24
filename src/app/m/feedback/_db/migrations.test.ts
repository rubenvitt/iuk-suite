import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("feedback migrations", () => {
  let sqlite: Database.Database;

  beforeAll(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    migrate(drizzle(sqlite), {
      migrationsFolder: "src/app/m/feedback/_db/migrations",
    });
  });
  afterAll(() => sqlite.close());

  it("legt alle sechs Tabellen an", () => {
    const names = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => (r as { name: string }).name);
    for (const t of [
      "groups",
      "evenings",
      "surveys",
      "responses",
      "user_groups",
      "known_users",
    ]) {
      expect(names).toContain(t);
    }
  });

  it("erzwingt den PK auf known_users.user_id", () => {
    sqlite.exec("INSERT INTO known_users (user_id, seen_at) VALUES ('u1',0)");
    expect(() =>
      sqlite.exec("INSERT INTO known_users (user_id, seen_at) VALUES ('u1',0)"),
    ).toThrow();
  });

  it("erzwingt den status-CHECK auf surveys", () => {
    sqlite.exec(
      "INSERT INTO groups (name, slug, secret, created_at) VALUES ('G','g','abc12',0)",
    );
    sqlite.exec("INSERT INTO evenings (group_id, date, created_at) VALUES (1,0,0)");
    expect(() =>
      sqlite.exec(
        "INSERT INTO surveys (evening_id, status, created_at) VALUES (1,'bogus',0)",
      ),
    ).toThrow();
  });

  it("erzwingt UNIQUE auf surveys.evening_id (1:1)", () => {
    sqlite.exec(
      "INSERT INTO surveys (evening_id, status, created_at) VALUES (1,'draft',0)",
    );
    expect(() =>
      sqlite.exec(
        "INSERT INTO surveys (evening_id, status, created_at) VALUES (1,'draft',0)",
      ),
    ).toThrow();
  });

  it("erzwingt Composite-PK auf user_groups", () => {
    sqlite.exec("INSERT INTO user_groups (user_id, group_id) VALUES ('u1',1)");
    expect(() =>
      sqlite.exec("INSERT INTO user_groups (user_id, group_id) VALUES ('u1',1)"),
    ).toThrow();
  });
});

// Die frische DB oben deckt den Neuaufbau ab. Produktion hat aber eine BESTEHENDE
// DB auf dem Stand 0000: hier wird genau dieser Zustand nachgebaut (Journal nur mit
// 0000) und dann die echte Migrationsfolge darauf angewandt.
describe("feedback migrations — bestehende DB (Stand 0000)", () => {
  const folder = "src/app/m/feedback/_db/migrations";
  let sqlite: Database.Database;
  let tmp: string;

  beforeAll(() => {
    const journal = JSON.parse(readFileSync(join(folder, "meta/_journal.json"), "utf8")) as {
      entries: Array<{ tag: string }>;
    };
    const first = journal.entries[0];
    tmp = mkdtempSync(join(tmpdir(), "feedback-migrations-"));
    mkdirSync(join(tmp, "meta"));
    copyFileSync(join(folder, `${first.tag}.sql`), join(tmp, `${first.tag}.sql`));
    writeFileSync(
      join(tmp, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries: [first] }),
    );

    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    // 1. Alt-Stand herstellen …
    migrate(drizzle(sqlite), { migrationsFolder: tmp });
    sqlite.exec("INSERT INTO groups (name, slug, secret, created_at) VALUES ('G','g','abc12',0)");
    // 2. … und darauf die vollständige Folge fahren.
    migrate(drizzle(sqlite), { migrationsFolder: folder });
  });
  afterAll(() => {
    sqlite.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("ergänzt known_users ohne Datenverlust", () => {
    const names = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(names).toContain("known_users");
    expect(
      (sqlite.prepare("SELECT COUNT(*) AS c FROM groups").get() as { c: number }).c,
    ).toBe(1);
  });

  it("lässt den status-CHECK auf surveys unverändert bestehen", () => {
    sqlite.exec("INSERT INTO evenings (group_id, date, created_at) VALUES (1,0,0)");
    expect(() =>
      sqlite.exec("INSERT INTO surveys (evening_id, status, created_at) VALUES (1,'bogus',0)"),
    ).toThrow();
  });
});
