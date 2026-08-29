import { describe, it, expect, vi, beforeEach } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/uav-admin-participants-test";
let gruppen: string[] | null = null;
vi.mock("@/core/auth", () => ({ auth: async () => (gruppen ? { user: { id: "sub-1", name: "Root", email: "r@x", groups: gruppen } } : null) }));

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR; process.env.SUITE_HOST_UAV = "uav-training.iuk-ue.de";
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  gruppen = null;
});

const get = (host = "uav-training.iuk-ue.de") => new Request("http://x/api/admin/participants", { headers: { host } });
const post = (host = "uav-training.iuk-ue.de") =>
  new Request("http://x/api/admin/participants", {
    method: "POST",
    headers: { host, "content-type": "application/json" },
    body: JSON.stringify({ name: "Bruno" }),
  });

describe("GET /api/admin/participants", () => {
  it("anonym → 403 (nicht 401, nicht 404 — der Host ist richtig, das Recht fehlt)", async () => { gruppen = null; const { GET } = await import("./route"); expect((await GET(get())).status).toBe(403); });
  it("eingeloggt ohne Gruppe → 403", async () => { gruppen = ["andere"]; const { GET } = await import("./route"); expect((await GET(get())).status).toBe(403); });
  it("mit uav-training-admin → 200 und Liste", async () => { gruppen = ["uav-training-admin"]; const { GET } = await import("./route"); const r = await GET(get()); expect(r.status).toBe(200); expect(await r.json()).toEqual([]); });
  it("Suite-Admin (dashboard-admins) → 200", async () => { gruppen = ["dashboard-admins"]; const { GET } = await import("./route"); expect((await GET(get())).status).toBe(200); });
  it("fremder Host → 404 auch für Admins", async () => { gruppen = ["uav-training-admin"]; const { GET } = await import("./route"); expect((await GET(get("iuk-ue.de"))).status).toBe(404); });
});

describe("POST /api/admin/participants", () => {
  // Eigene Ergänzung zu den fünf GET-Fällen aus dem Plan: dieselbe Sperre muss
  // auf JEDER exportierten Methode der Datei greifen, nicht nur auf GET — sonst
  // wäre das Anlegen eines Teilnehmers über POST ungeschützt.
  it("anonym → 403", async () => { gruppen = null; const { POST } = await import("./route"); expect((await POST(post())).status).toBe(403); });
  it("mit uav-training-admin → 201 und legt an", async () => {
    gruppen = ["uav-training-admin"];
    const { POST } = await import("./route");
    const res = await POST(post());
    expect(res.status).toBe(201);
    expect((await res.json()).name).toBe("Bruno");
  });
});
