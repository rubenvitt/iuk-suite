import { describe, it, expect, vi } from "vitest";
import { pruefeTurnstile, turnstileSiteKey } from "./turnstile";

const AN = { SUITE_EHRLICH_TURNSTILE_SITE_KEY: "site", SUITE_EHRLICH_TURNSTILE_SECRET: "geheim" };

function antwort(daten: unknown, ok = true): Response {
  return { ok, json: async () => daten } as Response;
}

describe("Turnstile (IDA-340)", () => {
  it("ist ohne Site-Key und Secret aus und lässt durch", async () => {
    const holen = vi.fn();
    expect(turnstileSiteKey({})).toBeNull();
    expect(turnstileSiteKey({ SUITE_EHRLICH_TURNSTILE_SITE_KEY: "site" })).toBeNull();
    expect(await pruefeTurnstile("", {}, holen)).toBe(true);
    expect(holen).not.toHaveBeenCalled();
  });

  it("schickt nur Secret und Token, keine IP", async () => {
    const holen = vi.fn(async () => antwort({ success: true }));
    expect(turnstileSiteKey(AN)).toBe("site");
    expect(await pruefeTurnstile("tok", AN, holen)).toBe(true);
    const [url, init] = holen.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({ secret: "geheim", response: "tok" });
  });

  it("weist leeres Token, Ablehnung, HTTP-Fehler und Netzfehler ab", async () => {
    expect(await pruefeTurnstile("", AN, vi.fn())).toBe(false);
    expect(await pruefeTurnstile("tok", AN, vi.fn(async () => antwort({ success: false })))).toBe(false);
    expect(await pruefeTurnstile("tok", AN, vi.fn(async () => antwort({ success: true }, false)))).toBe(false);
    expect(await pruefeTurnstile("tok", AN, vi.fn(async () => { throw new Error("weg"); }))).toBe(false);
  });
});
