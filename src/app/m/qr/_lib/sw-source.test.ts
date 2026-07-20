import { describe, it, expect, vi } from "vitest";
import { SW_SOURCE } from "@/app/m/qr/_lib/sw-source";

/**
 * Der Service Worker ist ausgelieferter Quelltext, kein importierbares Modul.
 * Damit sein Caching-Verhalten pruefbar wird, laeuft er hier in einer
 * nachgebauten Worker-Umgebung: `self`, `caches` und `fetch` werden als
 * Parameter uebergeben und verdecken die echten Globals.
 */

const ORIGIN = "https://qr.example.org";

/** Marker, der eingeloggt in der Client-Payload von "/" steht — bei einem
 *  WLAN-Preset genau so wie das echte Passwort. */
const PRESET_SECRET = "geheimes-wlan-passwort";
const AUTH_HTML = `<html><body>Schnellzugriffe ${PRESET_SECRET}</body></html>`;
const ANON_HTML = "<html><body>Anmelden, um persoenliche Schnellzugriffe zu sehen.</body></html>";

type FetchInit = { credentials?: string } | undefined;

/** Nur das, was der Worker vom Request liest. */
interface SwRequest {
  url: string;
  method: string;
  mode: string;
}

function createCacheStorage() {
  const caches = new Map<string, Map<string, Response>>();
  const keyOf = (req: SwRequest | string) =>
    typeof req === "string" ? new URL(req, ORIGIN).href : req.url;

  const open = (name: string) => {
    let store = caches.get(name);
    if (!store) {
      store = new Map();
      caches.set(name, store);
    }
    const s = store;
    return Promise.resolve({
      put: (req: SwRequest | string, res: Response) => {
        s.set(keyOf(req), res);
        return Promise.resolve();
      },
      match: (req: SwRequest | string) => Promise.resolve(s.get(keyOf(req))),
      keys: () => Promise.resolve([...s.keys()]),
    });
  };

  return {
    api: {
      open,
      keys: () => Promise.resolve([...caches.keys()]),
      delete: (name: string) => Promise.resolve(caches.delete(name)),
    },
    /** Pfade, die tatsaechlich im Cache liegen — die Zusage des Moduls. */
    cachedPaths: () =>
      [...(caches.get("qr-pwa-v2") ?? new Map()).keys()].map((u) => new URL(u).pathname),
    body: async (path: string) => {
      const res = caches.get("qr-pwa-v2")?.get(new URL(path, ORIGIN).href);
      return res ? await res.clone().text() : null;
    },
    cacheNames: () => [...caches.keys()],
    /** Simuliert den Altbestand eines frueheren Workers auf dem Geraet. */
    seed: (name: string, path: string, body: string) =>
      open(name).then((c) => c.put(new URL(path, ORIGIN).href, new Response(body))),
  };
}

/** Netz-Attrappe: "/" antwortet personalisiert, sobald Cookies mitgehen. */
function createNetwork(opts: { offline?: boolean } = {}) {
  return vi.fn(async (input: SwRequest | string, init?: FetchInit) => {
    if (opts.offline) throw new TypeError("Failed to fetch");
    const url = new URL(typeof input === "string" ? input : input.url, ORIGIN);
    if (url.pathname === "/") {
      const anonymous = init?.credentials === "omit";
      return new Response(anonymous ? ANON_HTML : AUTH_HTML, { status: 200 });
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

function boot(
  fetchImpl: ReturnType<typeof createNetwork>,
  cacheStorage = createCacheStorage(),
) {
  const listeners = new Map<string, (e: FakeEvent) => void>();
  const self = {
    addEventListener: (type: string, fn: (e: FakeEvent) => void) => listeners.set(type, fn),
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
    location: { origin: ORIGIN },
  };

  // SW_SOURCE ist eine Konstante aus diesem Repo, nichts wird hineininterpoliert
  // — der einzige Weg, den ausgelieferten Quelltext wirklich auszufuehren.
  new Function("self", "caches", "fetch", SW_SOURCE)(self, cacheStorage.api, fetchImpl);

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

  /** Wartet ab, was der Worker am Event-Lebenszyklus haengen hat — nur das
   *  ueberlebt laut Spezifikation die Auslieferung der Antwort. */
  const drain = (e: FakeEvent) => Promise.all(e.waited);

  return { dispatch, drain, ...cacheStorage };
}

// `new Request(..., { mode: "navigate" })` verbietet die Spezifikation — solche
// Requests erzeugt nur der Browser. Fuer den Worker zaehlen ohnehin nur url,
// method und mode.
function navigation(path: string): SwRequest {
  return { url: new URL(path, ORIGIN).href, method: "GET", mode: "navigate" };
}

function subresource(path: string): SwRequest {
  return { url: new URL(path, ORIGIN).href, method: "GET", mode: "cors" };
}

describe("Service Worker: was im Cache landen darf", () => {
  it("legt bei einer eingeloggten Navigation nicht die personalisierte Seite ab, sondern die anonyme", async () => {
    const net = createNetwork();
    const sw = boot(net);

    const event = sw.dispatch("fetch", navigation("/"));
    const delivered = await event.response;
    await sw.drain(event);

    // Der Nutzer bekommt seine Seite ...
    expect(await delivered!.text()).toContain(PRESET_SECRET);
    // ... im Cache liegt aber die Fassung ohne Cookies.
    const cached = await sw.body("/");
    expect(cached).not.toContain(PRESET_SECRET);
    expect(cached).toBe(ANON_HTML);
  });

  it("holt die Offline-Fassung von \"/\" ohne Cookies", async () => {
    const net = createNetwork();
    const sw = boot(net);

    const event = sw.dispatch("fetch", navigation("/"));
    await sw.drain(event);

    const shellCalls = net.mock.calls.filter(
      ([input]) => new URL(typeof input === "string" ? input : input.url, ORIGIN).pathname === "/",
    );
    const cacheFill = shellCalls.filter(([, init]) => init?.credentials === "omit");
    expect(cacheFill).toHaveLength(1);
  });

  it("haengt den Cache-Write an event.waitUntil — sonst darf der Browser ihn verwerfen", async () => {
    const net = createNetwork();
    const sw = boot(net);

    const event = sw.dispatch("fetch", navigation("/"));
    await event.response;

    // Sobald die Antwort steht, darf der Browser den Worker beenden — alles,
    // was nicht an waitUntil haengt, laeuft dann nicht mehr zu Ende. Der Write
    // muss also am Event haengen, nicht frei im Raum stehen.
    expect(event.waited).toHaveLength(1);

    await sw.drain(event);
    expect(await sw.body("/")).toBe(ANON_HTML);
  });

  it("cacht auch beim Install nur die anonyme Fassung", async () => {
    const net = createNetwork();
    const sw = boot(net);

    const event = sw.dispatch("install", navigation("/"));
    await sw.drain(event);

    expect(await sw.body("/")).toBe(ANON_HTML);
    expect(net).toHaveBeenCalledWith("/", { credentials: "omit" });
  });

  it("cacht die RSC-Antwort einer Soft-Navigation nicht — sie traegt dieselben Preset-Daten", async () => {
    const net = createNetwork();
    const sw = boot(net);

    const event = sw.dispatch("fetch", subresource("/?_rsc=1a2b3c"));
    await sw.drain(event);

    expect(event.responded).toBe(false);
    expect(sw.cachedPaths()).toHaveLength(0);
  });

  it("cacht den Admin-Bereich und die API nicht", async () => {
    const net = createNetwork();
    const sw = boot(net);

    for (const path of ["/admin", "/api/presets"]) {
      const event = sw.dispatch("fetch", subresource(path));
      await sw.drain(event);
      expect(event.responded).toBe(false);
    }
    expect(sw.cachedPaths()).toHaveLength(0);
  });

  it("cacht die Build-Assets weiterhin — ohne sie gaebe es kein Offline", async () => {
    const net = createNetwork();
    const sw = boot(net);

    for (const path of ["/_next/static/chunks/main.js", "/pwa-icon.svg", "/manifest.webmanifest"]) {
      const event = sw.dispatch("fetch", subresource(path));
      await event.response;
      await sw.drain(event);
    }

    expect(sw.cachedPaths()).toEqual([
      "/_next/static/chunks/main.js",
      "/pwa-icon.svg",
      "/manifest.webmanifest",
    ]);
  });

  it("raeumt beim Upgrade den Cache des alten Workers ab", async () => {
    // Geraete, die den fehlerhaften Worker hatten, tragen unter dem alten
    // Cache-Namen womoeglich die eingeloggte Startseite. Der Upgrade muss den
    // Altbestand loeschen und darf sich nicht darauf verlassen, dass ihn der
    // naechste Write ueberschreibt.
    const storage = createCacheStorage();
    await storage.seed("qr-pwa-v1", "/", AUTH_HTML);
    const sw = boot(createNetwork(), storage);

    await sw.drain(sw.dispatch("activate", navigation("/")));

    expect(sw.cacheNames()).not.toContain("qr-pwa-v1");
  });

  it("liefert offline die anonyme Startseite aus dem Cache", async () => {
    const storage = createCacheStorage();
    const online = boot(createNetwork(), storage);
    await online.drain(online.dispatch("install", navigation("/")));

    // Derselbe Cache, aber das Netz ist weg.
    const offline = boot(createNetwork({ offline: true }), storage);
    const event = offline.dispatch("fetch", navigation("/"));
    const res = await event.response;
    await offline.drain(event);

    expect(await res!.clone().text()).toBe(ANON_HTML);
  });
});
