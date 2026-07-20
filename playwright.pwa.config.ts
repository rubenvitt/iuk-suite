import { defineConfig } from "@playwright/test";

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
].join(",");

export default defineConfig({
  testDir: "./e2e",
  testMatch: /pwa-spike\.spec\.ts/,
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
    },
  },
});
