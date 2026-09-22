import type { NextConfig } from "next";

/*
 * TURBOPACKS DEV-DATEICACHE IST IN DER CI AUS — UND ZWAR NICHT AUS SPARSAMKEIT,
 * SONDERN WEIL ER DEN DEV-SERVER MITTEN IM LAUF ABBRICHT.
 *
 * `experimental.turbopackFileSystemCacheForDev` ist seit Next 16.1 Vorgabe `true`:
 * turbo-tasks lagert seinen Aufgabenbestand nach `.next/dev/cache/turbopack` aus
 * und liest ihn bei Bedarf zurueck. Genau dieses Zurueckholen ist in der CI
 * gescheitert (Lauf 35727863498, Gruppe `lagerbuch-2`, 2026-09-22):
 *
 *   thread 'tokio-rt-worker' panicked at turbo-tasks-backend/.../operation/mod.rs
 *   Restore of All for task TaskId 1042469 failed in another thread: restoring failed
 *   turbo-tasks: an internal panic occurred outside the per-task panic boundary.
 *   Aborting.
 *
 * ⚠️ DAS FEHLERBILD ZEIGT AUF DEN FALSCHEN SCHULDIGEN, und das ist der teure Teil.
 * Der Prozess ist weg, die naechste Spec faellt in ihr Zeitbudget
 * (`page.waitForResponse`, 90 s), die uebernaechsten in `ERR_CONNECTION_RESET`
 * und dann `ERR_CONNECTION_REFUSED`. Im Protokoll stehen acht rote Faelle aus
 * fuenf Dateien — keiner davon hat etwas getan. Die eine Zeile, die es erklaert,
 * steht unter `[WebServer]` zwischen zwei gruenen Faellen.
 *
 * ⚠️ KEIN TOR SIEHT DAS: `typecheck` und `lint` lesen keine Laufzeit, `pnpm build`
 * nimmt einen ANDEREN Schalter (`...ForBuild`), und Vitest faehrt gar keinen
 * Dev-Server. Nur ein echter Lauf auf einem kleinen Runner zeigt es — dort
 * zwingt der Speicherdruck turbo-tasks ueberhaupt erst, auf die Platte
 * auszulagern und zurueckzuholen (die e2e-Gruppen stehen aus demselben Grund je
 * Modul statt je Fallzahl, siehe den Kommentar an der Matrix in `ci.yml`).
 *
 * `CI` ALS BEDINGUNG, und das ist keine Verlegenheit: der `e2e`-Job holt kein
 * `.next` zwischen zwei Laeufen zurueck (kein Cache-Schritt vor
 * `pnpm exec playwright install`), der Cache wird dort also geschrieben und nie
 * wiederverwendet. Nexts eigene Anleitung sagt genau das
 * (`node_modules/next/dist/docs/.../turbopackFileSystemCache.md`, Abschnitt
 * „Build environments"). Wer lokal `pnpm dev` faehrt, behaelt den schnellen
 * Neustart — dort traegt derselbe Ordner ueber Sitzungen hinweg.
 *
 * ⚠️ NUR DER DEV-SCHALTER: `turbopackFileSystemCacheForBuild` bleibt unberuehrt.
 * Er betrifft `next build`, und der lief in demselben Lauf auf beiden
 * Architekturen gruen.
 */
const imCI = process.env.CI !== undefined && process.env.CI !== "" && process.env.CI !== "0";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  // Dev-only: the suite is exercised across multiple *.localtest.me hosts against a
  // single `next dev` server. Next dev blocks cross-origin requests to /_next/* dev
  // resources from any host other than the one it was started on (localhost), which
  // prevents client hydration on every *.localtest.me host. Allow the dev hosts so
  // interactivity (and dev-login) works on each subdomain. No effect on `next build`/`next start`.
  allowedDevOrigins: ["*.localtest.me"],
  ...(imCI ? { experimental: { turbopackFileSystemCacheForDev: false } } : {}),
};
export default nextConfig;
