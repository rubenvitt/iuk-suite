import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  // Dev-only: the suite is exercised across multiple *.localtest.me hosts against a
  // single `next dev` server. Next dev blocks cross-origin requests to /_next/* dev
  // resources from any host other than the one it was started on (localhost), which
  // prevents client hydration on every *.localtest.me host. Allow the dev hosts so
  // interactivity (and dev-login) works on each subdomain. No effect on `next build`/`next start`.
  allowedDevOrigins: ["*.localtest.me"],
  experimental: {
    /*
     * TURBOPACKS PLATTENCACHE FUER `next dev` — IN DER CI AUS, LOKAL AN.
     *
     * Seit Next 16.1.0 ist `turbopackFileSystemCacheForDev` VORGABE `true`
     * (`node_modules/next/dist/server/config-shared.js`, `defaultConfig`; die
     * Versionstabelle steht in `node_modules/next/dist/docs/01-app/
     * 03-api-reference/05-config/01-next-config-js/turbopackFileSystemCache.md`).
     * Turbopack schreibt seinen Aufgabengraphen dann laufend nach
     * `.next/dev/cache/turbopack` und darf die Kopien im Speicher danach
     * wegwerfen: `turbopackMemoryEviction` steht auf `'auto'` und raeumt
     * „unter Speicherdruck des Betriebssystems". Was geraeumt wurde, wird bei
     * Bedarf VON DER PLATTE ZURUECKGEHOLT.
     *
     * GENAU DIESER RUECKWEG IST AM 2026-08-28 GEPLATZT — Lauf 33166458248,
     * Job 98832927982, Shard 2, zehn Minuten nach dem Start:
     *
     *   thread 'tokio-rt-worker' panicked at
     *   turbopack/crates/turbo-tasks-backend/src/backend/operation/mod.rs:292:17:
     *   Restore of All for task TaskId 1038807 failed in another thread: restoring failed
     *   turbo-tasks: an internal panic occurred outside the per-task panic boundary
     *   Aborting.
     *
     * Danach war der Dev-Server weg, und die restlichen ~40 Tests des Shards
     * fielen der Reihe nach mit ERR_CONNECTION_RESET/REFUSED. Das Fehlerbild
     * fuehrt in die Irre: es sieht aus wie eine kaputte Anmeldung
     * (`login-dev-gruppen.spec.ts` zuerst) und ist keine. Die Ursache liegt
     * NICHT in diesem Zweig — Shard 2 enthaelt `radio-verwaltung.spec.ts`
     * ueberhaupt nicht, seine Zusammensetzung ist vor und nach den
     * Radio-Commits Zeile fuer Zeile dieselbe (nachgezaehlt mit
     * `playwright test --shard=2/3 --list`), und seine Laufzeit liegt mit
     * 829 s im Band der gruenen Laeufe (666 s / 761 s / 839 s).
     *
     * IN DER CI KOSTET DER CACHE OHNEHIN NUR. `.next` ist dort IMMER kalt
     * (frischer Checkout, kein Build-Cache — dieselbe Feststellung traegt schon
     * `timeout` und `retries` in `playwright.config.ts`). Was ein Lauf auf die
     * Platte schreibt, liest kein zweiter je wieder; die einzige Wirkung
     * INNERHALB des Laufs ist das Raeumen-und-Zurueckholen, das oben abgestuerzt
     * ist. Lokal ist `.next` warm, dort traegt der Cache sich selbst — deshalb
     * `!process.env.CI` und nicht `false`. Dieselbe Unterscheidung aus demselben
     * Grund macht `retries` in `playwright.config.ts`.
     *
     * Der Schalter erreicht den e2e-Server, weil Playwrights `webServer.env`
     * ueber `process.env` gelegt wird und es nicht ersetzt (nachgelesen in
     * `playwright/lib/runner/index.js`, `{ ...DEFAULT_ENVIRONMENT_VARIABLES,
     * ...process.env, ...this._options.env }`) — `CI=true` der Actions-Umgebung
     * kommt also bei `next dev` an.
     *
     * ⚠️ KEIN TOR FINDET DAS. `pnpm build` faehrt `next build` und haengt damit
     * am ANDEREN Schalter (`...ForBuild`); `typecheck` und `lint` sehen nur eine
     * Zahl in einer Konfiguration; Vitest startet keinen Dev-Server. Sichtbar
     * wird es ausschliesslich in einem e2e-Lauf unter Last — und dort nicht als
     * gescheiterte Zusicherung, sondern als abgebrochene Verbindung.
     *
     * Bewusst NICHT der engere Schnitt `turbopackMemoryEviction: false`: der
     * haelt zwar dasselbe Raeumen an, laesst den Schnappschuss aber weiter auf
     * eine Platte schreiben, die niemand liest, und behaelt dafuer alles im
     * Speicher — auf einem kleinen Runner der falsche Tausch.
     */
    turbopackFileSystemCacheForDev: !process.env.CI,
  },
};
export default nextConfig;
