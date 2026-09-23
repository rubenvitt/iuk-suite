/**
 * Quelle des Abräum-Workers. Eigenes Modul statt Export aus `sw.js/route.ts`:
 * eine Route-Datei darf nur Handler und Route-Konfiguration exportieren.
 *
 * KEIN fetch-Handler: dieser Worker beantwortet nichts. Quelle unverändert aus
 * dem Stand vor der Entfernung (`zeichen/_lib/sw-quelle.ts`, Konstante
 * `ZEICHEN_SW_ABRAEUM_QUELLE`, Elter von Commit `6ad7bcf`).
 */
export const ABRAEUM_QUELLE = `// Abraeum-Worker: raeumt Cache und Geraetedaten ab und traegt sich aus.
// KEIN fetch-Handler. Dieser Worker beantwortet nichts.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const namen = await caches.keys();
      await Promise.all(namen.map((n) => caches.delete(n)));
      try { indexedDB.deleteDatabase("zeichen-merkliste"); } catch (e) {}
      await self.clients.claim();
      await self.registration.unregister();
    })(),
  );
});
`;
