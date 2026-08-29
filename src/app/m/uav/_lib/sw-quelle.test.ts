import { describe, it, expect, vi } from "vitest";
import { UAV_SW_ABRAEUM_QUELLE, UAV_SW_CACHE_QUELLE } from "./sw-quelle";
describe("Abräum-Worker", () => {
  it("hat keinen fetch-Handler, räumt alle Caches, trägt sich aus und lädt Clients neu", () => {
    expect(UAV_SW_ABRAEUM_QUELLE).not.toContain('addEventListener("fetch"');
    expect(UAV_SW_ABRAEUM_QUELLE).toContain("caches.keys()");
    expect(UAV_SW_ABRAEUM_QUELLE).toContain("registration.unregister()");
    expect(UAV_SW_ABRAEUM_QUELLE).toContain("client.navigate(");
  });
});
describe("Cache-Worker", () => {
  it("cacht nie /api/ oder die Verwaltung", () => {
    expect(UAV_SW_CACHE_QUELLE).not.toMatch(/SHELL_ROUTES = \[[^\]]*api/);
    expect(UAV_SW_CACHE_QUELLE).toContain('if (url.pathname.startsWith("/api/")) return;');
    expect(UAV_SW_CACHE_QUELLE).toContain('if (url.pathname.startsWith("/admin")) return;');
  });
  it("gibt nicht weitergereichte Antworten frei (Lehre aus qr)", () => {
    expect(UAV_SW_CACHE_QUELLE).toContain("function releaseBody(");
  });
});

/**
 * Verhaltensprobe des Cache-Workers in einer nachgebauten Worker-Umgebung —
 * dasselbe Muster wie `qr/_lib/sw-source.test.ts`, hier schlank auf die
 * Abweichungen von `qr` zugeschnitten: Cookies statt `credentials: "omit"`, die
 * drei eigenen Shell-Routen, und die Denylist vor jeder Allowlist-Prüfung.
 */
describe("Cache-Worker: Verhalten in der nachgebauten Worker-Umgebung", () => {
  const ORIGIN = "https://uav.example.org";

  interface SwRequest {
    url: string;
    method: string;
    mode: string;
  }

  function createCacheStorage() {
    const stores = new Map<string, Map<string, Response>>();
    const keyOf = (req: SwRequest | string) =>
      typeof req === "string" ? new URL(req, ORIGIN).href : req.url;
    const open = (name: string) => {
      let store = stores.get(name);
      if (!store) {
        store = new Map();
        stores.set(name, store);
      }
      const s = store;
      return Promise.resolve({
        put: (req: SwRequest | string, res: Response) => {
          s.set(keyOf(req), res);
          return Promise.resolve();
        },
        match: (req: SwRequest | string) => Promise.resolve(s.get(keyOf(req))),
      });
    };
    return {
      api: { open, keys: () => Promise.resolve([...stores.keys()]), delete: (n: string) => Promise.resolve(stores.delete(n)) },
      cachedPaths: () => [...(stores.get("uav-pwa-v1") ?? new Map()).keys()].map((u) => new URL(u).pathname),
    };
  }

  function createNetwork() {
    return vi.fn(async (input: SwRequest | string, init?: { credentials?: string }) => {
      const url = new URL(typeof input === "string" ? input : input.url, ORIGIN);
      if (["/", "/aufgabe", "/login"].includes(url.pathname)) {
        return new Response(`<html><body>${url.pathname}${init?.credentials === "omit" ? " anon" : " mit-cookies"}</body></html>`, { status: 200 });
      }
      return new Response(`asset:${url.pathname}`, { status: 200 });
    });
  }

  interface FakeEvent {
    request: SwRequest;
    responded: boolean;
    response: Promise<Response | undefined> | null;
    waited: Promise<unknown>[];
    respondWith(p: Promise<Response | undefined>): void;
    waitUntil(p: Promise<unknown>): void;
  }

  function boot(fetchImpl: ReturnType<typeof createNetwork>, storage = createCacheStorage()) {
    const listeners = new Map<string, (e: FakeEvent) => void>();
    const self = {
      addEventListener: (type: string, fn: (e: FakeEvent) => void) => listeners.set(type, fn),
      skipWaiting: () => Promise.resolve(),
      clients: { claim: () => Promise.resolve() },
      location: { origin: ORIGIN },
    };
    // UAV_SW_CACHE_QUELLE ist eine Konstante aus diesem Repo, nichts wird
    // hineininterpoliert — der einzige Weg, den ausgelieferten Quelltext wirklich
    // auszuführen.
    new Function("self", "caches", "fetch", UAV_SW_CACHE_QUELLE)(self, storage.api, fetchImpl);
    function dispatch(type: string, request: SwRequest): FakeEvent {
      const event: FakeEvent = {
        request,
        responded: false,
        response: null,
        waited: [],
        respondWith(p) {
          event.responded = true;
          event.response = p;
        },
        waitUntil(p) {
          event.waited.push(p);
        },
      };
      listeners.get(type)?.(event);
      return event;
    }
    const drain = (e: FakeEvent) => Promise.all(e.waited);
    return { dispatch, drain, ...storage };
  }

  function navigation(path: string): SwRequest {
    return { url: new URL(path, ORIGIN).href, method: "GET", mode: "navigate" };
  }
  function subresource(path: string): SwRequest {
    return { url: new URL(path, ORIGIN).href, method: "GET", mode: "cors" };
  }

  it("holt die Shell-Routen MIT Cookies, nicht anonym", async () => {
    const net = createNetwork();
    const sw = boot(net);
    await sw.drain(sw.dispatch("install", navigation("/")));

    const shellCalls = net.mock.calls.filter(([input]) =>
      ["/", "/aufgabe", "/login"].includes(new URL(typeof input === "string" ? input : input.url, ORIGIN).pathname),
    );
    expect(shellCalls.length).toBeGreaterThan(0);
    for (const [, init] of shellCalls) {
      expect((init as { credentials?: string } | undefined)?.credentials).not.toBe("omit");
    }
  });

  it("legt alle drei Shell-Routen beim Install ab", async () => {
    const sw = boot(createNetwork());
    await sw.drain(sw.dispatch("install", navigation("/")));
    for (const path of ["/", "/aufgabe", "/login"]) {
      expect(sw.cachedPaths()).toContain(path);
    }
  });

  it("beantwortet /api/ und /admin nicht — auch nicht als Navigation", async () => {
    const sw = boot(createNetwork());
    for (const path of ["/api/me", "/admin"]) {
      const event = sw.dispatch("fetch", subresource(path));
      await sw.drain(event);
      expect(event.responded, path).toBe(false);
    }
  });

  it("cacht die RSC-Antwort einer Soft-Navigation auf eine Shell-Route nicht", async () => {
    // Die Lehre aus qr (`qr/_lib/sw-source.ts:216-229`): eine Allowlist, die den
    // Pfad einer Shell-Route pauschal zulaesst, liesse auch NICHT-Navigationen auf
    // denselben Pfad durch — genau die RSC-Antwort einer Soft-Navigation
    // ("/aufgabe?_rsc=<hash>"), dauerhaft und ohne Revalidierung im Cache.
    const sw = boot(createNetwork());
    const rsc = sw.dispatch("fetch", subresource("/aufgabe?_rsc=1a2b3c"));
    await sw.drain(rsc);

    expect(rsc.responded).toBe(false);
    expect(sw.cachedPaths()).toHaveLength(0);
  });

  it("cacht Illustrationen und Build-Assets, aber keine unbekannten Pfade", async () => {
    const sw = boot(createNetwork());
    for (const path of ["/_next/static/chunks/main.js", "/m/uav/illustrations/drohne.svg", "/pwa-icon.svg", "/manifest.webmanifest"]) {
      const event = sw.dispatch("fetch", subresource(path));
      await event.response;
      await sw.drain(event);
    }
    const unbekannt = sw.dispatch("fetch", subresource("/etwas-fremdes.json"));
    await sw.drain(unbekannt);

    expect(sw.cachedPaths()).toEqual(
      expect.arrayContaining([
        "/_next/static/chunks/main.js",
        "/m/uav/illustrations/drohne.svg",
        "/pwa-icon.svg",
        "/manifest.webmanifest",
      ]),
    );
    expect(unbekannt.responded).toBe(false);
  });
});
