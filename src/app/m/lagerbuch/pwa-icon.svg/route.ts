import { hostAbweisung } from "../_lib/hostRiegel";
import { PWA_ICON_SVG } from "../_lib/pwaIcons";

/**
 * §7.10.2. Host-Riegel als erste Anweisung; das Zeichen selbst steht in T65
 * (A-E1, `_lib/pwaIcons.ts`).
 *
 * ⚠️ DER NAME IST `/pwa-icon.svg` UND NICHT `/icon.svg` — die Begruendung steht
 * bei den `icons` in `manifest.webmanifest/route.ts`.
 */
export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  return hostAbweisung(req) ?? new Response(PWA_ICON_SVG, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=604800, immutable",
    },
  });
}
