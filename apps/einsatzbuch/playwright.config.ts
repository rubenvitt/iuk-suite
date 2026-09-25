import { defineConfig, devices } from "@playwright/test";

import { E2E_PORTS } from "../../e2e/helpers/ports";

/** Fünfter Platz im Zehnerblock der Arbeitskopie; die Suite belegt +0 bis +3. */
const PORT = E2E_PORTS.web + 4;

export default defineConfig({
  testDir: "e2e",
  // Großzügig, denn diese Suite fährt gegen einen Vite-Dev-Server neben der Suite selbst —
  // unter Last (mehrere gleichzeitige Läufe auf demselben Rechner) ist ein knapper Timeout kein
  // Befund, sondern nur Rauschen.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: `pnpm vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
