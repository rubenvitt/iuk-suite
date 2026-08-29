import { describe, it, expect, vi, beforeEach } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/uav-admin-task-detail-test";
let gruppen: string[] | null = null;
vi.mock("@/core/auth", () => ({ auth: async () => (gruppen ? { user: { id: "sub-1", name: "Root", email: "r@x", groups: gruppen } } : null) }));

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR; process.env.SUITE_HOST_UAV = "uav-training.iuk-ue.de";
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  gruppen = ["uav-training-admin"];
});

const req = (id: string, init: RequestInit) =>
  new Request(`http://x/api/admin/tasks/${id}`, { ...init, headers: { ...init.headers, host: "uav-training.iuk-ue.de", "content-type": "application/json" } });

const anlegen = async () => {
  const { getDb } = await import("../../../../_db/client");
  const { taskAnlegen } = await import("../../../../_lib/queries");
  return taskAnlegen(getDb(), {
    teil: 1, nummer: "1.1", titel: "Start", lernziel: "", schritte: [], durchfuehrungshinweise: [], sicherheitshinweise: [],
    zielanzahlDefault: 1, aktiv: true, bildUrl: "/x.webp",
  });
};

describe("PATCH /api/admin/tasks/[id]", () => {
  it("anonym → 403", async () => {
    gruppen = null;
    const { PATCH } = await import("./route");
    const res = await PATCH(req("xyz", { method: "PATCH", body: JSON.stringify({ titel: "Neu" }) }), { params: Promise.resolve({ id: "xyz" }) });
    expect(res.status).toBe(403);
  });

  it("ändert Titel, lässt bildUrl bei fehlendem Feld unverändert", async () => {
    const t = await anlegen();
    const { PATCH } = await import("./route");
    const res = await PATCH(req(t.id, { method: "PATCH", body: JSON.stringify({ titel: "Neu" }) }), { params: Promise.resolve({ id: t.id }) });
    expect(res.status).toBe(200);
    const task = await res.json();
    expect(task.titel).toBe("Neu");
    expect(task.bildUrl).toBe("/x.webp");
  });

  it("leerer bildUrl-String entfernt das Bild (→ null)", async () => {
    const t = await anlegen();
    const { PATCH } = await import("./route");
    const res = await PATCH(req(t.id, { method: "PATCH", body: JSON.stringify({ bildUrl: "" }) }), { params: Promise.resolve({ id: t.id }) });
    expect((await res.json()).bildUrl).toBeNull();
  });

  it("explizites bildUrl:null entfernt das Bild ebenso (Alt admin.ts:167-170)", async () => {
    const t = await anlegen();
    const { PATCH } = await import("./route");
    const res = await PATCH(req(t.id, { method: "PATCH", body: JSON.stringify({ bildUrl: null }) }), { params: Promise.resolve({ id: t.id }) });
    expect((await res.json()).bildUrl).toBeNull();
  });

  it("fehlendes bildUrl-Feld lässt das Bild unverändert", async () => {
    const t = await anlegen();
    const { PATCH } = await import("./route");
    const res = await PATCH(req(t.id, { method: "PATCH", body: JSON.stringify({ titel: "Anders" }) }), { params: Promise.resolve({ id: t.id }) });
    expect((await res.json()).bildUrl).toBe("/x.webp");
  });

  it("unbekannte id → 404", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(req("xyz", { method: "PATCH", body: JSON.stringify({ titel: "Neu" }) }), { params: Promise.resolve({ id: "xyz" }) });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/admin/tasks/[id]", () => {
  it("löscht Aufgabe", async () => {
    const t = await anlegen();
    const { DELETE } = await import("./route");
    const res = await DELETE(req(t.id, { method: "DELETE" }), { params: Promise.resolve({ id: t.id }) });
    expect(res.status).toBe(200);
    const { getDb } = await import("../../../../_db/client");
    const { taskById } = await import("../../../../_lib/queries");
    expect(taskById(getDb(), t.id)).toBeNull();
  });

  it("unbekannte id → 404", async () => {
    const { DELETE } = await import("./route");
    expect((await DELETE(req("xyz", { method: "DELETE" }), { params: Promise.resolve({ id: "xyz" }) })).status).toBe(404);
  });
});
