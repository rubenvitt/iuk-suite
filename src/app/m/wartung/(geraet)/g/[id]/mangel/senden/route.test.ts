import { beforeEach, describe, expect, it, vi } from "vitest";

/* IDA-341: Turnstile am Mangel ohne Anmeldung — nur ohne Modulzugang, vor der Notbremse, nicht bei Wiederholung. */

const h = vi.hoisted(() => ({
  viewer: null as null | { groups: string[]; name?: string },
  turnstile: vi.fn<(token: string, aktion: string) => Promise<boolean>>(async () => true),
  schon: vi.fn<() => boolean | "fremd">(() => false),
  melden: vi.fn(),
  bremse: vi.fn(() => true),
}));

vi.mock("@/core/auth", () => ({ auth: async () => (h.viewer ? { user: h.viewer } : null) }));
vi.mock("@/core/audit/server", () => ({ auditActor: () => ({ kind: "anonymous" }), withAuditContext: (_: unknown, f: () => unknown) => f() }));
vi.mock("@/core/turnstile/server", () => ({ pruefeTurnstile: h.turnstile }));
vi.mock("../../../../../_db/client", () => ({ getDb: () => ({}) }));
vi.mock("../../../../../_lib/host", () => ({ hostAbweisung: () => null }));
vi.mock("../../../../../_lib/heute", () => ({ heute: () => "2026-11-10" }));
vi.mock("../../../../../_lib/bremse", () => ({ meldungOhneAnmeldungErlaubt: h.bremse }));
vi.mock("../../../../../_lib/zugang", () => ({
  hatWartungZugang: (g: string[]) => g.includes("wartung"), anzeigename: () => "Mitglied",
}));
vi.mock("../../../../../_lib/schreiben", () => ({
  Abgelehnt: class extends Error {}, schonGesendet: h.schon, mangelMelden: h.melden,
}));

import { POST } from "./route";

const GERAET = "5d2c1b0a-9e8f-4a7b-8c6d-5e4f3a2b1c0d";
const SENDUNG = "0b6f7c1e-3d2a-4c55-9a8e-1f2e3d4c5b6a";

function senden(token?: string): Promise<Response> {
  const fd = new FormData();
  fd.set("sendung", SENDUNG);
  fd.set("text", "Kabel angescheuert");
  fd.set("einsatzbereit", "ja");
  if (token !== undefined) fd.set("cf-turnstile-response", token);
  return POST(new Request(`https://wartung.example.org/g/${GERAET}/mangel/senden`, { method: "POST", body: fd }), { params: Promise.resolve({ id: GERAET }) });
}

beforeEach(() => {
  h.viewer = null;
  for (const f of [h.turnstile, h.schon, h.melden, h.bremse]) f.mockClear();
  h.turnstile.mockResolvedValue(true);
  h.schon.mockReturnValue(false);
  h.bremse.mockReturnValue(true);
});

describe("Mangel melden mit Turnstile (IDA-341)", () => {
  it("prüft ohne Anmeldung das Token mit der Aktion der Wartung", async () => {
    const r = await senden("tok");
    expect(r.status).toBe(200);
    expect(h.turnstile).toHaveBeenCalledWith("tok", "wartung_mangel");
    expect(h.melden).toHaveBeenCalledTimes(1);
  });

  it("weist ohne gültiges Token ab, bevor die Notbremse zählt", async () => {
    h.turnstile.mockResolvedValue(false);
    const r = await senden();
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ ok: false, fehler: expect.stringContaining("automatische Einsendungen") });
    expect(h.turnstile).toHaveBeenCalledWith("", "wartung_mangel");
    expect(h.bremse).not.toHaveBeenCalled();
    expect(h.melden).not.toHaveBeenCalled();
  });

  it("nimmt eine schon angelegte Sendung ohne neue Prüfung an", async () => {
    h.schon.mockReturnValue(true);
    h.turnstile.mockResolvedValue(false);
    expect((await senden("verbraucht")).status).toBe(200);
    expect(h.turnstile).not.toHaveBeenCalled();
  });

  it("prüft mit Modulzugang nicht, ohne Zugang aber auch angemeldet", async () => {
    h.viewer = { groups: ["wartung"] };
    expect((await senden()).status).toBe(200);
    expect(h.turnstile).not.toHaveBeenCalled();
    h.viewer = { groups: ["andere"] };
    h.turnstile.mockResolvedValue(false);
    expect((await senden()).status).toBe(400);
  });
});
