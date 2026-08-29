import { hostAbweisung } from "../_lib/hostRiegel";
import { swModus } from "../_lib/boot";
import { UAV_SW_ABRAEUM_QUELLE, UAV_SW_CACHE_QUELLE } from "../_lib/sw-quelle";

/**
 * `GET /sw.js` — beide Modi hinter demselben Pfad (Spec §5). Extern liegt der
 * Worker auf `<uav-host>/sw.js` (Root-Scope), intern unter `/m/uav/sw.js` — siehe
 * `radio/sw.js/route.ts` für die volle Begründung des Musters.
 *
 * ⛔ `hostAbweisung` UND NICHT DIE WERFENDE FORM — ein `notFound()` wäre eine
 * HTML-Fehlerseite und bräche die Worker-Registrierung/Update-Prüfung des Browsers
 * mit einer irreführenden Meldung ab.
 *
 * ⛔ DER `??` MACHT „ALS ERSTE ANWEISUNG" STRUKTURELL WAHR — der rechte Zweig,
 * und damit auch `swModus()`, wird erst ausgewertet, wenn der Riegel `null` ist.
 */
export function GET(req: Request): Response {
  return (
    hostAbweisung(req) ??
    new Response(swModus(process.env) === "cachen" ? UAV_SW_CACHE_QUELLE : UAV_SW_ABRAEUM_QUELLE, {
      headers: {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-cache",
      },
    })
  );
}
