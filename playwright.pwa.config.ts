import { defineConfig } from "@playwright/test";
import { E2E_PORTS, pruefePortsFrei } from "./e2e/helpers/ports";

/**
 * Eigene Config für den PWA-Spike (Port 3101, parallel zur E2E-Config auf 3100).
 *
 * Grund für die Trennung: Service Worker laufen nur im sicheren Kontext.
 * `http://<modul>.localtest.me` ist keiner, also braucht Chrome hier
 * `--unsafely-treat-insecure-origin-as-secure`. Dieses Flag soll nicht in der
 * normalen E2E-Suite hängen — dort würde es reale Browser-Sicherheitszusagen
 * abschalten, die die anderen Tests mit prüfen.
 *
 * `e2e/einsatzbuch-reader.spec.ts` setzt denselben Schalter dennoch innerhalb der
 * normalen Suite: dort steht er per `test.use` auf Dateiebene, nicht in dieser
 * globalen Config, und gilt nur für den einen Origin des Readers — die anderen
 * Specs derselben Suite behalten ihre echte Sicherheitszusage.
 */
const ORIGINS = [
  `http://beta.localtest.me:${E2E_PORTS.pwa}`,
  `http://portal.localtest.me:${E2E_PORTS.pwa}`,
  `http://qr.localtest.me:${E2E_PORTS.pwa}`,
].join(",");

export default defineConfig({
  testDir: "./e2e",
  // `pwa-spike`: eine Datei, die hier nicht steht, wird von
  // dieser Config nie gefunden — und von der normalen Config (testIgnore)
  // ausgeschlossen. Sie liefe dann in KEINEM Profil, ohne dass ein Tor rot wird.
  testMatch: /pwa-spike\.spec\.ts/,
  workers: 1,
  use: {
    baseURL: `http://beta.localtest.me:${E2E_PORTS.pwa}`,
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
    command: `rm -rf ./.data/pwa-spike && next build && next start -p ${E2E_PORTS.pwa}`,
    url: `http://localhost:${E2E_PORTS.pwa}/api/health`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      AUTH_SECRET: "test-secret",
      // Für den "Portal bleibt sauber"-Test: die Zusage muss auf der
      // *eingeloggten* Portal-Seite gelten, nicht nur auf dem Login-Redirect.
      AUTH_DEV_LOGIN: "true",
      AUTH_COOKIE_DOMAIN: ".localtest.me",
      DATA_DIR: "./.data/pwa-spike",
      PORT: String(E2E_PORTS.pwa),
    },
  },
});

// Nennt den Halter eines belegten Ports (DRK-346, `e2e/helpers/ports.ts`).
pruefePortsFrei([E2E_PORTS.pwa]);
