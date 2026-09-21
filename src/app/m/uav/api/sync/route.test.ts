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

  it("begrenzt Mutationen und lehnt doppelte IDs ab", async () => {
    const cookie = await cookieDurchAnmeldung();
    const { POST } = await import("./route");
    const execution = { id: "e", taskId: "1-1", datum: "2026-09-07" };
    expect((await POST(post({ since: null, executions: Array.from({ length: 101 }, (_, id) => ({ ...execution, id: String(id) })), taskStatus: [] }, cookie))).status).toBe(400);
    expect((await POST(post({ since: null, executions: [execution, { ...execution, drohnensteuerer: "anders" }], taskStatus: [] }, cookie))).status).toBe(400);
  });

  it("begrenzt die tatsächlich gelesene Body-Größe auch bei falschem Content-Length", async () => {
    const cookie = await cookieDurchAnmeldung();
    const { POST, SYNC_MAX_BODY_BYTES } = await import("./route");
    const req = post({ ...gueltigerBody, padding: "x".repeat(SYNC_MAX_BODY_BYTES) }, cookie);
    req.headers.set("content-length", "1");
    expect((await POST(req)).status).toBe(413);
  });

  it("begrenzt Sync-Anfragen pro Teilnehmer", async () => {
    const cookie = await cookieDurchAnmeldung();
    const { POST } = await import("./route");
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await POST(post(gueltigerBody, cookie))).status);
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses[10]).toBe(429);
  });

  it("wendet Backpressure an, bevor der Audit-Outbox-Grenzwert überschritten wird", async () => {
    const cookie = await cookieDurchAnmeldung();
    const { POST, SYNC_MAX_PENDING_AUDIT_EVENTS } = await import("./route");
    const { openModuleDatabase } = await import("@/core/db");
    const sqlite = openModuleDatabase(`${DIR}/uav.db`);
    const insert = sqlite.prepare("INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, actor, result, origin) VALUES (?, 0, 'uav', 'update', 'executions', '{\"kind\":\"system\"}', 'success', 'database')");
    sqlite.transaction(() => {
      for (let i = 0; i < SYNC_MAX_PENDING_AUDIT_EVENTS; i++) insert.run(`pending-${i}`);
    })();
    expect((await POST(post({ since: null, executions: [{ id: "one-more", taskId: "1-1", datum: "2026-09-07" }], taskStatus: [] }, cookie))).status).toBe(503);
    sqlite.close();
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

/**
 * DRK-285 über den echten Handler: B meldet sich mit dem eigenen Code an und
 * schickt die ID einer Durchführung von A. Der Handler darf weder As Zeile
 * ändern noch mit 200 quittieren.
 */
describe("POST /api/sync — fremde Execution-ID (DRK-285)", () => {
  async function anmelden(loginCode: string): Promise<string> {
    const { POST } = await import("../anmeldung/route");
    const res = await POST(new Request("http://x/api/anmeldung", {
      method: "POST", headers: { host: HOST, "content-type": "application/json" }, body: JSON.stringify({ code: loginCode }),
    }));
    return res.headers.get("set-cookie")!.split(";")[0];
  }

  it("weist die fremde ID mit 409 ab, nennt sie, lässt A bytegleich und wendet vom Batch nichts an", async () => {
    const { getDb } = await import("../../_db/client");
    const q = await import("../../_lib/queries");
    const { openModuleDatabase } = await import("@/core/db");
    const bob = q.teilnehmerAnlegen(getDb(), "Bob", null);
    const { POST } = await import("./route");
    const cookieA = await anmelden(code);
    const cookieB = await anmelden(bob.loginCode);
    const eintrag = { id: "a-exec", taskId: "1-1", datum: "2026-09-06", drohnensteuerer: "Ada", luftraumbeobachter: "Bea" };
    expect((await POST(post({ since: null, executions: [eintrag], taskStatus: [] }, cookieA))).status).toBe(200);

    const sqlite = openModuleDatabase(`${DIR}/uav.db`);
    const zeile = () => sqlite.prepare("SELECT * FROM executions WHERE id = 'a-exec'").get();
    const vorher = zeile();

    const res = await POST(post({
      since: null,
      executions: [{ ...eintrag, id: "b-exec" }, { ...eintrag, deletedAt: "2026-09-07T00:00:00.000Z", drohnensteuerer: "Mallory" }],
      taskStatus: [{ taskId: "1-1", zielanzahl: 9, nichtAnwendbar: false, updatedAt: "2026-09-07T00:00:00.000Z" }],
    }, cookieB));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: "fremde_durchfuehrung", message: expect.any(String), ids: ["a-exec"] } });
    expect(zeile()).toEqual(vorher);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM executions WHERE participant_id = ?").get(bob.id)).toEqual({ n: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM task_status WHERE participant_id = ?").get(bob.id)).toEqual({ n: 0 });

    // Derselbe Batch ohne die fremde ID geht durch — der Client kann sich also erholen.
    const retry = await POST(post({ since: null, executions: [{ ...eintrag, id: "b-exec" }], taskStatus: [] }, cookieB));
    expect(retry.status).toBe(200);
    expect((await retry.json()).executions.map((e: { id: string }) => e.id)).toEqual(["b-exec"]);
    sqlite.close();
  });
});
