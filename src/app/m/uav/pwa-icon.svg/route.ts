import { appIconSvg } from "@/core/favicon/app-icon";

/**
 * Modul-eigenes Icon als Route statt Datei in `public/` — Muster
 * `qr/pwa-icon.svg/route.ts` (siehe dort für die Begründung: `public/` wird auf
 * *allen* Hosts ausgeliefert, ein Route Handler unterhalb von `/m/uav/` nur auf
 * dem Modul-Host). Motiv: das App-Icon der Suite mit dem Drohnen-Zeichen
 * (`core/favicon/app-icon.ts`).
 */
const ICON = appIconSvg("uav");

export function GET() {
  return new Response(ICON, {
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "public, max-age=3600",
    },
  });
}
