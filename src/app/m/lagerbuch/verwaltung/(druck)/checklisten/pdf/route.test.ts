import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openModuleDatabase } from "@/core/db";
import { queryAuditEvents } from "@/core/audit/storage";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), headers: vi.fn(), data: vi.fn() }));
vi.mock("@/core/auth", () => ({ auth: mocks.auth }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("../../../../_db/client", () => ({ getDb: () => ({}) }));
vi.mock("../../../../_lib/lesepfade/checkliste", async importOriginal => ({
  ...await importOriginal<typeof import("../../../../_lib/lesepfade/checkliste")>(),
  checklistenDaten: mocks.data,
}));
import { GET } from "./route";
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "audit-checklist-pdf-"));
  vi.stubEnv("DATA_DIR", dir);
  vi.stubEnv("SUITE_HOST_LAGERBUCH", "lagerbuch.localtest.me");
  vi.stubEnv("SUITE_ADMIN_GROUP_LAGERBUCH", "checklist-admin");
  const central = openModuleDatabase(join(dir, "audit.db"));
  migrate(drizzle(central), { migrationsFolder: "src/core/audit/_db/migrations" });
  central.close();
  mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-host": "lagerbuch.localtest.me" }));
  mocks.auth.mockResolvedValue({ user: { id: "confirmed-admin", groups: ["checklist-admin"] } });
  mocks.data.mockReturnValue([{ id: "fz-b", name: "NEF 1", kennung: null, vorlage: null, positionen: 0, faecher: [], geraete: [], flaschen: [] }]);
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
const request = () => new Request("http://lagerbuch.localtest.me/verwaltung/checklisten/pdf");

it("delivers a real PDF and persists its fixed collection target and confirmed actor", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/pdf");
  expect(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
  const events = queryAuditEvents({ objectRef: "vehicle_checklists" }).events;
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ module: "lagerbuch", action: "export", objectType: "checklist_collection", result: "success", actor: { kind: "user", id: "confirmed-admin" } });
});
it("keeps an empty authorized collection silent", async () => {
  mocks.data.mockReturnValue([]);
  expect((await GET(request())).status).toBe(404);
  expect(queryAuditEvents().events).toHaveLength(0);
});
it("records a masked role denial while keeping host rejection silent", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "other", groups: [] } });
  mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-host": "radio.localtest.me" }));
  expect((await GET(request())).status).toBe(404);
  expect(queryAuditEvents().events).toHaveLength(0);
  mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-host": "lagerbuch.localtest.me" }));
  expect((await GET(request())).status).toBe(404);
  expect(queryAuditEvents().events).toHaveLength(1);
  expect(queryAuditEvents().events[0].action).toBe("access_denied");
});
