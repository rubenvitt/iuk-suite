import { zeichenSwAn } from "../_lib/boot";
import { ZEICHEN_SW_QUELLE, ZEICHEN_SW_ABRAEUM_QUELLE } from "../_lib/sw-quelle";

/**
 * Service Worker als Route Handler UNTER dem Modul — derselbe Trick wie beim
 * Manifest: extern liegt er auf `zeichen.<domain>/sw.js` (Root-Scope, ohne
 * `Service-Worker-Allowed`-Header), intern unter `/m/zeichen/sw.js`. Auf jedem
 * anderen Host rewritet `/sw.js` in dessen Modul und laeuft dort ins Leere.
 *
 * ⛔ OHNE `SUITE_HOST_ZEICHEN` GIBT ES DIESEN PFAD NICHT: `decideRoute` faellt
 * dann aufs Portal zurueck und `/sw.js` wird zu `/m/portal/sw.js` -> 404. Genau
 * davor steht der Boot-Riegel in `_lib/boot.ts`.
 *
 * ⛔ DER HANDLER TRAEGT KEINEN PARAMETER, und das ist kein Stilentscheid: Next
 * reicht dem `GET` eines Route Handlers ein `Request` als erstes Argument. Ein
 * Parameter mit Vorgabe (`env = process.env`) wuerde in TypeScript nur bei
 * `undefined` eingesetzt — in Produktion laese der Handler also das
 * `Request`-Objekt statt der Umgebung, und `zeichenSwAn` faende dort nie eine
 * `1`. Die PWA waere dauerhaft aus, typkorrekt und lint-sauber.
 */
export function GET(): Response {
  return baueAntwort(process.env);
}

/** Ausgelagert, damit `pwa-routen.test.ts` die Umgebung setzen kann, ohne dass
 *  der Handler eine Signatur bekommt, die Next mit einem `Request` fuellt. */
export function baueAntwort(env: Record<string, string | undefined>): Response {
  return new Response(zeichenSwAn(env) ? ZEICHEN_SW_QUELLE : ZEICHEN_SW_ABRAEUM_QUELLE, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      // no-cache, nicht no-store: der Browser prueft den Worker bei jeder
      // Navigation gegen den Server, darf ihn aber revalidieren.
      "cache-control": "no-cache",
    },
  });
}
