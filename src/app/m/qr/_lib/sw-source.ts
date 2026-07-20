/**
 * Quelltext des Service Workers. Liegt als String in `_lib`, damit ihn der
 * Route Handler (`sw.js/route.ts`) ausliefern und der Unit-Test ihn in einer
 * nachgebauten Worker-Umgebung ausfuehren kann — sonst waere das
 * Caching-Verhalten nur im Browser pruefbar und damit faktisch ungetestet.
 *
 * Bewusst handgeschrieben statt Serwist/next-pwa: das Muster stammt aus dem
 * verifizierten Spike (`docs/spikes/2026-07-19-qr-offline-pwa.md`) und soll
 * keine Precache-Build-Pipeline einfuehren. Precaching der Build-Assets
 * (`/_next/static/**`) fehlt deshalb — offline traegt das Runtime-Caching, der
 * erste Besuch muss online passieren.
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
 * Holt die Offline-Fassung von "/" grundsaetzlich ohne Cookies.
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
 */
function cacheAnonymousShell() {
  return fetch(NAV_FALLBACK, { credentials: "omit" })
    .then((res) => (res.ok ? caches.open(CACHE).then((c) => c.put(NAV_FALLBACK, res)) : undefined))
    .catch(() => {});
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
      fetch(req).catch(() => caches.open(CACHE).then((c) => c.match(NAV_FALLBACK))),
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
