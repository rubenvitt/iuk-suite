import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { sql } from "drizzle-orm";
import { queryAuditEvents } from "@/core/audit/storage";
import type { AvErgebnis } from "@/core/av/scanner";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/kommplan-logo-route-test";
let gruppen: string[] | null = null;
let befund: AvErgebnis = { art: "clean" };
let scans = 0;
vi.mock("@/core/auth", () => ({ auth: async () => (gruppen ? { user: { id: "u1", name: "Jana", groups: gruppen } } : null) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "kommplan.localtest.me" }) }));
vi.mock("../_lib/logoScan", () => ({ scanneLogo: async () => { scans += 1; return befund; } }));

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  gruppen = ["iuk-kommplan-bearbeiten"]; befund = { art: "clean" }; scans = 0;
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
/** Ein echter Multipart-Rumpf mit content-length — wie ihn der Browser schickt. */
async function anfrage(datei: Blob | null, kopf: Record<string, string> = {}): Promise<Request> {
  const fd = new FormData();
  if (datei) fd.set("logo", datei, "logo.svg");
  const roh = new Request("http://kommplan.localtest.me/logo", { method: "POST", body: fd });
  const body = await roh.arrayBuffer();
  return new Request("http://kommplan.localtest.me/logo", {
    method: "POST", body,
    headers: { "content-type": roh.headers.get("content-type")!, "content-length": String(body.byteLength), origin: "http://kommplan.localtest.me", "x-forwarded-host": "kommplan.localtest.me", ...kopf },
  });
}
const logo = async () => (await import("../_lib/briefkopf")).ladeBriefkopf((await import("../_db/client")).getDb()).logo;

describe("POST /logo", () => {
  it("ohne Bearbeitungsrecht: 404, nichts gelesen, nichts gespeichert", async () => {
    const { POST } = await import("./route");
    gruppen = ["iuk-kommplan"];
    expect((await POST(await anfrage(new Blob([PNG])))).status).toBe(404);
    gruppen = null;
    expect((await POST(await anfrage(new Blob([PNG])))).status).toBe(404);
    expect(scans).toBe(0);
    expect(await logo()).toBeNull();
  });
  it("fremde Herkunft (anderer Suite-Host): 403 und eine access_denied-Zeile — der CSRF-Versuch hinterlässt eine Spur", async () => {
    const { POST } = await import("./route");
    expect((await POST(await anfrage(new Blob([PNG]), { origin: "http://files.localtest.me" }))).status).toBe(403);
    expect(scans).toBe(0);
    // Muster: aufgaben, hochladen/route.test.ts, describe „persisted upload denials …"
    const events = queryAuditEvents().events.filter((e) => e.action === "access_denied");
    expect(events).toHaveLength(1);
    expect(events[0].actor).toMatchObject({ kind: "user", id: "u1" }); // auditActor trägt den Namen mit
  });
  it("zu groß laut content-length: 413, bevor gelesen wird; ohne Längenangabe (HTTP/2, Proxy) wird gelesen und an den Bytes gemessen", async () => {
    const { POST } = await import("./route");
    const r = await anfrage(new Blob([PNG]), { "content-length": String(2 * 1024 * 1024) });
    expect((await POST(r)).status).toBe(413);
    expect(scans).toBe(0);
    const mit = await anfrage(new Blob([PNG]));
    const kopf = new Headers(mit.headers); kopf.delete("content-length");
    const ohne = new Request(mit.url, { method: "POST", headers: kopf, body: await mit.arrayBuffer() });
    expect((await POST(ohne)).status).toBe(200);
  });
  it("Typ aus den Bytes: ein PNG namens logo.svg mit Content-Type text/plain wird als PNG gespeichert", async () => {
    const { POST } = await import("./route");
    const res = await POST(await anfrage(new Blob([PNG], { type: "text/plain" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, typ: "image/png" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await logo()).toEqual({ typ: "image/png", bytes: PNG.length });
  });
  it("Befund: 422 mit Meldung, nichts gespeichert; Audit nennt die Person bei Erfolg", async () => {
    const { POST } = await import("./route");
    befund = { art: "infected", signatur: "Eicar" };
    const abgelehnt = await POST(await anfrage(new Blob([PNG])));
    expect(abgelehnt.status).toBe(422);
    expect((await abgelehnt.json()).ok).toBe(false);
    expect(await logo()).toBeNull();
    befund = { art: "clean" };
    expect((await POST(await anfrage(new Blob([PNG])))).status).toBe(200);
    const { getDb } = await import("../_db/client");
    const akteure = getDb().all(sql`SELECT DISTINCT json_extract(actor, '$.id') AS id FROM audit_outbox WHERE object_type = 'briefkopf'`) as { id: string }[];
    expect(akteure).toEqual([{ id: "u1" }]);
  });
  it("ohne Feld „logo“: 400", async () => {
    const { POST } = await import("./route");
    expect((await POST(await anfrage(null))).status).toBe(400);
  });
});
