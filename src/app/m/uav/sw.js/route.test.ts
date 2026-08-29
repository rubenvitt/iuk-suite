// src/app/m/uav/sw.js/route.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

/**
 * ⛔ `x-forwarded-host` UND NICHT `host` — Vorbild `radio/sw.js/route.test.ts:36-40`:
 * `resolveHost` (`src/core/routing.ts:36-41`) liest ihn mit Vorrang, und `Host` ist in
 * undicis `Headers` mit dem Request-Waechter ein verbotener Name.
 */
const UAV_HOST = { "x-forwarded-host": "uav.localtest.me" };
const FREMDER_HOST = { "x-forwarded-host": "portal.localtest.me" };

function anfrage(kopf: HeadersInit): Request {
  return new Request("http://uav.localtest.me/sw.js", { method: "GET", headers: kopf });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /sw.js — der Riegel, alles IN der Route, plus der Modus-Schalter", () => {
  it("auf fremdem Host 404, und nicht als HTML", async () => {
    const antwort = GET(anfrage(FREMDER_HOST));
    expect(antwort.status).toBe(404);
    expect(antwort.headers.get("content-type")?.startsWith("text/html")).toBe(false);
  });

  it("eigener Host, Modus abraeumen (Vorgabe): 200, text/javascript, no-cache, Abraeum-Quelle", async () => {
    vi.stubEnv("UAV_SW_MODUS", undefined);
    const antwort = GET(anfrage(UAV_HOST));
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(antwort.headers.get("cache-control")).toBe("no-cache");
    expect(await antwort.text()).toContain("registration.unregister()");
  });

  it("eigener Host, Modus cachen: Body ist die Cache-Quelle", async () => {
    vi.stubEnv("UAV_SW_MODUS", "cachen");
    const antwort = GET(anfrage(UAV_HOST));
    expect(antwort.status).toBe(200);
    expect(await antwort.text()).toContain("uav-pwa-v1");
  });
});
