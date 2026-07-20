/**
 * Quelltext des Service Workers. Liegt als String in `_lib`, damit ihn der
 * Route Handler (`sw.js/route.ts`) ausliefern und der Unit-Test ihn in einer
 * nachgebauten Worker-Umgebung ausfuehren kann — sonst waere das
 * Caching-Verhalten nur im Browser pruefbar und damit faktisch ungetestet.
 *
 * Bewusst handgeschrieben statt Serwist/next-pwa: das Muster stammt aus dem
 * verifizierten Spike (`docs/spikes/2026-07-19-qr-offline-pwa.md`) und soll
 * keine Precache-Build-Pipeline einfuehren. Die Build-Assets werden trotzdem
 * vorgehalten — aber zur Laufzeit aus dem HTML der Shell-Seiten gelesen statt
 * aus einem beim Bauen erzeugten Manifest (siehe `cacheReferencedAssets`).
 * Der erste Besuch muss weiterhin online passieren.
 */
export const SW_SOURCE = `
// v2 statt v1: Geraete, die den alten Worker hatten, tragen unter v1 womoeglich
// die eingeloggte Startseite im Cache. Der activate-Handler loescht jeden Cache
// ausser dem aktuellen — mit einem neuen Namen ist der Altbestand damit
// zuverlaessig weg, statt darauf zu hoffen, dass ihn der naechste Write
// ueberschreibt.
const CACHE = "qr-pwa-v2";
const NAV_FALLBACK = "/";

/**
 * Die Routen, die offline tragen muessen. "/" ist der Einstieg mit den
 * Eingabefeldern, "/qr" zeigt den erzeugten Code — der Weg Eingabe -> Anzeige
 * fuehrt zwingend ueber beide. Lag nur "/" im Cache, beantwortete der Worker
 * die Navigation nach dem Erzeugen mit der Startseite: die Adresszeile stand
 * richtig auf /qr?data=…, gerendert wurde aber das leere Eingabeformular.
 */
const SHELL_ROUTES = [NAV_FALLBACK, "/qr"];

/**
 * Holt die Offline-Fassungen der Shell-Routen grundsaetzlich ohne Cookies.
 *
 * Grund: "/" zeigt eingeloggt das Preset-Grid. Dessen Props landen als
 * Client-Komponenten-Payload im HTML — bei einem WLAN-Preset samt Passwort.
 * Wuerde der Worker die ausgelieferte Antwort cachen, laege dieses HTML nach
 * dem Logout weiter auf dem Geraet und waere auf einem geteilten Tablet offline
 * fuer die naechste Person abrufbar. Genau der Leak, gegen den die
 * Admin-Ausnahme geschrieben war, nur auf der Route mit den Daten.
 *
 * Ein Header-Check (no-store/private) traegt hier nicht: "/" ist in beiden
 * Session-Zustaenden dynamisch und liefert dieselben Cache-Header — er wuerde
 * entweder beide Fassungen cachen oder gar keine. \`credentials: "omit"\` macht
 * die gecachte Fassung dagegen bauartbedingt anonym, unabhaengig von Headern.
 * Der Preis: offline gibt es keine Presets. Die QR-Erzeugung selbst laeuft
 * clientseitig und funktioniert weiter.
 *
 * "/qr" wird ohne Query geholt und liegt deshalb query-los im Cache. Das ist
 * kein Mangel, sondern Voraussetzung: die Ansicht liest \`data\`/\`label\`/\`kind\`
 * clientseitig aus der Adresszeile, eine einzige gecachte Fassung bedient
 * darum jeden Payload.
 */
function cacheAnonymousShell() {
  // Nacheinander, nicht parallel: beide Shell-Seiten teilen sich Buendel.
  // Parallel sehen beide denselben Cache-Fehltreffer, bevor einer schreibt, und
  // holen dieselbe Datei doppelt — auf einem Einsatz-Tablet am Mobilfunkrand
  // nicht egal.
  return SHELL_ROUTES.reduce(
    (chain, path) => chain.then(() => cacheShellRoute(path)),
    Promise.resolve(),
  );
}

function cacheShellRoute(path) {
  return fetch(path, { credentials: "omit" })
    .then(async (res) => {
      if (!res.ok) return;
      const html = await res.clone().text();
      const cache = await caches.open(CACHE);
      await cache.put(path, res);
      await cacheReferencedAssets(html, cache);
    })
    .catch(() => {});
}

/**
 * Zieht die Build-Assets nach, die eine Shell-Seite referenziert.
 *
 * Ohne das haengt die Offline-Zusage an einem Rennen: Das JS-Buendel einer
 * Route holt der Browser erst, wenn sie betreten oder vorgeladen wird. Bricht
 * das Netz vorher weg, fehlt genau das Buendel, das die Seite braucht, und der
 * Nutzer sieht statt seines Codes Next' Fehlerseite. Im Prod-Build gemessen:
 * "/qr" referenziert genau ein Buendel, das "/" nicht laedt.
 *
 * Ein \`router.prefetch("/qr")\` auf der Startseite war der erste Versuch und
 * ist bewusst wieder raus: es laeuft erst nach der Hydrierung an, und bricht
 * das Netz waehrenddessen weg, werden die Abrufe mittendrin abgebrochen
 * (gemessen: ERR_ABORTED auf genau jenem Buendel, in 1 von 6 Durchlaeufen).
 * Hier dagegen haengt alles am install-Handler — ist der Worker aktiv, ist
 * alles Noetige beisammen, ohne Rennen.
 *
 * Bewusst aus dem ausgelieferten HTML gelesen statt aus einem Precache-
 * Manifest: die Dateinamen sind gehasht und wechseln mit jedem Build, und eine
 * Build-Pipeline soll dieses Modul laut Plan nicht bekommen. Das HTML kennt
 * sie zur Laufzeit ohnehin.
 *
 * Getrennt wird auch am Backslash, nicht nur an Anfuehrungszeichen: Next legt
 * denselben Pfad ein zweites Mal im eingebetteten Flight-Payload ab, dort mit
 * maskierten Anfuehrungszeichen (\\"/_next/…\\"). Ohne den Backslash im Trenner
 * bliebe er am Pfad kleben und der Abruf ginge ins Leere.
 */
function cacheReferencedAssets(html, cache) {
  const refs = new Set(
    html.split(/["'()\\\\]/).filter((part) => part.startsWith("/_next/static/")),
  );
  return Promise.all(
    [...refs].map((path) =>
      cache.match(path).then((hit) =>
        hit
          ? undefined
          : fetch(path)
              .then((res) => (res.ok ? cache.put(path, res) : undefined))
              .catch(() => {}),
      ),
    ),
  );
}

/**
 * Cache-first nur fuer das, was nachweislich anonym und unter gehashter URL
 * unveraenderlich ist. Bewusst eine Allowlist: die fruehere Denylist
 * (/admin, /api/) liess die RSC-Antwort "/?_rsc=<hash>" einer Soft-Navigation
 * durch, die dieselben Preset-Daten traegt wie das HTML — dauerhaft und ohne
 * Revalidierung. Alles Unbekannte geht am Worker vorbei ans Netz.
 */
function isCacheableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/pwa-icon.svg" ||
    url.pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAnonymousShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigationen: erst Netz (frische, ggf. personalisierte Seite), offline aus
  // dem Cache. Die ausgelieferte Antwort wird nie gecacht; die Offline-Fassung
  // zieht cacheAnonymousShell separat nach. Der Write haengt an waitUntil —
  // ohne das darf der Browser den Worker beenden, sobald die Antwort steht, und
  // der Write ginge verloren.
  if (req.mode === "navigate") {
    event.waitUntil(cacheAnonymousShell());
    event.respondWith(
      // Offline pfadgenau antworten und erst danach auf "/" zurueckfallen.
      // Pauschal NAV_FALLBACK auszuliefern hiess: jede Navigation zeigt die
      // Startseite, egal wohin sie ging. Gematcht wird auf url.pathname statt
      // auf req — sonst suchte der Cache nach "/qr?data=…" und faende die
      // query-los abgelegte Fassung nie.
      fetch(req).catch(() =>
        caches
          .open(CACHE)
          .then(async (c) => (await c.match(url.pathname)) ?? (await c.match(NAV_FALLBACK))),
      ),
    );
    return;
  }

  if (!isCacheableAsset(url)) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }),
  );
});
`;
