import { describe, it, expect, beforeEach, vi } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/uav-anmeldung-test";
vi.mock("@/core/auth", () => ({ auth: async () => null }));

beforeEach(async () => {
  // Frische Modulinstanz je Fall: die Zähler des Handlers leben im Modulspeicher.
  vi.resetModules();
  vi.restoreAllMocks();
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

const post = (code: string, host = "uav-training.iuk-ue.de", ip?: string) =>
  new Request("http://x/api/anmeldung", {
    method: "POST",
    headers: { host, "content-type": "application/json", ...(ip ? { "cf-connecting-ip": ip } : {}) },
    body: JSON.stringify({ code }),
  });

/**
 * Alle Schlüssel, unter denen irgendein `RateLimiter` in diesem Fall gebucht hat. Dynamisch
 * importiert: nach `vi.resetModules()` hängt der Handler an einer FRISCHEN Modulinstanz — ein
 * Spion auf der statisch importierten Klasse sähe keinen einzigen Aufruf.
 */
async function gebuchteSchluessel() {
  const { RateLimiter } = await import("@/core/ratelimit");
  const spy = vi.spyOn(RateLimiter.prototype, "check");
  return () => spy.mock.calls.map(([k]) => k);
}

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

  it("zehn Fehlversuche auf einen FORMATGÜLTIGEN Code sperren nur diesen Code (Positivfall)", async () => {
    const { POST } = await import("./route");
    for (let i = 0; i < 10; i++) await POST(post("AAAAAAAA", undefined, "198.51.100.1"));
    expect((await POST(post("AAAAAAAA", undefined, "198.51.100.1"))).status).toBe(429);
    expect((await POST(post(process.env.__TEST_CODE!, undefined, "198.51.100.1"))).status).toBe(200);
  });
});

/**
 * DRK-287 (CWE-770): ein Rohwert, der keinem ausgestellten Code gleichen kann, wird verworfen,
 * BEVOR ein Zähler für ihn entsteht — sonst wächst der Prozessspeicher mit jedem neuen String.
 */
describe("POST /api/anmeldung — Speicherrahmen (DRK-287)", () => {
  it("überlanger Rohwert (1 MiB) → 400, ohne dass ein Zähler ihn als Schlüssel sieht", async () => {
    const { POST } = await import("./route");
    const schluessel = await gebuchteSchluessel();
    const res = await POST(post("A".repeat(1024 * 1024)));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_error");
    expect(schluessel().every((k) => k.length <= 64)).toBe(true);
    // Gegenprobe, dass der Spion überhaupt sieht: ein formatgültiger Code wird gebucht.
    await POST(post("ZZZZZZZZ"));
    expect(schluessel()).toContain("ZZZZZZZZ");
  });

  it("Rohwert knapp über der Grenze → 400, an der Grenze wird normal geprüft", async () => {
    const { POST } = await import("./route");
    expect((await POST(post(" ".repeat(60) + "ZZZZZ"))).status).toBe(400);
    expect((await POST(post(" ".repeat(56) + process.env.__TEST_CODE!))).status).toBe(200);
  });

  it.each([["ZZZZZZZZZ"], ["ZZZZZZZ"], ["ZZZZ!ZZZ"], ["ÄÖÜÄÖÜÄÖ"]])(
    "formatfalscher Code %j → 401 invalid_code, ohne eigenen Code-Zähler",
    async (code) => {
      const { POST } = await import("./route");
      const schluessel = await gebuchteSchluessel();
      const res = await POST(post(code, undefined, "198.51.100.1"));
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe("invalid_code");
      expect(schluessel()).not.toContain(code.toUpperCase());
      expect(schluessel()).toEqual(["198.51.100.1"]);
    },
  );

  it("viele NEUE Codes von einem Absender → 429 für diesen Absender, ein anderer Absender meldet sich weiter an", async () => {
    const { POST } = await import("./route");
    const { ANMELDUNG_FEHLVERSUCHE_JE_ABSENDER_PRO_MIN: grenze } = await import("../../_lib/anmeldeSchranke");
    const codes = Array.from({ length: grenze }, (_, i) => `ZZZZ${String(i).padStart(4, "0")}`);
    for (const c of codes) expect((await POST(post(c, undefined, "203.0.113.66"))).status).toBe(401);
    expect((await POST(post("YYYYYYYY", undefined, "203.0.113.66"))).status).toBe(429);
    expect((await POST(post(process.env.__TEST_CODE!, undefined, "198.51.100.7"))).status).toBe(200);
  });

  it("gemeinsamer Vereins-Uplink: einige Tippfehler vieler Leute sperren die gültigen Anmeldungen nicht", async () => {
    const { POST } = await import("./route");
    const { ANMELDUNG_FEHLVERSUCHE_JE_ABSENDER_PRO_MIN: grenze } = await import("../../_lib/anmeldeSchranke");
    for (let i = 0; i < grenze - 1; i++) await POST(post(`ZZZZ${String(i).padStart(4, "0")}`, undefined, "192.0.2.10"));
    expect((await POST(post(process.env.__TEST_CODE!, undefined, "192.0.2.10"))).status).toBe(200);
    // Erfolgreiche Anmeldungen zählen nicht gegen den Absender.
    for (let i = 0; i < 5; i++) expect((await POST(post(process.env.__TEST_CODE!, undefined, "192.0.2.10"))).status).toBe(200);
  });

  it("die Absenderschranke gibt nach Ablauf der Minute wieder frei", async () => {
    const jetzt = Date.now();
    const uhr = vi.spyOn(Date, "now").mockReturnValue(jetzt);
    const { POST } = await import("./route");
    const { ANMELDUNG_FEHLVERSUCHE_JE_ABSENDER_PRO_MIN: grenze } = await import("../../_lib/anmeldeSchranke");
    for (let i = 0; i < grenze; i++) await POST(post(`ZZZZ${String(i).padStart(4, "0")}`, undefined, "203.0.113.67"));
    expect((await POST(post(process.env.__TEST_CODE!, undefined, "203.0.113.67"))).status).toBe(429);
    uhr.mockReturnValue(jetzt + 60_001);
    expect((await POST(post(process.env.__TEST_CODE!, undefined, "203.0.113.67"))).status).toBe(200);
  });
});
