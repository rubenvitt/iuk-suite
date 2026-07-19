import { getModule } from "@/core/registry";

/**
 * Domain-scoped Manifest. Liegt bewusst *unter dem Modul*, nicht als globales
 * `app/manifest.ts`: die Host-Middleware rewritet `beta.<domain>/manifest.webmanifest`
 * hierher, während derselbe Pfad auf jedem anderen Host nach `/m/<anderes-modul>/…`
 * rewritet wird und dort 404 liefert. Ein globales Manifest wäre auf allen Hosts
 * sichtbar und würde das Portal mit-installierbar machen.
 *
 * `start_url`/`scope` sind `/`, weil der Browser den *externen* Host sieht
 * (`beta.<domain>/`) — der Rewrite ist serverintern und für die PWA unsichtbar.
 */
export function GET() {
  const mod = getModule("beta");
  return Response.json(
    {
      name: `${mod.title} (PWA-Spike)`,
      short_name: mod.title,
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#c8000f",
      icons: [
        {
          src: "/pwa-icon.svg",
          sizes: "any",
          type: "image/svg+xml",
          purpose: "any",
        },
      ],
    },
    { headers: { "content-type": "application/manifest+json" } },
  );
}
