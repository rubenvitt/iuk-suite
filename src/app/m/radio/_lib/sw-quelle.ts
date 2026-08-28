/**
 * DER QUELLTEXT DES ABRAEUM-WORKERS (Spec 1 Kapitel 7 §7.1, `Spec:5635-5656`).
 *
 * ⛔ ER GEHOERT ZUM ERSTEN DEPLOY, NICHT ZUM CUTOVER — eine der drei harten
 * Reihenfolge-Auflagen des ganzen Bauwegs (`docs/superpowers/plans/2026-08-21-radio-modul-leitplan.md:100-110`,
 * woertlich): „Weil der Alt-Kiosk denselben Origin haelt, ueberlebt sein Service Worker den
 * Umschwenk — ohne Abraeumen liefert er gecachte Alt-Oberflaeche an Geraete aus, die nie neu
 * geladen haben." Kommt diese Route erst mit dem Router-Schwenk, gibt es im entscheidenden
 * Fenster nichts, was sich vom Alten unterscheidet.
 *
 * ⛔ NICHTS IN DER SUITE RUFT `navigator.serviceWorker.register()`, und das ist Absicht.
 * Diese Route wird ausschliesslich von der Update-Pruefung eines SCHON REGISTRIERTEN
 * Alt-Workers abgeholt (`Spec:5673-5678`). Es entsteht deshalb auch keine `RegisterSW.tsx`
 * fuer `radio` — auch nicht „vorsichtshalber".
 *
 * ⛔ DIE GEMESSENE CACHE-LAGE DES ALT-KIOSKS (Entscheidung E-G5, ganze Datei gelesen,
 * Vorabscan-Fund 2 hat sie Zeile fuer Zeile bestaetigt) —
 * `/Users/rubeen/dev/personal/drk/radio-inventar/apps/frontend/public/sw.js`:
 *
 *   `:2`        `const CACHE_NAME = 'radio-inventar-v1';` — der EINZIGE Cache-Name
 *   `:20-21`    `install` precacht darunter
 *   `:63`, `:107`, `:122`  API-Antworten landen darunter
 *   `:84`       Navigationsantworten landen darunter
 *   `:32-36`    `activate` loescht jeden Cache, dessen Name NICHT `CACHE_NAME` ist
 *   alle ELF `caches.`-Vorkommen: `:20, 32, 36, 63, 71, 84, 91, 92, 101, 107, 122`
 *   Registrierung mit Root-Scope `'/'`: `apps/frontend/src/hooks/usePWA.ts:73`
 *
 * ⛔ UND TROTZDEM LOESCHT DIESER WORKER `caches.keys()`, NICHT DIESEN EINEN NAMEN
 * (`Spec:5663-5666`): der Alt-Worker loescht selbst nur FREMDE Namen — ueber fruehere
 * Staende auf dem jeweiligen Telefon sagt das nichts. Ein Worker, der nur
 * `radio-inventar-v1` raeumte, liesse den Cache eines Alt-Alt-Standes stehen, und dieser
 * Origin gehoert ab jetzt der Suite. Der gemessene Name steht deshalb im TEST
 * (`sw-quelle.test.ts`, Fall „…auch den gemessenen Alt-Namen…"), nicht im Worker.
 *
 * ⛔ KEIN `releaseBody()`, UND DIE LEHRE DAHINTER BLEIBT TROTZDEM VERBINDLICH. `qr`s Worker
 * muss jede Antwort, die er liest und nicht weiterreicht, ausdruecklich freigeben
 * (`src/app/m/qr/_lib/sw-source.ts:100`, `:150`, `:212`). Hier wird sie nicht abgeschrieben,
 * sondern EINGEHALTEN, INDEM DIE URSACHE FEHLT: dieser Worker liest niemals eine Antwort,
 * ein `releaseBody` waere toter Code. ⚠️ Fuer jeden spaeteren CACHENDEN Worker dieses Moduls
 * gilt die Lehre unveraendert.
 *
 * ⛔ KEIN "use client" (Falle 6, Bauform-Zulaessigkeitstafel Nr. 1). Der Konsument
 * `sw.js/route.ts` ist eine Server-Datei; ein WERT aus einem Client-Modul kaeme dort als
 * Client-Referenz an — HTTP 500. Der Quelltext liegt aus demselben Grund in `_lib/` wie bei
 * `qr` (`src/app/m/qr/sw.js/route.ts:9`, woertlich: „damit er testbar ist").
 *
 * ⬜ G-L7 (= L12) — DER ABLESEPUNKT IN DEN ENTWICKLERWERKZEUGEN IST HIER EINE BENANNTE
 * LEERSTELLE, KEINE ZUSAGE. Was in „Application → Service Workers" und „Application → Cache
 * Storage" NACH dem Abraeumen steht, liest Spec 2 (§4.7.2, Haelfte 2) an einem ECHTEN
 * GERAET ab — „curl hat keinen Service Worker". Das Mess-REZEPT fuer die erste Haelfte steht
 * dagegen fest und laeuft ohne Geraet: `curl` gegen `/sw.js` mit dem radio-Host im Kopf und
 * die drei Anker `registration.unregister` (>= 1), `caches.keys` (>= 1) und
 * `addEventListener("fetch"` (== 0).
 */
export const RADIO_SW_ABRAEUM_QUELLE = `// Abraeum-Worker: ersetzt den Service Worker des Alt-Kiosks und traegt sich aus.
// KEIN fetch-Handler. Dieser Worker beantwortet nichts.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // ALLE Cache-Namen, nicht nur 'radio-inventar-v1': aeltere Staende koennen
      // weitere hinterlassen haben, und dieser Origin gehoert ab jetzt der Suite.
      const namen = await caches.keys();
      await Promise.all(namen.map((n) => caches.delete(n)));
      await self.clients.claim();
      await self.registration.unregister();
    })(),
  );
});
`;
