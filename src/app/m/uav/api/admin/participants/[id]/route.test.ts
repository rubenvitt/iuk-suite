import { describe, it, expect, vi, beforeEach } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/uav-admin-participant-detail-test";
let gruppen: string[] | null = null;
vi.mock("@/core/auth", () => ({ auth: async () => (gruppen ? { user: { id: "sub-1", name: "Root", email: "r@x", groups: gruppen } } : null) }));

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR; process.env.SUITE_HOST_UAV = "uav-training.iuk-ue.de";
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  gruppen = ["uav-training-admin"];
});

const req = (path: string, init: RequestInit = {}, host = "uav-training.iuk-ue.de") =>
  new Request(`http://x${path}`, { ...init, headers: { ...init.headers, host, "content-type": "application/json" } });

describe("GET /api/admin/participants/[id]", () => {
  it("anonym → 403", async () => {
    gruppen = null;
    const { GET } = await import("./route");
    expect((await GET(req("/api/admin/participants/xyz"), { params: Promise.resolve({ id: "xyz" }) })).status).toBe(403);
  });

  it("unbekannte id → 404", async () => {
    const { GET } = await import("./route");
    const res = await GET(req("/api/admin/participants/xyz"), { params: Promise.resolve({ id: "xyz" }) });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });

  it("bekannte id → 200 mit Detail", async () => {
    const { getDb } = await import("../../../../_db/client");
    const { teilnehmerAnlegen } = await import("../../../../_lib/queries");
    const p = teilnehmerAnlegen(getDb(), "Ada", null);
    const { GET } = await import("./route");
    const res = await GET(req(`/api/admin/participants/${p.id}`), { params: Promise.resolve({ id: p.id }) });
    expect(res.status).toBe(200);
    expect((await res.json()).participant.name).toBe("Ada");
  });
});

describe("PATCH /api/admin/participants/[id]", () => {
  it("ändert Name", async () => {
    const { getDb } = await import("../../../../_db/client");
    const { teilnehmerAnlegen } = await import("../../../../_lib/queries");
    const p = teilnehmerAnlegen(getDb(), "Ada", null);
    const { PATCH } = await import("./route");
    const res = await PATCH(
      req(`/api/admin/participants/${p.id}`, { method: "PATCH", body: JSON.stringify({ name: "Berta" }) }),
      { params: Promise.resolve({ id: p.id }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("Berta");
  });

  it("unbekannte id → 404", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(
      req("/api/admin/participants/xyz", { method: "PATCH", body: JSON.stringify({ name: "Berta" }) }),
      { params: Promise.resolve({ id: "xyz" }) },
    );
    expect(res.status).toBe(404);
  });

  it("ungültiger Body → 400", async () => {
    const { getDb } = await import("../../../../_db/client");
    const { teilnehmerAnlegen } = await import("../../../../_lib/queries");
    const p = teilnehmerAnlegen(getDb(), "Ada", null);
    const { PATCH } = await import("./route");
    const res = await PATCH(
      req(`/api/admin/participants/${p.id}`, { method: "PATCH", body: JSON.stringify({ name: "" }) }),
      { params: Promise.resolve({ id: p.id }) },
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/admin/participants/[id]", () => {
  it("löscht Teilnehmer", async () => {
    const { getDb } = await import("../../../../_db/client");
    const { teilnehmerAnlegen, teilnehmerById } = await import("../../../../_lib/queries");
    const p = teilnehmerAnlegen(getDb(), "Ada", null);
    const { DELETE } = await import("./route");
    const res = await DELETE(req(`/api/admin/participants/${p.id}`, { method: "DELETE" }), { params: Promise.resolve({ id: p.id }) });
    expect(res.status).toBe(200);
    expect(teilnehmerById(getDb(), p.id)).toBeNull();
  });

  it("unbekannte id → 404", async () => {
    const { DELETE } = await import("./route");
    const res = await DELETE(req("/api/admin/participants/xyz", { method: "DELETE" }), { params: Promise.resolve({ id: "xyz" }) });
    expect(res.status).toBe(404);
  });
});
