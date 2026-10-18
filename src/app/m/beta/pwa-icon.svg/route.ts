import { appIconSvg } from "@/core/favicon/app-icon";

/**
 * Modul-eigenes Icon als Route statt Datei in `public/`: `public/` wird auf
 * *allen* Hosts ausgeliefert (die Middleware sieht statische Assets nicht),
 * ein Route Handler unterhalb von `/m/beta/` nur auf dem Modul-Host. Motiv: das
 * App-Icon der Suite mit dem IDA-Zeichen (`core/favicon/app-icon.ts`).
 */
const ICON = appIconSvg("ida");

export function GET() {
  return new Response(ICON, {
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "public, max-age=3600",
    },
  });
}
