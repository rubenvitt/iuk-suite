import { it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { mkdirSync, rmSync } from "node:fs";
import * as schema from "@/app/m/portal/_db/schema";

const TEST_DATA_DIR = "./.data/portal-test";

// getDb() liest DATA_DIR; hier isolierte Datei setzen und Migrationen anwenden.
// Verzeichnis vor jedem Lauf frisch anlegen, damit der Test bei wiederholtem
// `pnpm test` idempotent bleibt (sonst UNIQUE-constraint auf slug beim 2. Lauf).
beforeEach(() => {
  rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  process.env.DATA_DIR = TEST_DATA_DIR;
});

it("create + list visible", async () => {
  // Migration einmalig anwenden (Task-11-Step-4 erzeugt ./src/app/m/portal/_db/migrations)
  // better-sqlite3 legt anders als openModuleDatabase() das Verzeichnis nicht selbst an.
  mkdirSync(TEST_DATA_DIR, { recursive: true });
  const db = drizzle(new Database(`${TEST_DATA_DIR}/portal.db`), { schema });
  migrate(db, { migrationsFolder: "./src/app/m/portal/_db/migrations" });
  const { createService, getVisibleServicesForUser } = await import("@/app/m/portal/_lib/services");
  await createService({ slug: "wiki", name: "Wiki", url: "https://wiki", isPublic: true });
  const visible = await getVisibleServicesForUser([]);
  expect(visible.map((s) => s.slug)).toContain("wiki");
});
