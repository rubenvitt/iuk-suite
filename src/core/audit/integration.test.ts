import { auditDelivery } from "./server";
import { queryAuditEvents } from "./storage";
import { requireModuleAdmin } from "@/core/auth/guards";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openModuleDatabase } from "@/core/db";
import { AsyncLocalStorage } from "node:async_hooks";
import type Database from "better-sqlite3";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn() }));
vi.mock("@/core/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/m/portal/_db/client", () => ({ getDb: mocks.db }));
import { setzeAnsprechpartnerAction } from "@/app/m/portal/actions";
let source: Database.Database;
let dir: string;
const request = new AsyncLocalStorage<string>();
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "audit-integration-"));
  vi.stubEnv("DATA_DIR", dir);
  source = openModuleDatabase(join(dir, "portal.db"));
  const db = drizzle(source);
  migrate(db, { migrationsFolder: "src/app/m/portal/_db/migrations" });
  const central = openModuleDatabase(join(dir, "audit.db"));
  migrate(drizzle(central), { migrationsFolder: "src/core/audit/_db/migrations" });
  central.close();
  mocks.db.mockReturnValue(db);
  mocks.auth.mockImplementation(async () => {
    await new Promise(resolve => setTimeout(resolve, request.getStore() === "alice" ? 10 : 1));
    return { user: { id: request.getStore(), name: "Confirmed name", groups: ["dashboard-admins"] } };
  });
});
afterEach(() => { source.close(); rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); });
async function act(id: string) {
  return request.run(id, async () => { const form = new FormData(); form.set("ansprechpartner", id); await setzeAnsprechpartnerAction(form); });
}
it("stores the confirmed actor of a real action in its transactional outbox", async () => {
  await act("alice");
  const row = source.prepare("SELECT actor FROM audit_outbox").get() as { actor: string };
  expect(JSON.parse(row.actor)).toEqual({ kind: "user", id: "alice", name: "Confirmed name" });
});
it("isolates two concurrent real actions", async () => {
  await Promise.all([act("alice"), act("bob")]);
  const rows = source.prepare("SELECT actor FROM audit_outbox").all() as { actor: string }[];
  expect(rows.map(r => JSON.parse(r.actor).id).sort()).toEqual(["alice", "bob"]);
});

it("keeps authorization denial and prepared delivery effective during audit write failure", async () => {
  const central = openModuleDatabase(join(dir, "audit.db"));
  central.exec("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT, 'secret failure detail'); END");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.auth.mockResolvedValue({ user: { id: "outsider", groups: [] } });
  await expect(requireModuleAdmin("portal")).rejects.toThrow("Forbidden");
  const prepared = new Response("download bytes");
  expect(await auditDelivery("files", "download", "file", { kind: "anonymous" }, () => prepared)).toBe(prepared);
  expect(log).toHaveBeenCalledTimes(2);
  expect(log.mock.calls.every(call => call.length === 1 && call[0] === "[audit] Ereignis konnte nicht gespeichert werden.")).toBe(true);
  log.mockRestore(); central.close();
});
it("distinguishes provided, denied and failed delivery without logging ordinary missing resources", async () => {
  for (const status of [200, 401, 403, 404, 500]) await auditDelivery("files", "download", "file", { kind: "anonymous" }, () => new Response(null, { status }));
  expect(queryAuditEvents().events.filter(e => e.action === "download").map(e => e.result).sort()).toEqual(["denied", "denied", "failure", "success"]);
});


it("distinguishes resolved delivery targets and hashes raw bearer IDs before persistence", async () => {
  for (const raw of ["bearer-secret-first", "bearer-secret-second"]) {
    await auditDelivery("files", "download", "share_archive", { kind: "anonymous" }, target => {
      target(raw);
      return new Response("bytes");
    });
  }
  const events = queryAuditEvents().events;
  expect(new Set(events.map(e => e.objectRef)).size).toBe(2);
  expect(events.every(e => e.objectType === "share_archive" && e.objectRef?.startsWith("sha256:"))).toBe(true);
  expect(JSON.stringify(events)).not.toContain("bearer-secret");
  expect(queryAuditEvents({ objectRef: "bearer-secret-first" }).events).toHaveLength(1);
});
