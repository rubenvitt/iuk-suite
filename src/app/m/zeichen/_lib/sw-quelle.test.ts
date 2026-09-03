import { describe, it, expect, vi } from "vitest";
import { ZEICHEN_SW_QUELLE } from "./sw-quelle";

/**
 * Der Service Worker ist ausgelieferter Quelltext, kein importierbares Modul.
 * Damit sein Verhalten pruefbar wird, laeuft er hier in einer nachgebauten
 * Worker-Umgebung: `self`, `caches`, `fetch` und `indexedDB` werden als
 * Parameter uebergeben und verdecken die echten Globals (Muster
 * `qr/_lib/sw-source.test.ts`).
 */

const ORIGIN = "https://zeichen.example.org";
const CACHE = "zeichen-pwa-v1";

/** Die Shell-Route aus `sw-quelle.ts`. Bewusst dupliziert statt importiert —
 *  eine hier vergessene Aenderung soll auffallen statt mitzuwandern. */
const OFFLINE = "/offline";

const GETEILT = "/_next/static/chunks/geteilt.a1b2c3.js";
const KATALOG_CHUNK = "/_next/static/chunks/katalog.d4e5f6.js";
const ARIMO = "/_next/static/media/arimo.9f8e7d.woff2";

const OFFLINE_HTML =
  `<html><body>` +
  `<script src="${GETEILT}"></script><script src="${KATALOG_CHUNK}"></script>` +
  `<link rel="preload" href="${ARIMO}" as="font">` +
  `Offline kannst du alle Zeichen nachschlagen.</body></html>`;

/**
 * Dieselbe Flaeche, aber unter `SuiteRahmen` gerendert. GEMESSEN (M17.3): jede
 * Seite unter der Suite-Huelle traegt Klarnamen und die gruppenabhaengige
 * App-Liste im Flight-Payload — zwei Personen, dieselbe URL: 281.170 vs.
 * 279.159 B. Genau das darf nie in den Cache.
 */
const PERSONALISIERTES_HTML =
  `<html><body><script src="${GETEILT}"></script>` +
  `<script>self.__next_f.push([1,"{\\"userName\\":\\"Ruben\\",\\"angemeldet\\":true}"])</script>` +
  `</body></html>`;

const LOGIN_HTML = `<html><body>Anmelden</body></html>`;
const MANIFEST = `{"name":"Taktische Zeichen","start_url":"/offline"}`;
const ICON = `<svg xmlns="http://www.w3.org/2000/svg"></svg>`;

interface SwRequest {
  url: string;
  method: string;
  mode: string;
}

/**
 * Eine Antwort mit gesetztem `url` und `redirected` — beides ist bei einem
 * frisch konstruierten `Response` leer bzw. false, und genau diese zwei Felder
 * traegt der Riegel des Workers. `Object.defineProperty` beschattet die Getter
 * des Prototyps; ohne das koennte dieser Test die gefaehrlichste Lage gar nicht
 * nachstellen.
 */
function antwort(
  koerper: string,
  opt: { status?: number; url: string; redirected?: boolean },
): Response {
  const res = new Response(koerper, { status: opt.status ?? 200 });
  Object.defineProperty(res, "url", { value: new URL(opt.url, ORIGIN).href });
  Object.defineProperty(res, "redirected", { value: opt.redirected ?? false });
  return res;
}

function baueCacheSpeicher() {
  const caches = new Map<string, Map<string, Response>>();
  /** Die Reihenfolge der Schreibvorgaenge — die Zusage „Buendel vor HTML". */
  const putReihenfolge: string[] = [];
  const keyOf = (req: SwRequest | string) =>
    typeof req === "string" ? new URL(req, ORIGIN).href : req.url;

  const open = (name: string) => {
    let speicher = caches.get(name);
    if (!speicher) {
      speicher = new Map();
      caches.set(name, speicher);
    }
    const s = speicher;
    return Promise.resolve({
      put: (req: SwRequest | string, res: Response) => {
        s.set(keyOf(req), res);
        putReihenfolge.push(new URL(keyOf(req)).pathname);
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
    putReihenfolge,
    cachedPaths: () =>
      [...(caches.get(CACHE) ?? new Map()).keys()].map((u) => new URL(u).pathname),
    body: async (pfad: string) => {
      const res = caches.get(CACHE)?.get(new URL(pfad, ORIGIN).href);
      return res ? await res.clone().text() : null;
    },
    cacheNames: () => [...caches.keys()],
  };
}

/** Minimal-Attrappe: der Worker ruft ausschliesslich `deleteDatabase`. */
function baueIndexedDb() {
  const geloescht: string[] = [];
  return {
    geloescht,
    api: {
      deleteDatabase(name: string) {
        geloescht.push(name);
        const anfrage: Record<string, unknown> = {
          onsuccess: null,
          onerror: null,
          onblocked: null,
        };
        queueMicrotask(() => (anfrage.onsuccess as (() => void) | null)?.());
        return anfrage;
      },
    },
  };
}

function netz(
  opt: {
    offline?: boolean;
    abgelaufen?: boolean;
    manifestUmgeleitet?: boolean;
    personalisiert?: boolean;
    fehlenderChunk?: string;
    fehlantwort?: Response;
  } = {},
) {
  return vi.fn(async (eingabe: SwRequest | string) => {
    if (opt.offline) throw new TypeError("Failed to fetch");
    const pfad = new URL(typeof eingabe === "string" ? eingabe : eingabe.url, ORIGIN).pathname;

    // Der gemessene Kern (M17.1/M17.2): ein auth-pflichtiger Host beantwortet
    // JEDEN Pfad ohne Sitzung mit 307 -> /login, und `fetch` FOLGT dem — die
    // Antwort kommt mit status 200, ok true, redirected true zurueck.
    if (opt.abgelaufen) {
      return antwort(LOGIN_HTML, { url: "/login", redirected: true });
    }
    if (opt.fehlenderChunk && pfad === opt.fehlenderChunk) return opt.fehlantwort!;
    if (pfad === OFFLINE) {
      return antwort(opt.personalisiert ? PERSONALISIERTES_HTML : OFFLINE_HTML, { url: OFFLINE });
    }
    if (pfad === "/manifest.webmanifest") {
      return opt.manifestUmgeleitet
        ? antwort(LOGIN_HTML, { url: "/login", redirected: true })
        : antwort(MANIFEST, { url: pfad });
    }
    if (pfad === "/pwa-icon.svg") return antwort(ICON, { url: pfad });
    return antwort(`asset:${pfad}`, { url: pfad });
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
  fetchImpl: ReturnType<typeof netz>,
  speicher = baueCacheSpeicher(),
  idb = baueIndexedDb(),
) {
  const listeners = new Map<string, (e: FakeEvent) => void>();
  const self = {
    addEventListener: (typ: string, fn: (e: FakeEvent) => void) => listeners.set(typ, fn),
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
    location: { origin: ORIGIN },
  };

  // ZEICHEN_SW_QUELLE ist eine Konstante aus diesem Repo, nichts wird
  // hineininterpoliert — der einzige Weg, den ausgelieferten Quelltext wirklich
  // auszufuehren.
  new Function("self", "caches", "fetch", "indexedDB", ZEICHEN_SW_QUELLE)(
    self,
    speicher.api,
    fetchImpl,
    idb.api,
  );

  function dispatch(typ: string, request: SwRequest): FakeEvent {
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
    listeners.get(typ)?.(event);
    return event;
  }

  const drain = (e: FakeEvent) => Promise.all(e.waited);
  return { dispatch, drain, idb, ...speicher };
}

// `new Request(..., { mode: "navigate" })` verbietet die Spezifikation — solche
// Requests erzeugt nur der Browser.
const navigation = (pfad: string): SwRequest => ({
  url: new URL(pfad, ORIGIN).href,
  method: "GET",
  mode: "navigate",
});
const unterressource = (pfad: string): SwRequest => ({
  url: new URL(pfad, ORIGIN).href,
  method: "GET",
  mode: "cors",
});
const post = (pfad: string): SwRequest => ({
  url: new URL(pfad, ORIGIN).href,
  method: "POST",
  mode: "cors",
});

describe("Service Worker zeichen", () => {
  it("cacht keine weitergeleitete Antwort", async () => {
    /*
     * DIE GEFAEHRLICHSTE LAGE, und ohne diesen Fall sieht der Test sie nicht:
     * die Netzattrappe liefert {ok:true, redirected:true, url:'…/login'} — genau
     * das, was `fetch` aus dem gemessenen 307 macht (M17.2). `cache.put` GELINGT
     * damit, und im Cache laege die Anmeldeseite unter dem Offline-Schluessel.
     * Der Waechter `if (!res.ok)` aus qr/uav faengt das NICHT.
     */
    const sw = boot(netz({ abgelaufen: true }));
    await sw.drain(sw.dispatch("install", navigation("/")));

    expect(sw.cachedPaths()).not.toContain(OFFLINE);
    expect(await sw.body(OFFLINE)).toBeNull();
    expect(sw.cachedPaths()).toEqual([]);
  });

  it("cacht auch kein weitergeleitetes Manifest", async () => {
    // Der Riegel gilt fuer ASSETS genauso wie fuer HTML. qr und uav holen
    // Manifest und Icon cache-first ohne ihn; hier brennte sich sonst
    // Login-HTML dauerhaft als Manifest ein — und ein Manifest wird nie wieder
    // revalidiert, solange der Cache-Name gleich bleibt.
    const sw = boot(netz({ manifestUmgeleitet: true }));
    await sw.drain(sw.dispatch("install", navigation("/")));

    expect(sw.cachedPaths()).toContain(OFFLINE);
    expect(sw.cachedPaths()).not.toContain("/manifest.webmanifest");
    expect(sw.cachedPaths()).toContain("/pwa-icon.svg");
  });

  it("cacht auch zur LAUFZEIT kein weitergeleitetes Asset", async () => {
    /*
     * REPARATUR 2 GILT AUF BEIDEN PFADEN, UND DER FALL DANEBEN SIEHT NUR EINEN.
     * Der Precache-Zweig laeuft ueber `holeGeprueft` und traegt den Riegel; der
     * Laufzeitzweig des `fetch`-Handlers holt bei einem Cache-FEHLTREFFER
     * selbst nach. `isCacheableAsset` laesst dort `/manifest.webmanifest` und
     * `/pwa-icon.svg` durch — und die beiden stehen NICHT in `PASSTHROUGH`,
     * kommen bei abgelaufener Sitzung also als {ok:true, redirected:true,
     * url:/login} zurueck. Ein `if (res.ok)` allein ist genau der Waechter, den
     * der Kopf dieser Datei als unzureichend beschreibt.
     *
     * ERREICHBAR ist die Lage ueber Cache-Fehltreffer PLUS abgelaufene Sitzung
     * — etwa unmittelbar nach dem Loeschknopf, der die Caches leert, waehrend
     * der Worker weiterlaeuft. Dann braennte sich Login-HTML unter dem
     * Manifest-Schluessel ein: cache-first, nie revalidiert, solange der
     * Cache-Name gleich bleibt.
     *
     * ⛔ DIESER TEST VERSCHICKT EIN `fetch`-EREIGNIS, KEIN `install`. Der Fall
     * „cacht auch kein weitergeleitetes Manifest" verschickt nur `install` und
     * bliebe hier gruen — er hat den Laufzeitzweig nie ausgeloest.
     */
    const sw = boot(netz({ abgelaufen: true }));
    const event = sw.dispatch("fetch", unterressource("/manifest.webmanifest"));
    const res = await event.response;
    await sw.drain(event);

    // Die Antwort geht unveraendert an die Seite — nur in den Cache darf sie nicht.
    expect(event.responded).toBe(true);
    expect(await res!.clone().text()).toBe(LOGIN_HTML);
    expect(sw.cachedPaths()).toEqual([]);
  });

  it("cacht ein Asset zur Laufzeit, wenn es wirklich von seinem Pfad kommt", async () => {
    // GEGENPROBE zum Fall darueber, und sie ist nicht Kosmetik: ein Riegel, der
    // ALLES ablehnt, waere dort ebenfalls gruen — und die PWA haette keinen
    // Laufzeitcache mehr, ohne dass ein Test es meldet.
    const sw = boot(netz());
    const event = sw.dispatch("fetch", unterressource("/pwa-icon.svg"));
    await event.response;
    await sw.drain(event);

    expect(sw.cachedPaths()).toContain("/pwa-icon.svg");
  });

  it("cacht kein HTML mit userName", async () => {
    // Der Inhaltsriegel. GEMESSEN (M17.3): jede Seite unter `SuiteRahmen`
    // traegt {"userName":"…","angemeldet":true} im Flight-Payload. Auf einem
    // geteilten Tablet waere das der Name der vorigen Person, offline abrufbar.
    const sw = boot(netz({ personalisiert: true }));
    await sw.drain(sw.dispatch("install", navigation("/")));

    expect(sw.cachedPaths()).not.toContain(OFFLINE);
    for (const pfad of sw.cachedPaths()) expect(pfad).not.toBe(OFFLINE);
  });

  it("legt die Buendel vor dem HTML ab", async () => {
    /*
     * Umgekehrt hinterliesze ein Deploy am Netzrand ein gecachtes HTML, dessen
     * Chunk-Hashes es nicht mehr gibt: offline kaputt, ohne Fehlermeldung. Die
     * Reihenfolge ist die Zusage, nicht die Menge.
     */
    const sw = boot(netz());
    await sw.drain(sw.dispatch("install", navigation("/")));

    const htmlPlatz = sw.putReihenfolge.indexOf(OFFLINE);
    expect(htmlPlatz).toBeGreaterThan(-1);
    for (const asset of [GETEILT, KATALOG_CHUNK, ARIMO]) {
      expect(sw.putReihenfolge.indexOf(asset), asset).toBeGreaterThan(-1);
      expect(sw.putReihenfolge.indexOf(asset), asset).toBeLessThan(htmlPlatz);
    }
  });

  it("gibt jeden gelesenen Body frei", async () => {
    /*
     * Die Zusage, an der die gesamte Offline-Faehigkeit haengt. Im Prod-Build
     * gemessen (qr/_lib/sw-source.ts): laesst der Worker den Body einer
     * 404 ungelesen liegen, kommt nach DREI solchen Antworten kein weiterer
     * `fetch` des Workers mehr zurueck. Der install-Handler laeuft nie zu Ende,
     * der Worker bleibt dauerhaft "installing", `navigator.serviceWorker.ready`
     * loest nie auf — es gibt schlicht keine PWA, ohne eine Fehlermeldung.
     * 404 ist hier ein VORGESEHENER Fall: nach einem Redeploy zeigt gecachtes
     * HTML auf Buendel-Hashes, die es nicht mehr gibt.
     */
    const fehlt = new Response("weg", { status: 404 });
    Object.defineProperty(fehlt, "url", { value: new URL(KATALOG_CHUNK, ORIGIN).href });
    const abgebrochen = vi.spyOn(fehlt.body!, "cancel");

    const sw = boot(netz({ fehlenderChunk: KATALOG_CHUNK, fehlantwort: fehlt }));
    await sw.drain(sw.dispatch("install", navigation("/")));

    expect(abgebrochen).toHaveBeenCalled();
    expect(sw.cachedPaths()).not.toContain(KATALOG_CHUNK);
    // Der Rest kommt trotzdem an — ein fehlendes Buendel darf den Install nicht
    // abbrechen, sonst reisst jeder Redeploy die ganze Offline-Faehigkeit ab.
    expect(sw.cachedPaths()).toContain(OFFLINE);
  });

  it("beantwortet ?_rsc-Anfragen nicht", async () => {
    /*
     * ALLOWLIST STATT DENYLIST. Eine Denylist (/api, /verwaltung) liess bei qr
     * die RSC-Antwort "/?_rsc=<hash>" einer Soft-Navigation durch — dieselben
     * personalisierten Daten wie im HTML, dauerhaft und ohne Revalidierung.
     */
    const sw = boot(netz());
    for (const pfad of ["/katalog?_rsc=1a2b3c", "/merkliste?_rsc=9z8y", "/api/auth/session"]) {
      const event = sw.dispatch("fetch", unterressource(pfad));
      await sw.drain(event);
      expect(event.responded, pfad).toBe(false);
    }
    expect(sw.cachedPaths()).toEqual([]);
  });

  it("liefert bei Login-Redirect die gecachte Offline-Flaeche", async () => {
    /*
     * MIT Netz, aber abgelaufener Sitzung. Ohne diesen Riegel verloere jemand
     * mit schwacher Verbindung den vollstaendig vorhandenen Katalog an eine
     * Anmeldemaske — und zwar mitten im Einsatz, wo ihn niemand neu anmelden
     * kann. Die Adresszeile steht dann auf /katalog, waehrend /offline
     * gerendert wird; das ist der bewusst gewaehlte kleinere Schaden.
     *
     * ⛔⛔ WAS DIESER TEST NICHT ZEIGT, GEMESSEN AM 2026-09-03 IM ECHTEN
     * CHROMIUM GEGEN DEN PROD-BUILD — hier statt verschwiegen, weil ein gruener
     * Test sonst etwas verspricht, was der Browser nicht einloest:
     *
     * Die Netzattrappe oben bildet `redirect: "follow"` nach. Ein
     * NAVIGATIONS-Request traegt aber `redirect: "manual"`, und dann liefert
     * `fetch` bei abgelaufener Sitzung KEINE weitergeleitete Antwort, sondern
     * eine undurchsichtige:
     *
     *   redirect:"manual" -> {type:"opaqueredirect", status:0, ok:false, redirected:FALSE}
     *   redirect:"follow" -> {type:"basic", status:200, ok:true, redirected:true, url:…/login}
     *
     * `res.redirected` ist im Browser also `false`, der Riegel unten feuert
     * nicht, und die Navigation laeuft auf /login weiter. Gegengemessen mit
     * gefuelltem Cache (59 Eintraege, /offline dabei) und kontrollierender
     * Registrierung: die Adresszeile landete auf
     * /login?callbackUrl=%2Fkatalog, die Seite zeigte die Anmeldemaske.
     *
     * REPARATUR 5 IST DAMIT IM BROWSER HEUTE WIRKUNGSLOS. Die Abhilfe ist eine
     * Entscheidung, keine Zeile: entweder `res.type === "opaqueredirect"`
     * pauschal als „das Netz will uns woanders hin" lesen (einfach, verschluckt
     * aber JEDE Weiterleitung), oder in diesem Fall EINMAL mit
     * `redirect: "follow"` nachfassen, um das Ziel wirklich zu sehen (genau die
     * Semantik unten, ein Zusatzabruf im seltenen Fall). Solange das nicht
     * entschieden ist, deckt dieser Test den PRECACHE-Pfad und die
     * follow-Semantik ab — und nur die.
     */
    const speicher = baueCacheSpeicher();
    const online = boot(netz(), speicher);
    await online.drain(online.dispatch("install", navigation("/")));

    const abgelaufen = boot(netz({ abgelaufen: true }), speicher);
    const event = abgelaufen.dispatch("fetch", navigation("/katalog"));
    const res = await event.response;
    await abgelaufen.drain(event);

    expect(await res!.clone().text()).toBe(OFFLINE_HTML);
    expect(await res!.clone().text()).not.toContain("Anmelden");
  });

  it("jede nicht gecachte Navigation faellt auf /offline zurueck", async () => {
    /*
     * Beide bestehenden Manifeste der Suite setzen start_url "/" und qr fuehrt
     * NAV_FALLBACK = "/". Hier waere "/" die RSC-Startseite unter SuiteRahmen —
     * ausdruecklich NICHT im Cache. Ohne den pauschalen Rueckfall loeste
     * `respondWith` auf `undefined` auf, und die installierte PWA landete auf
     * Chromiums Netzwerkfehlerseite. Dasselbe fuer jedes Lesezeichen.
     */
    const speicher = baueCacheSpeicher();
    const online = boot(netz(), speicher);
    await online.drain(online.dispatch("install", navigation("/")));

    const ohneNetz = boot(netz({ offline: true }), speicher);
    for (const ziel of ["/", "/katalog", "/katalog/rezept:E.1.1", "/merkliste", "/lernen"]) {
      const event = ohneNetz.dispatch("fetch", navigation(ziel));
      const res = await event.response;
      await ohneNetz.drain(event);
      expect(await res!.clone().text(), ziel).toBe(OFFLINE_HTML);
    }
  });

  it("loescht Cache und IndexedDB bei POST /api/auth/signout", async () => {
    /*
     * Seit der Merkliste-Entscheidung (Spec §7.5) ist dieser Haken von Vorsorge
     * zur TRAGENDEN Massnahme geworden: auf dem Geraet liegen jetzt Titel aus
     * der persoenlichen Merkliste. next-auth sendet beim Abmelden genau diesen
     * POST (`node_modules/next-auth/react.js`).
     *
     * ⛔ ER DECKT NUR DEN GEORDNETEN FALL AB — nicht Ablauf, nicht Widerruf,
     * nicht Gruppenentzug, nicht ein weggelegtes Geraet. Das steht so in der
     * Spec und darf nicht als Riegel gelesen werden.
     */
    const speicher = baueCacheSpeicher();
    const sw = boot(netz(), speicher);
    await sw.drain(sw.dispatch("install", navigation("/")));
    expect(sw.cacheNames()).toContain(CACHE);

    const event = sw.dispatch("fetch", post("/api/auth/signout"));
    await sw.drain(event);

    // Die Abmeldung selbst geht unveraendert ans Netz — der Worker beantwortet
    // sie NICHT, er raeumt nur nebenher auf.
    expect(event.responded).toBe(false);
    expect(sw.cacheNames()).toEqual([]);
    expect(sw.idb.geloescht).toContain("zeichen-merkliste");
  });
});
