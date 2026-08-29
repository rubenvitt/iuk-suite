/**
 * Quelltext der zwei Service-Worker-Modi dieses Moduls (Task 14, Spec §5).
 *
 * ⛔ WARUM ZWEI QUELLEN UND ZWEI MODI: die Alt-App teilt sich mit der Suite denselben
 * Origin, ihr Workbox-Worker überlebt den Domain-Cutover auf den Telefonen der
 * Teilnehmer. Von ersten Deploy bis zum Ende des Standby liefert `/sw.js`
 * `UAV_SW_ABRAEUM_QUELLE` aus (kein `fetch`-Handler; löscht ALLE Caches; trägt sich
 * aus; lädt jeden offenen Tab neu, damit die Alt-Oberfläche sofort durch die Suite
 * ersetzt wird) — erst danach (`UAV_SW_MODUS=cachen`) wird `/sw.js` zum
 * Allowlist-Cache-Worker `UAV_SW_CACHE_QUELLE`. Welche Quelle ausgeliefert wird,
 * entscheidet `swModus()` (`_lib/boot.ts`), gelesen in `sw.js/route.ts`.
 *
 * Beide Quellen liegen als String in `_lib`, damit sie der Route Handler
 * ausliefern und der Unit-Test sie in einer nachgebauten Worker-Umgebung ausführen
 * kann — dasselbe Muster wie `radio/_lib/sw-quelle.ts` und `qr/_lib/sw-source.ts`.
 *
 * KEIN "use client" (Falle 6). Der Konsument `sw.js/route.ts` ist eine Server-Datei;
 * ein WERT aus einem Client-Modul käme dort als Client-Referenz an — HTTP 500.
 */

/**
 * DER ABRÄUM-WORKER. Übernommen aus `radio/_lib/sw-quelle.ts:55-73` (dortige
 * Begründung samt der gemessenen Alt-Cache-Lage gilt hier unverändert) und um den
 * Reload ergänzt: nach `unregister()` navigieren alle offenen Fenster erneut auf
 * ihre eigene URL, damit die Alt-Oberfläche nicht erst beim nächsten manuellen
 * Neuladen verschwindet, sondern sofort.
 *
 * KEIN `releaseBody()` — dieser Worker liest niemals eine Antwort, ein
 * `releaseBody` wäre toter Code (dieselbe Begründung wie bei `radio`). Für den
 * Cache-Worker unten gilt die Lehre daraus unverändert.
 */
export const UAV_SW_ABRAEUM_QUELLE = `// Abraeum-Worker: ersetzt den Service Worker der Alt-App und traegt sich aus.
// KEIN fetch-Handler. Dieser Worker beantwortet nichts.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // ALLE Cache-Namen, nicht nur einen bekannten: dieser Origin gehoert ab
      // jetzt der Suite, und aeltere Staende koennen weitere Namen hinterlassen
      // haben.
      const namen = await caches.keys();
      await Promise.all(namen.map((n) => caches.delete(n)));
      await self.clients.claim();
      await self.registration.unregister();
      // Jedes offene Fenster navigiert erneut auf seine eigene URL, damit die
      // Alt-Oberflaeche sofort durch die Suite ersetzt wird, statt erst beim
      // naechsten manuellen Neuladen zu verschwinden.
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        try {
          await client.navigate(client.url);
        } catch {}
      }
    })(),
  );
});
`;

/**
 * DER CACHE-WORKER. Vorlage `qr/_lib/sw-source.ts` (dort steht die volle
 * Begründung jeder Technik — `cacheReferencedAssets`, `isCompleteAssetPath`,
 * sequentielles Shell-Caching, Selbstheilung per `SHELL_MAX_AGE_MS`).
 *
 * ⚠️ ABWEICHUNG VON `qr`: die Shell-Seiten werden MIT Cookies geholt, nicht mit
 * `credentials: "omit"`. Bei `qr` trägt "/" eingeloggt personalisierte Presets
 * (samt WLAN-Passwort) im HTML — ein anonymer Fetch war dort die einzige
 * Möglichkeit, dieses HTML nie in den Cache zu legen. Die Insel dieses Moduls
 * (`/`, `/aufgabe`, `/login`) trägt dagegen KEINE Nutzdaten im HTML — Aufgaben,
 * Fortschritt, Teilnehmer-Identität kommen erst clientseitig aus
 * `localStorage`/API. Die gecachte Shell unterscheidet sich zwischen den zwei
 * Session-Zuständen NUR um einen Navigationseintrag: `(teilnehmer)/layout.tsx`
 * blendet „Verwaltung" ein, wenn `canAdminModule("uav")` für die anfragende
 * Session zutrifft — trägt also im Grenzfall den Menüpunkt DERSELBEN
 * Browser-Session, mit der er geholt wurde, nicht fremde Daten und keinen
 * fremden Zugriff (der Link selbst bleibt hinter `requireUavAdminPage()`
 * gegatet). Harmlos, und genau deshalb bringt ein anonymer Fetch hier keinen
 * Sicherheitsgewinn, nur eine zweite, überflüssige Netzwerkrunde bei jeder
 * Installation/Auffrischung.
 */
export const UAV_SW_CACHE_QUELLE = `
// v1: erste Fassung dieses Cache-Workers.
const CACHE = "uav-pwa-v1";
const NAV_FALLBACK = "/";

/**
 * Die Shell-Routen der Teilnehmer-Insel, offline erreichbar.
 *
 * ACHTUNG, KEINE RUECKWAERTSHOCHKOMMAS IN DIESEM KOMMENTAR: dieser Quelltext
 * liegt in einem Template-Literal (UAV_SW_CACHE_QUELLE), ein Hochkomma beendet
 * es und der Parser bricht mitten in einem Satz ab.
 *
 * /anmelden steht mit in der Liste, seit es die code-lose Adresse der
 * Anmeldeflaeche ist (siehe (teilnehmer)/anmelden/page.tsx): sie ist der Weg
 * zurueck in die App, wenn die Sitzung im Funkloch ablaeuft — genau dort
 * braucht man sie aus dem Cache. /login bleibt daneben stehen; ohne
 * code-Parameter liefert diese Adresse zwar den Suite-Login, mit ihm aber den
 * Magic-Link-Weg, und der ist der haeufigste Einstieg ueberhaupt.
 */
const SHELL_ROUTES = [NAV_FALLBACK, "/aufgabe", "/anmelden", "/login"];

/** Wie lange eine geholte Offline-Fassung als frisch genug gilt, siehe qr. */
const SHELL_MAX_AGE_MS = 5 * 60 * 1000;
let lastShellRefresh = 0;

/**
 * Holt die Offline-Fassungen der Shell-Routen MIT Cookies — anders als bei qr,
 * siehe Modulkommentar oben: diese Shell traegt in beiden Session-Zustaenden
 * dasselbe HTML ohne Nutzdaten.
 */
function cacheShell() {
  lastShellRefresh = Date.now();
  // Nacheinander, nicht parallel: die Shell-Seiten teilen sich Buendel, siehe qr.
  return SHELL_ROUTES.reduce(
    (chain, path) => chain.then(() => cacheShellRoute(path)),
    Promise.resolve(),
  );
}

/** Drosselung des Selbstheilungspfads, siehe SHELL_MAX_AGE_MS. */
function refreshShellIfStale() {
  if (Date.now() - lastShellRefresh < SHELL_MAX_AGE_MS) return Promise.resolve();
  return cacheShell();
}

function cacheShellRoute(path) {
  return fetch(path)
    .then(async (res) => {
      if (!res.ok) return releaseBody(res);
      const html = await res.clone().text();
      const cache = await caches.open(CACHE);
      await cache.put(path, res);
      await cacheReferencedAssets(html, cache);
    })
    .catch(() => {});
}

/** Zieht die Build-Assets nach, die eine Shell-Seite referenziert — siehe qr. */
function cacheReferencedAssets(html, cache) {
  const refs = new Set(
    html
      .split(/["'()\\\\]/)
      .filter((part) => part.startsWith("/_next/static/") && isCompleteAssetPath(part)),
  );
  return Promise.all(
    [...refs].map((path) =>
      cache.match(path).then((hit) =>
        hit
          ? undefined
          : fetch(path)
              .then((res) => (res.ok ? cache.put(path, res) : releaseBody(res)))
              .catch(() => {}),
      ),
    ),
  );
}

/** Nimmt nur Pfade an, deren letztes Segment eine Dateiendung traegt — siehe qr. */
function isCompleteAssetPath(path) {
  const withoutQuery = path.split(/[?#]/)[0];
  const lastSegment = withoutQuery.slice(withoutQuery.lastIndexOf("/") + 1);
  return /\\.[a-zA-Z0-9]+$/.test(lastSegment);
}

/**
 * Gibt den Body einer Antwort frei, die nicht in den Cache wandert — die Lehre
 * aus qr (\`qr/_lib/sw-source.ts\`): ein liegen gelassener Body legt die
 * Abruf-Pipeline des Workers dauerhaft still.
 */
function releaseBody(res) {
  return res.body ? res.body.cancel().catch(() => {}) : undefined;
}

/**
 * Cache-first nur fuer das nachweislich unveraenderliche: Build-Assets, Icon,
 * Manifest, Illustrationen sowie die drei Shell-Routen selbst.
 *
 * ⛔ NIE /api/, NIE /admin — weder extern (der Weg, den der Browser sieht) noch
 * am internen Modulpfad /m/uav/admin (Verteidigung in der Tiefe, falls der
 * Worker je unter dem internen Pfad aktiv würde).
 */
function isCacheableAsset(url) {
  if (url.pathname.startsWith("/api/")) return false;
  if (url.pathname.startsWith("/admin")) return false;
  if (url.pathname.startsWith("/m/uav/admin")) return false;
  // Absichtlich OHNE SHELL_ROUTES.includes(url.pathname) hier: Navigationen zu
  // den drei Shell-Routen laufen bereits ueber den navigate-Zweig unten und
  // erreichen diese Funktion nie. Ein Eintrag hier oeffnete stattdessen NUR
  // NICHT-Navigationen auf denselben Pfaden - genau die RSC-Soft-Navigation
  // "/aufgabe?_rsc=hash" - fuer den Cache-first-Zweig, und die laege dann
  // DAUERHAFT und OHNE Revalidierung im Cache. Dieselbe Falle wie bei qr, siehe
  // qr/_lib/sw-source.ts (isCacheableAsset), dort gemessen und deshalb eine
  // Allowlist statt einer Denylist. Die drei Shell-Dokumente selbst landen
  // trotzdem im Cache, ueber cacheShellRoute() beim Install/Refresh.
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/m/uav/illustrations/") ||
    url.pathname === "/pwa-icon.svg" ||
    url.pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheShell().then(() => self.skipWaiting()));
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
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/admin")) return;
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.waitUntil(refreshShellIfStale());
    event.respondWith(
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
