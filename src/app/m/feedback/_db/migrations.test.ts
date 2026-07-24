import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";

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

  it("legt alle fünf Tabellen an", () => {
    const names = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => (r as { name: string }).name);
    for (const t of ["groups", "evenings", "surveys", "responses", "user_groups"]) {
      expect(names).toContain(t);
    }
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
