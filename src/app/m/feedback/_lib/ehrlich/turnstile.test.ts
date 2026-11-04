import { describe, it, expect, vi } from "vitest";
import { pruefeTurnstile, turnstileKonfigFehler, turnstileSiteKey } from "./turnstile";

const AN = { TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET: "geheim" };
const OK = { success: true, action: "ehrlich_einwurf", hostname: "ehrlich-gesagt.example.org" };

function antwort(daten: unknown, ok = true): Response {
  return { ok, json: async () => daten } as Response;
}

describe("Turnstile (IDA-340)", () => {
  it("ist ohne Site-Key und Secret aus und lässt durch", async () => {
    const holen = vi.fn();
    expect(turnstileSiteKey({})).toBeNull();
    expect(turnstileSiteKey({ TURNSTILE_SITE_KEY: "site" })).toBeNull();
    expect(await pruefeTurnstile("", {}, holen)).toBe(true);
    expect(holen).not.toHaveBeenCalled();
  });

  it("schickt nur Secret und Token, keine IP", async () => {
    const holen = vi.fn(async () => antwort(OK));
    expect(turnstileSiteKey(AN)).toBe("site");
    expect(await pruefeTurnstile("tok", AN, holen)).toBe(true);
    const [url, init] = holen.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({ secret: "geheim", response: "tok" });
  });

  it("verlangt die Aktion des Einwurfs und, wenn gesetzt, einen erlaubten Host", async () => {
    const mitHosts = { ...AN, TURNSTILE_HOSTNAMES: "ehrlich-gesagt.example.org, da.example.org" };
    expect(await pruefeTurnstile("tok", AN, vi.fn(async () => antwort({ ...OK, action: "login" })))).toBe(false);
    expect(await pruefeTurnstile("tok", mitHosts, vi.fn(async () => antwort(OK)))).toBe(true);
    expect(await pruefeTurnstile("tok", mitHosts, vi.fn(async () => antwort({ ...OK, hostname: "fremd.example.org" })))).toBe(false);
    expect(await pruefeTurnstile("x".repeat(2049), AN, vi.fn())).toBe(false);
  });

  it("weist leeres Token, Ablehnung, HTTP-Fehler und Netzfehler ab", async () => {
    expect(await pruefeTurnstile("", AN, vi.fn())).toBe(false);
    expect(await pruefeTurnstile("tok", AN, vi.fn(async () => antwort({ success: false })))).toBe(false);
    expect(await pruefeTurnstile("tok", AN, vi.fn(async () => antwort({ success: true }, false)))).toBe(false);
    expect(await pruefeTurnstile("tok", AN, vi.fn(async () => { throw new Error("weg"); }))).toBe(false);
  });

  it("meldet beim Boot, wenn nur einer der beiden Werte gesetzt ist", () => {
    expect(turnstileKonfigFehler({})).toEqual([]);
    expect(turnstileKonfigFehler(AN)).toEqual([]);
    expect(turnstileKonfigFehler({ TURNSTILE_SITE_KEY: "site" })).toHaveLength(1);
    expect(turnstileKonfigFehler({ TURNSTILE_SECRET: "geheim" })).toHaveLength(1);
  });
});
