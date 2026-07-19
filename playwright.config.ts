import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Der PWA-Spike braucht Chrome-Flags für den sicheren Kontext und läuft
  // deshalb in playwright.pwa.config.ts (eigener Port).
  testIgnore: /pwa-spike\.spec\.ts/,
  workers: 1,
  use: { baseURL: "http://portal.localtest.me:3100" },
  webServer: {
    command: "rm -rf ./.data/e2e && next dev -p 3100",
    url: "http://localhost:3100/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      AUTH_SECRET: "test-secret",
      AUTH_DEV_LOGIN: "true",
      AUTH_COOKIE_DOMAIN: ".localtest.me",
      DATA_DIR: "./.data/e2e",
      PORT: "3100",
      NODE_ENV: "development",
    },
  },
});
