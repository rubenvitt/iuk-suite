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

/** Wie `gebuchteSchluessel`, aber nur Aufrufe, die einen Eintrag NEU anlegen dürfen. */
async function neuAngelegteSchluessel() {
  const { RateLimiter } = await import("@/core/ratelimit");
  const spy = vi.spyOn(RateLimiter.prototype, "check");
  return () => spy.mock.calls.filter(([, nurVorhandene]) => !nurVorhandene).map(([k]) => k);
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
  it("überlanger Rohwert (1 MiB) → 413 schon am Body, ohne dass ein Zähler ihn als Schlüssel sieht", async () => {
    const { POST } = await import("./route");
    const schluessel = await gebuchteSchluessel();
    const res = await POST(post("A".repeat(1024 * 1024)));
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("body_too_large");
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

  it("viele NEUE Codes von einem Absender: nach dem Budget legt er keinen Code-Eintrag mehr an — Antworten bleiben gleich", async () => {
    const { POST } = await import("./route");
    const { ANMELDUNG_FEHLVERSUCHE_JE_ABSENDER_PRO_MIN: grenze } = await import("../../_lib/anmeldeSchranke");
    for (let i = 0; i < grenze; i++) expect((await POST(post(`ZZZZ${String(i).padStart(4, "0")}`, undefined, "203.0.113.66"))).status).toBe(401);
    const schluessel = await neuAngelegteSchluessel();
    expect((await POST(post("YYYYYYYY", undefined, "203.0.113.66"))).status).toBe(401);
    expect(schluessel()).not.toContain("YYYYYYYY");
    // Gegenprobe: ein anderer Absender legt für denselben neuen Code sehr wohl einen Eintrag an.
    expect((await POST(post("YYYYYYYY", undefined, "198.51.100.7"))).status).toBe(401);
    expect(schluessel()).toContain("YYYYYYYY");
  });

  it("ein Absender über dem Budget unterliegt bestehenden Code-Sperren weiter", async () => {
    const { POST } = await import("./route");
    const { ANMELDUNG_FEHLVERSUCHE_JE_ABSENDER_PRO_MIN: grenze } = await import("../../_lib/anmeldeSchranke");
    for (let i = 0; i < 10; i++) await POST(post("AAAAAAAA", undefined, "198.51.100.8"));
    for (let i = 0; i < grenze; i++) await POST(post(`ZZZZ${String(i).padStart(4, "0")}`, undefined, "203.0.113.68"));
    expect((await POST(post("AAAAAAAA", undefined, "203.0.113.68"))).status).toBe(429);
  });

  it("ein Absender über dem Budget bucht auf einen bestehenden Code-Eintrag weiter — die Bremse je Code bleibt für ihn an", async () => {
    const { POST } = await import("./route");
    const { ANMELDUNG_FEHLVERSUCHE_JE_ABSENDER_PRO_MIN: grenze, ANMELDUNG_VERSUCHE_JE_CODE_PRO_MIN: jeCode } = await import("../../_lib/anmeldeSchranke");
    for (let i = 0; i < grenze; i++) await POST(post(`ZZZZ${String(i).padStart(4, "0")}`, undefined, "203.0.113.69"));
    expect((await POST(post("BBBBBBBB", undefined, "198.51.100.9"))).status).toBe(401); // Eintrag entsteht
    for (let i = 1; i < jeCode; i++) expect((await POST(post("BBBBBBBB", undefined, "203.0.113.69"))).status).toBe(401);
    expect((await POST(post("BBBBBBBB", undefined, "203.0.113.69"))).status).toBe(429);
  });

  it("gemeinsamer Vereins-Uplink (oder ein Sammel-Absender): auch weit über dem Budget meldet sich ein gültiger Code an", async () => {
    const { POST } = await import("./route");
    const { ANMELDUNG_FEHLVERSUCHE_JE_ABSENDER_PRO_MIN: grenze } = await import("../../_lib/anmeldeSchranke");
    for (let i = 0; i < grenze + 20; i++) await POST(post(`ZZZZ${String(i).padStart(4, "0")}`, undefined, "192.0.2.10"));
    for (let i = 0; i < 5; i++) expect((await POST(post(process.env.__TEST_CODE!, undefined, "192.0.2.10"))).status).toBe(200);
    // Ohne `cf-connecting-ip` landen alle im Sammel-Eimer "unknown" — dieselbe Zusage.
    for (let i = 0; i < grenze + 20; i++) await POST(post(`ZZZY${String(i).padStart(4, "0")}`));
    expect((await POST(post(process.env.__TEST_CODE!))).status).toBe(200);
  });
});

/** DRK-447: der Body wird nie ganz gelesen, nur bis zur Grenze — wie in `api/sync`. */
describe("POST /api/anmeldung — Body-Größenbremse (DRK-447)", () => {
  const roh = (body: string, contentLength?: string) =>
    new Request("http://x/api/anmeldung", {
      method: "POST",
      headers: { host: "uav-training.iuk-ue.de", "content-type": "application/json", ...(contentLength ? { "content-length": contentLength } : {}) },
      body,
    });

  it("angegebener Content-Length über der Grenze → 413, bevor gelesen wird", async () => {
    const { POST, ANMELDUNG_MAX_BODY_BYTES } = await import("./route");
    const res = await POST(roh(JSON.stringify({ code: "ZZZZZZZZ" }), String(ANMELDUNG_MAX_BODY_BYTES + 1)));
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("body_too_large");
  });

  it("gelogener Content-Length: gezählt wird beim Lesen", async () => {
    const { POST, ANMELDUNG_MAX_BODY_BYTES } = await import("./route");
    const res = await POST(roh(JSON.stringify({ code: "ZZZZZZZZ", polster: "x".repeat(ANMELDUNG_MAX_BODY_BYTES) }), "20"));
    expect(res.status).toBe(413);
  });

  it("an der Grenze wird normal geprüft — ein gültiger Code mit Polster meldet an", async () => {
    const { POST, ANMELDUNG_MAX_BODY_BYTES } = await import("./route");
    const rumpf = JSON.stringify({ code: process.env.__TEST_CODE!, polster: "" });
    const body = JSON.stringify({ code: process.env.__TEST_CODE!, polster: "x".repeat(ANMELDUNG_MAX_BODY_BYTES - rumpf.length) });
    expect(Buffer.byteLength(body)).toBe(ANMELDUNG_MAX_BODY_BYTES);
    expect((await POST(roh(body))).status).toBe(200);
  });

  it("kaputtes JSON → 400 invalid_json", async () => {
    const { POST } = await import("./route");
    const res = await POST(roh("{code:"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_json");
  });
});

/**
 * DRK-447: die Audit-Zeilen verworfener Anmeldungen haben eine modulweite Obergrenze — auch wenn
 * jede Anfrage eine frische Absenderadresse trägt. Erfolgreiche Anmeldungen zählen nicht mit.
 */
describe("POST /api/anmeldung — Audit-Obergrenze für Ablehnungen (DRK-447)", () => {
  async function auditZeilen() {
    const { queryAuditEvents } = await import("@/core/audit/storage");
    const alle = (typ: string) => queryAuditEvents({ module: "uav", objectType: typ, limit: 100 }).events;
    return { einzeln: alle("access"), gedrosselt: alle("access_throttled"), anmeldungen: alle("session") };
  }

  it("viele Fehlversuche von wechselnden Adressen: höchstens das Budget plus eine Markierung", async () => {
    const { POST } = await import("./route");
    const { ANMELDUNG_AUDIT_ABLEHNUNGEN_PRO_MIN: budget } = await import("../../_lib/anmeldeSchranke");
    for (let i = 0; i < budget * 5; i++) {
      expect((await POST(post(`ZZZZ${String(i).padStart(4, "0")}`, undefined, `198.51.100.${i % 250}`))).status).toBe(401);
    }
    const z = await auditZeilen();
    expect(z.einzeln).toHaveLength(budget);
    expect(z.gedrosselt).toHaveLength(1);
    expect(z.gedrosselt[0]).toMatchObject({ action: "access_denied", result: "denied", actor: { kind: "anonymous" } });
  });

  it("formatfalsche Codes zählen genauso gegen die Obergrenze", async () => {
    const { POST } = await import("./route");
    const { ANMELDUNG_AUDIT_ABLEHNUNGEN_PRO_MIN: budget } = await import("../../_lib/anmeldeSchranke");
    for (let i = 0; i < budget * 3; i++) await POST(post(`!${i}`, undefined, `203.0.113.${i}`));
    const z = await auditZeilen();
    expect(z.einzeln.length + z.gedrosselt.length).toBe(budget + 1);
  });

  it("über der Obergrenze meldet sich ein gültiger Code weiter an und wird protokolliert", async () => {
    const { POST } = await import("./route");
    const { ANMELDUNG_AUDIT_ABLEHNUNGEN_PRO_MIN: budget } = await import("../../_lib/anmeldeSchranke");
    for (let i = 0; i < budget * 2; i++) await POST(post(`ZZZZ${String(i).padStart(4, "0")}`, undefined, `192.0.2.${i}`));
    for (let i = 0; i < 3; i++) expect((await POST(post(process.env.__TEST_CODE!, undefined, "192.0.2.200"))).status).toBe(200);
    const z = await auditZeilen();
    expect(z.anmeldungen).toHaveLength(3);
    expect(z.einzeln).toHaveLength(budget);
  });
});
