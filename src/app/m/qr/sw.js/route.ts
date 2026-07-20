import { SW_SOURCE } from "@/app/m/qr/_lib/sw-source";

/**
 * Service Worker als Route Handler unter dem Modul — derselbe Trick wie beim
 * Manifest: extern liegt er auf `qr.<domain>/sw.js` (Root-Scope, ohne
 * `Service-Worker-Allowed`-Header), intern unter `/m/qr/sw.js`. Auf jedem
 * anderen Host rewritet `/sw.js` in dessen Modul und laeuft dort ins Leere.
 *
 * Der Quelltext selbst liegt in `_lib/sw-source.ts`, damit er testbar ist.
 */
export function GET() {
  return new Response(SW_SOURCE, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
}
