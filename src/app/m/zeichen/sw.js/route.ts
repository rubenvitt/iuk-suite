import { ABRAEUM_QUELLE } from "../_lib/abraeum";

/**
 * Der Abräum-Worker — das Einzige, was vom Modul `zeichen` übrig ist (DRK-465).
 *
 * Installierte PWAs prüfen ihren Worker bei der nächsten Navigation gegen
 * `zeichen.<domain>/sw.js` (extern, Root-Scope; intern `/m/zeichen/sw.js`,
 * `core/routing.ts`). Sie bekommen diesen Worker, der Cache und Gerätedatenbank
 * abräumt und sich austrägt. Ohne diese Route bliebe der alte Cache-Worker samt
 * Katalog und Merkliste auf jedem Gerät liegen, ohne Hebel dagegen.
 */
export function GET(): Response {
  return new Response(ABRAEUM_QUELLE, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      // no-cache, nicht no-store: der Browser prüft den Worker bei jeder
      // Navigation gegen den Server, darf ihn aber revalidieren.
      "cache-control": "no-cache",
    },
  });
}
