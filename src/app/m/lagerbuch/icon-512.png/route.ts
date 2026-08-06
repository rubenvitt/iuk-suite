import { hostAbweisung } from "../_lib/hostRiegel";
import { ICON_512_BASE64, pngAntwort } from "../_lib/pwaIcons";

/** §7.10.2, siehe `icon-192.png/route.ts` — dieselbe Begruendung (Falle 56). */
export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  return hostAbweisung(req) ?? pngAntwort(ICON_512_BASE64);
}
