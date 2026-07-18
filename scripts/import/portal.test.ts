import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "@/app/m/portal/_db/schema";
import { parseNdjson, toNewService, importPortalServices } from "./portal";
import { checkParity } from "./parity";

const DIR = "./.data/portal-import-test";

function pgRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    slug: "wiki", name: "Wiki", description: "Doku", url: "https://wiki.iuk-ue.de",
    icon_url: null, category: "Doku", tags: ["a", "b"], required_groups: ["dashboard-admins"],
    is_public: true, is_active: true, sort_order: 3, open_in_new_tab: true,
    created_at: "2026-01-02T03:04:05.000Z", updated_at: "2026-01-02T03:04:05.000Z",
    ...over,
  };
}

// Direkt gebaute, migrierte DB — NICHT getModuleDb(): dessen globaler Cache ist
// per Modulschlüssel gekeyt (nicht per DATA_DIR) und würde zwischen Tests ein
// stale Handle auf die alte Datei zurückgeben. Spiegelt services.test.ts.
function freshDb(): BetterSQLite3Database<typeof schema> {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  const db = drizzle(new Database(`${DIR}/portal.db`), { schema });
  migrate(db, { migrationsFolder: "./src/app/m/portal/_db/migrations" });
  return db;
}
afterEach(() => rmSync(DIR, { recursive: true, force: true }));

describe("parseNdjson", () => {
  it("parses one row per non-empty line", () => {
    const rows = parseNdjson(`${JSON.stringify(pgRow())}\n\n${JSON.stringify(pgRow({ slug: "vault" }))}\n`);
    expect(rows.map((r) => r.slug)).toEqual(["wiki", "vault"]);
  });
});

describe("toNewService", () => {
  it("preserves id and maps pg types to sqlite types", () => {
    const n = toNewService(pgRow() as never);
    expect(n.id).toBe("11111111-1111-1111-1111-111111111111");
    expect(n.tags).toEqual(["a", "b"]);
    expect(n.requiredGroups).toEqual(["dashboard-admins"]);
    expect(n.isPublic).toBe(true);
    expect(n.sortOrder).toBe(3);
    expect(n.createdAt).toBeInstanceOf(Date);
    expect(n.iconUrl).toBeNull();
  });
});

describe("importPortalServices", () => {
  it("imports rows and the target matches the source (parity)", () => {
    const rows = [pgRow(), pgRow({ id: "22222222-2222-2222-2222-222222222222", slug: "vault" })];
    const db = freshDb();
    const res = importPortalServices(rows as never, db);
    expect(res.imported).toBe(2);
    const stored = db.select().from(schema.services).all();
    const source = rows.map((r) => ({ id: r.id, slug: r.slug, url: r.url }));
    const target = stored.map((s) => ({ id: s.id, slug: s.slug, url: s.url }));
    expect(checkParity(source, target).ok).toBe(true);
  });

  it("is idempotent (re-run keeps the same rows)", () => {
    const rows = [pgRow()];
    const db = freshDb();
    importPortalServices(rows as never, db);
    importPortalServices(rows as never, db);
    expect(db.select().from(schema.services).all()).toHaveLength(1);
  });
});
