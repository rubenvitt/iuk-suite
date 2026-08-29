import { describe, it, expect, vi, beforeEach } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/uav-admin-tasks-test";
let gruppen: string[] | null = null;
vi.mock("@/core/auth", () => ({ auth: async () => (gruppen ? { user: { id: "sub-1", name: "Root", email: "r@x", groups: gruppen } } : null) }));

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR; process.env.SUITE_HOST_UAV = "uav-training.iuk-ue.de";
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  gruppen = null;
});

const get = (host = "uav-training.iuk-ue.de") => new Request("http://x/api/admin/tasks", { headers: { host } });
const post = (body: unknown, host = "uav-training.iuk-ue.de") =>
  new Request("http://x/api/admin/tasks", { method: "POST", headers: { host, "content-type": "application/json" }, body: JSON.stringify(body) });

describe("GET /api/admin/tasks", () => {
  it("anonym → 403", async () => {
    gruppen = null;
    const { GET } = await import("./route");
    expect((await GET(get())).status).toBe(403);
  });

  it("mit uav-training-admin → 200, inklusive inaktive", async () => {
    gruppen = ["uav-training-admin"];
    const { getDb } = await import("../../../_db/client");
    const { taskAnlegen } = await import("../../../_lib/queries");
    taskAnlegen(getDb(), {
      teil: 1, nummer: "1.1", titel: "Start", lernziel: "", schritte: [], durchfuehrungshinweise: [], sicherheitshinweise: [],
      zielanzahlDefault: 1, aktiv: false, bildUrl: null,
    });
    const { GET } = await import("./route");
    const res = await GET(get());
    expect(res.status).toBe(200);
    const liste = await res.json();
    expect(liste).toHaveLength(1);
    expect(liste[0].aktiv).toBe(false);
  });

  it("fremder Host → 404", async () => {
    gruppen = ["uav-training-admin"];
    const { GET } = await import("./route");
    expect((await GET(get("iuk-ue.de"))).status).toBe(404);
  });
});

describe("POST /api/admin/tasks", () => {
  it("anonym → 403", async () => {
    gruppen = null;
    const { POST } = await import("./route");
    expect((await POST(post({ teil: 1, nummer: "1.1", titel: "Start" }))).status).toBe(403);
  });

  it("legt Aufgabe mit Defaults an", async () => {
    gruppen = ["uav-training-admin"];
    const { POST } = await import("./route");
    const res = await POST(post({ teil: 1, nummer: "1.1", titel: "Start" }));
    expect(res.status).toBe(201);
    const task = await res.json();
    expect(task.titel).toBe("Start");
    expect(task.schritte).toEqual([]);
    expect(task.aktiv).toBe(true);
    expect(task.bildUrl).toBeNull();
  });

  it("ungültiger Body → 400", async () => {
    gruppen = ["uav-training-admin"];
    const { POST } = await import("./route");
    expect((await POST(post({ teil: 9, nummer: "1.1", titel: "Start" }))).status).toBe(400);
  });

  it("ungültiges JSON → 400 invalid_json (nicht validation_error)", async () => {
    gruppen = ["uav-training-admin"];
    const { POST } = await import("./route");
    const req = new Request("http://x/api/admin/tasks", {
      method: "POST",
      headers: { host: "uav-training.iuk-ue.de", "content-type": "application/json" },
      body: "{nicht json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_json");
  });
});
