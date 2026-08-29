/**
 * Domain-scoped Manifest — Muster `qr/manifest.webmanifest/route.ts` (siehe dort
 * für die volle Begründung: warum unter dem Modul statt als globales
 * `app/manifest.ts`, warum `start_url`/`scope` auf `/` stehen).
 *
 * Werte fest verdrahtet statt aus `getModule("uav")` gelesen: `mod.title` ist
 * "Drohnentraining" (Registry, Kürzel für UI/Switcher), das Manifest trägt den
 * längeren, für Teilnehmer geschriebenen Namen aus Spec §5.
 */
export function GET() {
  return Response.json(
    {
      name: "Drohnen-Trainingsbegleiter",
      short_name: "Drohnen-Training",
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
