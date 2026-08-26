import { hostAbweisung } from "../_lib/hostRiegel";
import { RADIO_SW_ABRAEUM_QUELLE } from "../_lib/sw-quelle";

/**
 * `GET /sw.js` — DER ABRAEUM-WORKER (Spec 1 §7.1.3, `Spec:5607-5622`; Planteil 5, G5).
 *
 * DER SCOPE IST DIE WURZEL, NICHT DER MODULPFAD. Extern liegt der Worker auf
 * `radio.<domain>/sw.js`; der Rewrite in `src/core/routing.ts:43-79` bildet ihn intern auf
 * `/m/radio/sw.js` ab, und `_lib/routen.test.ts:122-132` fuehrt den Fall als gruenen Test.
 * Der Alt-Kiosk registriert mit `scope: '/'`
 * (`radio-inventar/apps/frontend/src/hooks/usePWA.ts:73`) — ein Worker unter einem anderen
 * Pfad erreichte die bereits installierten Kopien nicht.
 * ⚠️ BEDINGUNG IM BETRIEB: `SUITE_HOST_RADIO` muss gesetzt sein, sonst greift der Rewrite
 * nicht und `/sw.js` landet auf `radio.iuk-ue.de` im Portal-Modul (§7.4.4, erster stiller
 * Fall). Im e2e-Lauf faellt das nicht an: `src/core/registry.ts:254` trifft
 * `radio.localtest.me` VOR `prodHostsFor` `:255`.
 *
 * ⛔ `hostAbweisung` UND NICHT DIE WERFENDE FORM (Bauform-Zulaessigkeitstafel Nr. 12,
 * `Spec:5624-5629`). Ein notFound waere eine HTML-Fehlerseite mit
 * `Content-Type: text/html`, und der Browser braeche die Worker-Registrierung mit einer
 * irrefuehrenden Meldung ab statt mit einer sauberen Abweisung.
 *
 * ⛔ DER `??` MACHT „ALS ERSTE ANWEISUNG" STRUKTURELL WAHR (`_lib/hostRiegel.ts:17-22`):
 * der rechte Zweig wird erst ausgewertet, wenn der linke `null` ist. Ein Riegel als ZWEITE
 * Anweisung antwortete auf fremdem Host genauso mit 404 — den Unterschied sieht nur ein
 * Test, der zaehlt, OB die Quelle gelesen wurde (`route.test.ts`, Fall „der Riegel steht
 * VOR jeder Auswertung der Quelle").
 */
export function GET(req: Request): Response {
  return (
    hostAbweisung(req) ??
    new Response(RADIO_SW_ABRAEUM_QUELLE, {
      headers: {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-cache",
      },
    })
  );
}
