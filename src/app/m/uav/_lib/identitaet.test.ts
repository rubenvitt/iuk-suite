import { describe, it, expect, beforeEach, vi } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/uav-identitaet-test";
type Session = { user: { id: string; name: string | null; email: string | null; groups: string[] } } | null;
let session: Session = null;
vi.mock("@/core/auth", () => ({ auth: async () => session }));

beforeEach(async () => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR; process.env.SUITE_HOST_UAV = "uav-training.iuk-ue.de";
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  session = null;
});

describe("sidAusCookieHeader", () => {
  it("liest sid aus mehreren Cookies", async () => {
    const { sidAusCookieHeader } = await import("./identitaet");
    expect(sidAusCookieHeader("foo=bar; sid=abc123; baz=qux")).toBe("abc123");
  });
  it("null ohne Cookie-Header", async () => {
    const { sidAusCookieHeader } = await import("./identitaet");
    expect(sidAusCookieHeader(null)).toBeNull();
  });
  it("null wenn kein sid-Cookie enthalten ist", async () => {
    const { sidAusCookieHeader } = await import("./identitaet");
    expect(sidAusCookieHeader("foo=bar; baz=qux")).toBeNull();
  });
  it("decodiert URI-kodierte Werte", async () => {
    const { sidAusCookieHeader } = await import("./identitaet");
    expect(sidAusCookieHeader("sid=a%2Fb")).toBe("a/b");
  });
});

describe("identitaetAus", () => {
  it("anon ohne Cookie und ohne Suite-Session", async () => {
    const { identitaetAus } = await import("./identitaet");
    const { getDb } = await import("../_db/client");
    const req = new Request("http://x");
    expect(await identitaetAus(req, getDb())).toEqual({ kind: "anon" });
  });

  it("Teilnehmer-Cookie liefert die Teilnehmer-Identity", async () => {
    const { getDb } = await import("../_db/client");
    const db = getDb();
    const q = await import("./queries");
    q.teilnehmerAnlegen(db, "Ada", null);
    const p = q.alleTeilnehmer(db)[0];
    const { sessionErzeugen, SID_COOKIE } = await import("./sitzung");
    const roh = sessionErzeugen(db, p.id);
    const { identitaetAus } = await import("./identitaet");
    const req = new Request("http://x", { headers: { cookie: `${SID_COOKIE}=${roh}` } });
    expect(await identitaetAus(req, db)).toEqual({ kind: "participant", id: p.id, name: "Ada" });
  });

  it("Suite-Session mit Modul-Admin-Gruppe → admin", async () => {
    session = { user: { id: "sub-1", name: "Root", email: "r@x", groups: ["uav-training-admin"] } };
    const { identitaetAus } = await import("./identitaet");
    const { getDb } = await import("../_db/client");
    const req = new Request("http://x");
    expect(await identitaetAus(req, getDb())).toEqual({ kind: "admin", id: "sub-1", name: "Root", email: "r@x" });
  });

  it("Suite-Session ohne passende Gruppe → anon", async () => {
    session = { user: { id: "sub-1", name: "Root", email: "r@x", groups: ["andere"] } };
    const { identitaetAus } = await import("./identitaet");
    const { getDb } = await import("../_db/client");
    const req = new Request("http://x");
    expect(await identitaetAus(req, getDb())).toEqual({ kind: "anon" });
  });
});
