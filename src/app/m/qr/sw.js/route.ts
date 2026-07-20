/**
 * Service Worker als Route Handler unter dem Modul — derselbe Trick wie beim
 * Manifest: extern liegt er auf `qr.<domain>/sw.js` (Root-Scope, ohne
 * `Service-Worker-Allowed`-Header), intern unter `/m/qr/sw.js`. Auf jedem
 * anderen Host rewritet `/sw.js` in dessen Modul und laeuft dort ins Leere.
 *
 * Bewusst handgeschrieben statt Serwist/next-pwa: das Muster stammt aus dem
 * verifizierten Spike (`docs/spikes/2026-07-19-qr-offline-pwa.md`) und soll
 * keine Precache-Build-Pipeline einfuehren. Precaching der Build-Assets
 * (`/_next/static/**`) fehlt deshalb — offline traegt das Runtime-Caching, der
 * erste Besuch muss online passieren.
 */
const SW = `
const CACHE = "qr-pwa-v1";
const NAV_FALLBACK = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.add(NAV_FALLBACK)).then(() => self.skipWaiting()),
  );
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

  // Alles Authentifizierte und alle Mutationen bleiben ungecacht — sonst waere
  // die Admin-Seite nach dem Logout weiter aus dem Cache abrufbar.
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(req));
    return;
  }

  // Navigationen: erst Netz (frische Seite), offline aus dem Cache.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(NAV_FALLBACK, copy));
          return res;
        })
        .catch(() => caches.open(CACHE).then((c) => c.match(NAV_FALLBACK))),
    );
    return;
  }

  // Alles andere (Build-Assets, Icon, Manifest): Cache first, sonst Netz + fuellen.
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

export function GET() {
  return new Response(SW, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
}
