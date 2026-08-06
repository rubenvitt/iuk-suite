import { hostAbweisung } from "../_lib/hostRiegel";
import { ICON_192_BASE64, pngAntwort } from "../_lib/pwaIcons";

/**
 * §7.10.2. DIE BYTES WANDERN AUS `public/` HERAUS, und das ist eine REPARATUR,
 * kein Aufraeumen: `src/proxy.ts:103` schliesst vom Matcher nur
 * `_next/static|_next/image|favicon.ico` aus. `/icon-192.png` wird auf dem
 * lagerbuch-Host nach `/m/lagerbuch/icon-192.png` umgeschrieben und laeuft ins
 * 404 — waehrend dieselbe Datei auf JEDEM ANDEREN Host an der Wurzel
 * ausgeliefert wuerde (Falle 56).
 *
 * ⚠️ DIESE DATEI BLEIBT EINE EIGENE, sie wird NICHT mit den zwei anderen
 * PNG-Handlern zu einer Fabrik zusammengezogen: Next leitet die Route aus dem
 * VERZEICHNISNAMEN ab, eine Fabrik braeuchte trotzdem drei Verzeichnisse mit je
 * einer Datei, und die Datei waere dann eine Zeile, die auf einen Namen zeigt,
 * den das Verzeichnis schon traegt. Geteilt ist nur, was eine geteilte ZUSAGE
 * ist — der Host-Riegel (`_lib/hostRiegel.ts`) und die Antwortform
 * (`pngAntwort`).
 */
export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  return hostAbweisung(req) ?? pngAntwort(ICON_192_BASE64);
}
