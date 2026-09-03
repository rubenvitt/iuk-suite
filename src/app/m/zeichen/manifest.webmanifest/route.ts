import { getModule } from "@/core/registry";

/**
 * Domain-scoped Manifest. Liegt bewusst UNTER dem Modul, nicht als globales
 * `app/manifest.ts`: die Host-Middleware rewritet
 * `zeichen.<domain>/manifest.webmanifest` hierher, waehrend derselbe Pfad auf
 * jedem anderen Host in dessen Modul rewritet und dort 404 liefert.
 *
 * ⛔ `start_url: "/offline"` — DIE EINE ZEILE, DIE VON qr UND uav ABWEICHT
 * (beide setzen "/"). Hier waere "/" die RSC-Startseite unter SuiteRahmen, und
 * die liegt ausdruecklich NICHT im Cache: die installierte PWA landete offline
 * auf Chromiums Netzwerkfehlerseite (`caches.match("/")` leer,
 * `caches.match(NAV_FALLBACK)` ebenfalls leer, `respondWith` loest auf
 * `undefined` auf). `scope` bleibt "/", damit der Worker JEDE Navigation des
 * Hosts sieht und darauf zurueckfallen kann.
 *
 * ⛔ DER MANIFEST-LINK IM LAYOUT TRAEGT `crossOrigin="use-credentials"`
 * (`layout.tsx`, Aufgabe 5). Ohne das Attribut holt der Browser das Manifest
 * OHNE Cookies und bekommt auf einem auth-pflichtigen Host Login-HTML.
 */
export function GET(): Response {
  const mod = getModule("zeichen");
  return Response.json(
    {
      name: mod.title,
      // Kurzform fuer das Startsymbol: unter einem Homescreen-Icon bricht
      // „Taktische Zeichen" ab und niemand sieht, welche App das ist.
      short_name: "Zeichen",
      description: "Taktische Zeichen nachschlagen, bauen und ueben.",
      start_url: "/offline",
      scope: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#c8000f",
      icons: [{ src: "/pwa-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
    },
    { headers: { "content-type": "application/manifest+json" } },
  );
}
