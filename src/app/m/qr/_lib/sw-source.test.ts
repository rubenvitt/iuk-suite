import { describe, it, expect, vi } from "vitest";
import { SW_SOURCE } from "@/app/m/qr/_lib/sw-source";

/**
 * Der Service Worker ist ausgelieferter Quelltext, kein importierbares Modul.
 * Damit sein Caching-Verhalten pruefbar wird, laeuft er hier in einer
 * nachgebauten Worker-Umgebung: `self`, `caches` und `fetch` werden als
 * Parameter uebergeben und verdecken die echten Globals.
 */

const ORIGIN = "https://qr.example.org";

/**
 * Die Shell-Routen aus `sw-source.ts`. Bewusst dupliziert statt importiert — der
 * Worker liegt als Quelltext-String vor, und eine hier vergessene Route soll
 * auffallen statt stillschweigend mitzuwandern.
 */
const SHELL_ROUTES = ["/", "/qr", "/wifi", "/tel", "/contact"];

/** Marker, der eingeloggt in der Client-Payload von "/" steht — bei einem
 *  WLAN-Preset genau so wie das echte Passwort. */
const PRESET_SECRET = "geheimes-wlan-passwort";

/** Das gemeinsame Buendel beider Seiten. */
const SHARED_CHUNK = "/_next/static/chunks/shared.js";
/**
 * Das Buendel, das NUR die Anzeige-Route laedt. Genau so eines gibt es im
 * Prod-Build (nachgemessen: ein Chunk, den "/" nicht referenziert) — und genau
 * daran scheiterte die Offline-Erzeugung, solange der Worker nur HTML cachte.
 */
const QR_CHUNK = "/_next/static/chunks/qr-view.js";
/**
 * Das Buendel der drei Eingabeformulare. Alle drei teilen es sich — dieselbe
 * Lage wie im Prod-Build und zugleich die schaerfere Probe fuer die
 * Doppelabruf-Vorpruefung in `cacheReferencedAssets`.
 */
const FORM_CHUNK = "/_next/static/chunks/forms.js";

const scripts = (...srcs: string[]) =>
  srcs.map((s) => `<script src="${s}"></script>`).join("");

const AUTH_HTML = `<html><body>${scripts(SHARED_CHUNK)}Schnellzugriffe ${PRESET_SECRET}</body></html>`;
const ANON_HTML = `<html><body>${scripts(SHARED_CHUNK)}Anmelden, um persoenliche Schnellzugriffe zu sehen.</body></html>`;
/**
 * Das Bruchstueck eines Pfades am Ende eines Flight-Bloecks.
 *
 * Next verteilt den eingebetteten Payload auf mehrere
 * `self.__next_f.push(...)`-Bloecke. Seit das Modul die antd-Stile mitliefert,
 * ist das HTML gross genug, dass eine Trennstelle MITTEN in einen Asset-Pfad
 * faellt — im Prod-Build nachgemessen, drei Stueck ueber die fuenf
 * Shell-Routen. Das Bruchstueck sieht wie ein Pfad aus, ist aber ein 404.
 */
const TRUNCATED_CHUNK = "/_next/static/chunks/qr-vi";
const TRUNCATED_PUSH = `<script>self.__next_f.push([1,"b:[\\"${TRUNCATED_CHUNK}"])</script>`;

/**
 * Die Anzeige-Route. Query-los, weil sie ihre Parameter clientseitig liest.
 *
 * Der zweite, maskierte Vorkommen von QR_CHUNK bildet Next' eingebetteten
 * Flight-Payload nach: dort steht derselbe Pfad in einem JSON-String, also mit
 * \\" statt ". Trennt der Worker nur an Anfuehrungszeichen, klebt der Backslash
 * am Pfad und der Abruf ginge ins Leere.
 */
const QR_HTML = `<html><body>${scripts(SHARED_CHUNK, QR_CHUNK)}qr-view-shell<script>self.__next_f.push([1,"a:{\\"src\\":\\"${QR_CHUNK}\\"}"])</script>${TRUNCATED_PUSH}</body></html>`;

/**
 * Die drei Eingabeformulare, die die Startseite verlinkt (page.tsx, KINDS).
 * Ohne sie im Cache landete der Nutzer offline beim Antippen der Kachel "WLAN"
 * stumm wieder auf der Startseite.
 */
const FORM_HTML: Record<string, string> = {
  "/wifi": `<html><body>${scripts(SHARED_CHUNK, FORM_CHUNK)}wifi-form-shell</body></html>`,
  "/tel": `<html><body>${scripts(SHARED_CHUNK, FORM_CHUNK)}tel-form-shell</body></html>`,
  "/contact": `<html><body>${scripts(SHARED_CHUNK, FORM_CHUNK)}contact-form-shell</body></html>`,
};

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
    if (url.pathname === "/qr") return new Response(QR_HTML, { status: 200 });
    const form = FORM_HTML[url.pathname];
    if (form) return new Response(form, { status: 200 });
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

  it("legt jede Shell-Route ab, nicht nur die Startseite", async () => {
    const sw = boot(createNetwork());
    await sw.drain(sw.dispatch("install", navigation("/")));

    for (const path of SHELL_ROUTES) expect(sw.cachedPaths()).toContain(path);
    expect(await sw.body("/qr")).toBe(QR_HTML);
  });

  it("zieht die Build-Buendel nach, die die Shell-Seiten referenzieren", async () => {
    // Ohne das haengt die Offline-Zusage an einem Rennen: das JS-Buendel der
    // Anzeige-Route holt der Browser sonst erst beim Betreten: bricht das Netz
    // vorher weg, fehlt genau das, und der Nutzer sieht Next' Fehlerseite statt
    // seines Codes. Nach dem Install muss alles Noetige beisammen sein.
    const sw = boot(createNetwork());
    await sw.drain(sw.dispatch("install", navigation("/")));

    expect(sw.cachedPaths()).toContain(SHARED_CHUNK);
    expect(sw.cachedPaths()).toContain(QR_CHUNK);
  });

  it("holt genau die referenzierten Buendel — jedes einmal, keines verstuemmelt", async () => {
    // Zwei Zusagen in einer Messung, beide an derselben Stelle im Worker:
    //
    // - Jede Datei nur einmal. Alle fuenf Shell-Seiten laden SHARED_CHUNK, die
    //   drei Formulare zusaetzlich FORM_CHUNK; ohne die Vorpruefung im Cache
    //   zoege der Install beide mehrfach ueber die Leitung.
    // - Keine verstuemmelten Pfade. Die Anzeige-Route nennt ihr Buendel ein
    //   zweites Mal im Flight-Payload, dort mit maskierten Anfuehrungszeichen.
    //   Trennt der Worker nur an ", bleibt ein Backslash am Pfad kleben und der
    //   Abruf ginge ins Leere — ein Fehlschlag, den das stille .catch schluckt.
    const net = createNetwork();
    const sw = boot(net);
    await sw.drain(sw.dispatch("install", navigation("/")));

    const fetched = net.mock.calls
      .map(([input]) => new URL(typeof input === "string" ? input : input.url, ORIGIN).pathname)
      .filter((p) => p.startsWith("/_next/static/"));

    expect(fetched.sort()).toEqual([QR_CHUNK, SHARED_CHUNK, FORM_CHUNK].sort());
  });

  it("ruft ein am Blockende abgeschnittenes Pfad-Bruchstueck gar nicht erst ab", async () => {
    // Der Fall, der den Worker beim antd-Umbau dauerhaft im Zustand
    // "installing" haengen liess: Next verteilt den Flight-Payload auf mehrere
    // Bloecke, und seit das HTML die antd-Stile mittraegt, faellt eine
    // Trennstelle mitten in einen Asset-Pfad. Das Bruchstueck ist ein 404 —
    // ueberfluessige Last im Einsatz und, ohne die Body-Freigabe unten, toedlich.
    const net = createNetwork();
    const sw = boot(net);
    await sw.drain(sw.dispatch("install", navigation("/")));

    const fetched = net.mock.calls.map(([input]) =>
      new URL(typeof input === "string" ? input : input.url, ORIGIN).pathname,
    );

    expect(fetched).not.toContain(TRUNCATED_CHUNK);
  });

  it("verwirft den Body einer Fehlantwort, statt ihn offen liegen zu lassen", async () => {
    // Die Zusage, an der die gesamte Offline-Faehigkeit haengt. Im Prod-Build
    // gemessen: laesst der Worker den Body einer 404-Antwort ungelesen liegen,
    // kommt nach wenigen solchen Antworten KEIN weiterer `fetch` des Workers
    // mehr zurueck. Der install-Handler laeuft nie zu Ende, der Worker bleibt
    // dauerhaft "installing", `navigator.serviceWorker.ready` loest nie auf —
    // es gibt schlicht keine PWA, ohne eine einzige Fehlermeldung.
    //
    // Das ist kein Sonderfall: nach einem Redeploy zeigt gecachtes HTML auf
    // Buendel-Hashes, die es nicht mehr gibt. 404 ist in diesem Entwurf ein
    // vorgesehener Zustand (siehe SHELL_MAX_AGE_MS) — ohne die Freigabe machte
    // ausgerechnet der Selbstheilungspfad den Worker unbrauchbar.
    const MISSING_CHUNK = "/_next/static/chunks/nach-deploy-weg.js";
    const missing = new Response("weg", { status: 404 });
    const cancelled = vi.spyOn(missing.body!, "cancel");
    // Nur "/" verweist auf das verschwundene Buendel — die uebrigen Fixtures
    // bleiben unangetastet, damit die Mengen-Zusage oben weiter misst, was sie
    // gemessen hat.
    const HOME_HTML = `<html><body>${scripts(SHARED_CHUNK, MISSING_CHUNK)}Anmelden</body></html>`;

    const net = vi.fn(async (input: SwRequest | string, init?: FetchInit) => {
      const url = new URL(typeof input === "string" ? input : input.url, ORIGIN);
      if (url.pathname === MISSING_CHUNK) return missing;
      if (url.pathname === "/") {
        return new Response(init?.credentials === "omit" ? HOME_HTML : AUTH_HTML, { status: 200 });
      }
      if (url.pathname === "/qr") return new Response(QR_HTML, { status: 200 });
      const form = FORM_HTML[url.pathname];
      if (form) return new Response(form, { status: 200 });
      return new Response(`asset:${url.pathname}`, { status: 200 });
    });

    const sw = boot(net);
    await sw.drain(sw.dispatch("install", navigation("/")));

    expect(cancelled).toHaveBeenCalled();
    // Und die Gegenprobe, dass der Install trotz der Fehlantwort durchlief:
    // alle fuenf Shell-Routen liegen im Cache.
    expect(sw.cachedPaths()).toEqual(expect.arrayContaining(SHELL_ROUTES));
  });

  it("beantwortet eine Offline-Navigation nach /qr mit der Anzeige, nicht mit der Startseite", async () => {
    // Die Zusage, an der das ganze Modul haengt: offline einen Code erzeugen.
    // Antwortet der Worker pauschal aus NAV_FALLBACK, steht die Adresszeile auf
    // /qr?data=… und gerendert wird das leere Eingabeformular — kein Fehler,
    // kein Hinweis, nur kein QR-Code.
    const storage = createCacheStorage();
    const online = boot(createNetwork(), storage);
    await online.drain(online.dispatch("install", navigation("/")));

    const offline = boot(createNetwork({ offline: true }), storage);
    const event = offline.dispatch("fetch", navigation("/qr?data=https%3A%2F%2Fdrk.de&kind=url"));
    const res = await event.response;
    await offline.drain(event);

    expect(await res!.clone().text()).toBe(QR_HTML);
  });

  // Die Startseite verlinkt /wifi, /tel und /contact (page.tsx, KINDS). Lagen
  // sie nicht im Cache, lieferte der Worker offline NAV_FALLBACK aus: die
  // Adresszeile stand auf /wifi, gerendert wurde die Startseite — kein Fehler,
  // kein Hinweis, nur kein Formular. Drei der vier QR-Typen waren damit offline
  // nicht erzeugbar, WLAN als der haeufigste zuerst.
  it.each(["/wifi", "/tel", "/contact"])(
    "beantwortet eine Offline-Navigation nach %s mit dem Formular, nicht mit der Startseite",
    async (path) => {
      const storage = createCacheStorage();
      const online = boot(createNetwork(), storage);
      await online.drain(online.dispatch("install", navigation("/")));

      const offline = boot(createNetwork({ offline: true }), storage);
      const event = offline.dispatch("fetch", navigation(path));
      const res = await event.response;
      await offline.drain(event);

      expect(await res!.clone().text()).toBe(FORM_HTML[path]);
    },
  );

  it("zieht auch die Buendel der Formularrouten nach", async () => {
    // Das blosse Nachtragen der Dokumente genuegt: cacheReferencedAssets scannt
    // das HTML jeder Shell-Route. Ohne diese Zusicherung laege das Formular
    // offline zwar als HTML bereit, haette aber kein JS zum Hydrieren.
    const sw = boot(createNetwork());
    await sw.drain(sw.dispatch("install", navigation("/")));

    expect(sw.cachedPaths()).toContain(FORM_CHUNK);
  });

  it("faellt bei einer unbekannten Route offline weiter auf die Startseite zurueck", async () => {
    // Der pfadgenaue Treffer darf den Rueckfall nicht ersetzen: /gibtsnicht
    // liegt nicht im Cache, und eine leere Antwort waere schlechter als der
    // Einstieg. Bewusst eine Route, die es im Modul nicht gibt — /wifi stand
    // hier frueher und zementierte damit genau den Fehler als gewolltes
    // Verhalten.
    const storage = createCacheStorage();
    const online = boot(createNetwork(), storage);
    await online.drain(online.dispatch("install", navigation("/")));

    const offline = boot(createNetwork({ offline: true }), storage);
    const event = offline.dispatch("fetch", navigation("/gibtsnicht"));
    const res = await event.response;
    await offline.drain(event);

    expect(await res!.clone().text()).toBe(ANON_HTML);
  });

  it("holt die Shell bei rasch aufeinanderfolgenden Navigationen nur einmal", async () => {
    // Der Refresh haengt am navigate-Zweig, weil sich `sw.js` bei einem
    // Redeploy nicht aendert und der install-Handler deshalb nie wieder laeuft.
    // Ungedrosselt kostet das je Navigation einen Abruf PRO Shell-Route — mit
    // fuenf Routen fuenf Dokumente, bei jedem Seitenwechsel.
    const net = createNetwork();
    const sw = boot(net);

    for (const path of ["/", "/qr"]) {
      const event = sw.dispatch("fetch", navigation(path));
      await event.response;
      await sw.drain(event);
    }

    const shellFetches = net.mock.calls.filter(([, init]) => init?.credentials === "omit");
    expect(shellFetches).toHaveLength(SHELL_ROUTES.length);
  });
});
