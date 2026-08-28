import { describe, it, expect, beforeEach, vi } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/uav-anmeldung-test";
vi.mock("@/core/auth", () => ({ auth: async () => null }));

beforeEach(async () => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR; process.env.SUITE_HOST_UAV = "uav-training.iuk-ue.de";
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  const { getDb } = await import("../../_db/client");
  const q = await import("../../_lib/queries");
  q.teilnehmerAnlegen(getDb(), "Ada", null);
  const p = q.alleTeilnehmer(getDb())[0];
  q.teilnehmerAendern(getDb(), p.id, {});
  process.env.__TEST_CODE = p.loginCode;
});

const post = (code: string, host = "uav-training.iuk-ue.de") =>
  new Request("http://x/api/anmeldung", { method: "POST", headers: { host, "content-type": "application/json" }, body: JSON.stringify({ code }) });

describe("POST /api/anmeldung", () => {
  it("setzt sid als httpOnly-Cookie mit path=/ und ohne Domain", async () => {
    const { POST } = await import("./route");
    const res = await POST(post(process.env.__TEST_CODE!.toLowerCase().replace(/(..)/g, "$1-")));
    expect(res.status).toBe(200);
    const sc = res.headers.get("set-cookie")!;
    expect(sc).toMatch(/^sid=/); expect(sc).toContain("Path=/"); expect(sc).toContain("HttpOnly"); expect(sc).not.toMatch(/Domain=/i);
  });
  it("falscher Code → 401 invalid_code", async () => {
    const { POST } = await import("./route");
    const res = await POST(post("ZZZZZZZZ"));
    expect(res.status).toBe(401); expect((await res.json()).error.code).toBe("invalid_code");
  });
  it("fremder Host → 404 vor jeder Prüfung", async () => {
    const { POST } = await import("./route");
    expect((await POST(post(process.env.__TEST_CODE!, "iuk-ue.de"))).status).toBe(404);
  });
  it("Rate-Limit zählt pro Code: 10 Fehlversuche in einer Minute → 429, ein anderer Code geht weiter", async () => {
    const { POST } = await import("./route");
    for (let i = 0; i < 10; i++) await POST(post("AAAAAAAA"));
    expect((await POST(post("AAAAAAAA"))).status).toBe(429);
    expect((await POST(post("BBBBBBBB"))).status).toBe(401);
  });
});
