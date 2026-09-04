import { defineConfig } from "@playwright/test";
import { ZEICHEN_ENV } from "./e2e/helpers/zeichen";

/**
 * Eigene Config für den PWA-Spike (Port 3101, parallel zur E2E-Config auf 3100).
 *
 * Grund für die Trennung: Service Worker laufen nur im sicheren Kontext.
 * `http://<modul>.localtest.me` ist keiner, also braucht Chrome hier
 * `--unsafely-treat-insecure-origin-as-secure`. Dieses Flag soll nicht in der
 * normalen E2E-Suite hängen — dort würde es reale Browser-Sicherheitszusagen
 * abschalten, die die anderen Tests mit prüfen.
 */
const ORIGINS = [
  "http://beta.localtest.me:3101",
  "http://portal.localtest.me:3101",
  "http://qr.localtest.me:3101",
  // Ohne diese Zeile ist `zeichen.localtest.me:3101` kein sicherer Kontext:
  // `isSecureContext` bleibt false, `navigator.serviceWorker` fehlt ganz, und
  // JEDER Fall aus `zeichen-pwa.spec.ts` scheitert an `undefined` statt an
  // seiner Zusage.
  "http://zeichen.localtest.me:3101",
].join(",");

export default defineConfig({
  testDir: "./e2e",
  // `pwa-spike` UND `zeichen-pwa`: eine Datei, die hier nicht steht, wird von
  // dieser Config nie gefunden — und von der normalen Config (testIgnore)
  // ausgeschlossen. Sie liefe dann in KEINEM Profil, ohne dass ein Tor rot wird.
  testMatch: /(pwa-spike|zeichen-pwa)\.spec\.ts/,
  workers: 1,
  use: {
    baseURL: "http://beta.localtest.me:3101",
    // Playwrights Standard-Browser ("chromium headless shell") ignoriert
    // --unsafely-treat-insecure-origin-as-secure — gemessen: isSecureContext
    // bleibt false, navigator.serviceWorker fehlt ganz. Der volle Chromium-
    // Channel respektiert das Flag. Benötigt `playwright install chromium`.
    channel: "chromium",
    launchOptions: {
      args: [
        `--unsafely-treat-insecure-origin-as-secure=${ORIGINS}`,
        "--disable-site-isolation-trials",
      ],
    },
  },
  webServer: {
    // Prod-Build, nicht `next dev`: gemessen scheitert der Offline-Reload unter
    // dev, weil die Chunk-URLs pro Request variieren und der SW-Cache damit
    // nicht greift. Erst der Prod-Build mit stabil gehashten Assets zeigt, ob
    // Offline wirklich trägt.
    command: "rm -rf ./.data/pwa-spike && next build && next start -p 3101",
    url: "http://localhost:3101/api/health",
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      AUTH_SECRET: "test-secret",
      // Für den "Portal bleibt sauber"-Test: die Zusage muss auf der
      // *eingeloggten* Portal-Seite gelten, nicht nur auf dem Login-Redirect.
      AUTH_DEV_LOGIN: "true",
      AUTH_COOKIE_DOMAIN: ".localtest.me",
      DATA_DIR: "./.data/pwa-spike",
      PORT: "3101",
      /*
       * ⛔ DIESE ZWEI ZEILEN GEHÖREN ZUSAMMEN, und die Reihenfolge ihrer Wirkung
       * ist scharf: `zeichenBootFehler()` (`src/app/m/zeichen/_lib/boot.ts`) meldet
       * genau dann, wenn `ZEICHEN_SW=1` gesetzt ist UND `SUITE_HOST_ZEICHEN` fehlt.
       * Die Meldung landet in `assertHostConfig`, das bei nichtleerer Liste WIRFT —
       * dann startet der Server gar nicht, und mit ihm fällt auch der
       * qr/beta-Teil dieser Suite aus. Wer `ZEICHEN_SW` hier setzt, setzt
       * `SUITE_HOST_ZEICHEN` mit.
       *
       * ⚠️ OHNE `ZEICHEN_SW=1` REGISTRIERT `RegisterSW` NICHTS (Plan-Abweichung zu
       * Spec §7.1, nach dem Muster von uavs `UAV_SW_MODUS`): der Cache-Zweig wäre
       * in E2E unprüfbar, und alle Fälle liefen in einen Timeout auf
       * `navigator.serviceWorker.ready`.
       */
      SUITE_HOST_ZEICHEN: "zeichen.localtest.me",
      ZEICHEN_SW: "1",
      // Die Admin-Gruppe aus DERSELBEN Quelle wie im Dev-Profil — zwei Literale
      // liefen auseinander, ohne dass ein Lauf rot würde.
      ...ZEICHEN_ENV,
    },
  },
});
