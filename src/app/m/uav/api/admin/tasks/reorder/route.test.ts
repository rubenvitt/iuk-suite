import { describe, it, expect, vi, beforeEach } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/uav-admin-tasks-reorder-test";
let gruppen: string[] | null = null;
vi.mock("@/core/auth", () => ({ auth: async () => (gruppen ? { user: { id: "sub-1", name: "Root", email: "r@x", groups: gruppen } } : null) }));

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR; process.env.SUITE_HOST_UAV = "uav-training.iuk-ue.de";
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  gruppen = ["uav-training-admin"];
});

const post = (ids: string[], host = "uav-training.iuk-ue.de") =>
  new Request("http://x/api/admin/tasks/reorder", { method: "POST", headers: { host, "content-type": "application/json" }, body: JSON.stringify({ ids }) });

describe("POST /api/admin/tasks/reorder", () => {
  it("anonym → 403", async () => {
    gruppen = null;
    const { POST } = await import("./route");
    expect((await POST(post([]))).status).toBe(403);
  });

  it("sortiert Aufgaben in der übergebenen Reihenfolge neu", async () => {
    const { getDb } = await import("../../../../_db/client");
    const { taskAnlegen, alleTasks } = await import("../../../../_lib/queries");
    const db = getDb();
    const a = taskAnlegen(db, { teil: 1, nummer: "1.1", titel: "A", lernziel: "", schritte: [], durchfuehrungshinweise: [], sicherheitshinweise: [], zielanzahlDefault: 1, aktiv: true, bildUrl: null });
    const b = taskAnlegen(db, { teil: 1, nummer: "1.2", titel: "B", lernziel: "", schritte: [], durchfuehrungshinweise: [], sicherheitshinweise: [], zielanzahlDefault: 1, aktiv: true, bildUrl: null });
    const { POST } = await import("./route");
    const res = await POST(post([b.id, a.id]));
    expect(res.status).toBe(200);
    const liste = alleTasks(db, true);
    expect(liste.map((t) => t.id)).toEqual([b.id, a.id]);
  });

  it("ungültiger Body → 400", async () => {
    const bad = new Request("http://x/api/admin/tasks/reorder", {
      method: "POST",
      headers: { host: "uav-training.iuk-ue.de", "content-type": "application/json" },
      body: JSON.stringify({ ids: [""] }),
    });
    const { POST } = await import("./route");
    expect((await POST(bad)).status).toBe(400);
  });

  it("ungültiges JSON → 400 invalid_json (nicht validation_error)", async () => {
    const bad = new Request("http://x/api/admin/tasks/reorder", {
      method: "POST",
      headers: { host: "uav-training.iuk-ue.de", "content-type": "application/json" },
      body: "{nicht json",
    });
    const { POST } = await import("./route");
    const res = await POST(bad);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_json");
  });
});
