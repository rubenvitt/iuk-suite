import { describe, it, expect, beforeEach, vi } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/uav-sync-test";
vi.mock("@/core/auth", () => ({ auth: async () => null }));

const HOST = "uav-training.iuk-ue.de";
let code = "";

beforeEach(async () => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR; process.env.SUITE_HOST_UAV = HOST;
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  const { getDb } = await import("../../_db/client");
  const q = await import("../../_lib/queries");
  q.teilnehmerAnlegen(getDb(), "Ada", null);
  const p = q.alleTeilnehmer(getDb())[0];
  code = p.loginCode;
});

/** Meldet den Teilnehmer über den echten Handler an und liefert das sid-Cookie. */
async function cookieDurchAnmeldung(): Promise<string> {
  const { POST } = await import("../anmeldung/route");
  const res = await POST(new Request("http://x/api/anmeldung", {
    method: "POST", headers: { host: HOST, "content-type": "application/json" }, body: JSON.stringify({ code }),
  }));
  return res.headers.get("set-cookie")!.split(";")[0];
}

const post = (body: unknown, cookie?: string, host = HOST) =>
  new Request("http://x/api/sync", {
    method: "POST",
    headers: { host, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

const gueltigerBody = { since: null, executions: [], taskStatus: [] };

describe("POST /api/sync", () => {
  it("anonym → 401", async () => {
    const { POST } = await import("./route");
    expect((await POST(post(gueltigerBody))).status).toBe(401);
  });

  it("mit Cookie aus POST anmeldung → 200 und Snapshot", async () => {
    const cookie = await cookieDurchAnmeldung();
    const { POST } = await import("./route");
    const res = await POST(post(gueltigerBody, cookie));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ executions: [], taskStatus: [], serverTime: expect.any(String) });
  });

  it("Body ohne executions → 400", async () => {
    const cookie = await cookieDurchAnmeldung();
    const { POST } = await import("./route");
    const res = await POST(post({ since: null, taskStatus: [] }, cookie));
    expect(res.status).toBe(400);
  });

  it("fremder Host → 404", async () => {
    const cookie = await cookieDurchAnmeldung();
    const { POST } = await import("./route");
    expect((await POST(post(gueltigerBody, cookie, "iuk-ue.de"))).status).toBe(404);
  });
});

it("audit attributes a real sync write to the server-resolved participant", async () => {
  const { getDb } = await import("../../_db/client");
  const { openModuleDatabase } = await import("@/core/db");
  const q = await import("../../_lib/queries");
  const p = q.alleTeilnehmer(getDb())[0];
  const task = q.taskAnlegen(getDb(), { teil: 1, nummer: "1", titel: "Audit", lernziel: "", schritte: [], durchfuehrungshinweise: [], sicherheitshinweise: [], zielanzahlDefault: 1, aktiv: true });
  const cookie = await cookieDurchAnmeldung();
  const sqlite = openModuleDatabase(`${DIR}/uav.db`);
  sqlite.exec("DELETE FROM audit_outbox");
  const { POST } = await import("./route");
  const result = await POST(post({ since: null, executions: [{ id: "execution-audit", taskId: task.id, datum: "2026-09-06" }], taskStatus: [] }, cookie));
  expect(result.status).toBe(200);
  const rows = sqlite.prepare("SELECT actor FROM audit_outbox WHERE object_type = 'executions'").all() as { actor: string }[];
  expect(rows).toHaveLength(1);
  expect(JSON.parse(rows[0].actor)).toEqual({ kind: "user", id: `uav:participant:${p.id}` });
  expect(JSON.stringify(rows)).not.toContain(code);
  sqlite.close();
});
