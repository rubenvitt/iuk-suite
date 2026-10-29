import { defineConfig } from "@playwright/test";

import { cloudTauglich } from "./e2e/helpers/cloud";
import { LAGERBUCH_ENV, LAGERBUCH_HOST } from "./e2e/helpers/lagerbuch";
import { E2E_PORTS, pruefePortsFrei } from "./e2e/helpers/ports";
import { nextServerBefehl, VORGEBAUT_ENV } from "./e2e/helpers/server";

/**
 * Erzeugt die Anleitungen der Suite (IDA-291): `pnpm anleitung:lagerbuch`. Kein Test, sondern ein
 * Generator — deshalb `e2e/anleitung/*.anleitung.ts` statt `*.spec.ts`: der e2e-Lauf und
 * `e2e/gruppen.json` sehen ihn nicht. Die CI fährt ihn trotzdem (`ci.yml`, Job `anleitung`), damit
 * eine Änderung an der Helfer-Ansicht ihn nicht still bricht.
 *
 * Eigene Datenbank mit den lokalen Demodaten (`pnpm seed:lokal lagerbuch`) statt der e2e-Fixtures:
 * die Bilder sollen RTW 1 und Kompressen zeigen, nicht „ZZZ E2E Last 117". Siebter Platz im
 * Zehnerblock der Arbeitskopie (`e2e/helpers/ports.ts`); die Einsatzbuch-App belegt +4 und +5.
 */
const PORT = E2E_PORTS.web + 6;

export default cloudTauglich(defineConfig({
  testDir: "./e2e/anleitung",
  testMatch: /\.anleitung\.ts$/,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://${LAGERBUCH_HOST}:${PORT}`,
    // Ein mittelgroßes Handy; die Bilder kommen doppelt aufgelöst, damit der Druck scharf bleibt.
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    colorScheme: "light",
  },
  webServer: {
    command: `rm -rf ./.data/anleitung && pnpm exec tsx scripts/seed-lokal.ts lagerbuch && ${nextServerBefehl(PORT)}`,
    url: `http://${LAGERBUCH_HOST}:${PORT}/`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      AUTH_SECRET: "test-secret",
      AUTH_COOKIE_DOMAIN: ".localtest.me",
      DATA_DIR: "./.data/anleitung",
      PORT: String(PORT),
      NODE_ENV: "development", ...VORGEBAUT_ENV, // DRK-415: `e2e/helpers/server.ts`
      POCKET_ID_API_KEY: "",
      SUITE_RUECKMELDUNG_URL: "",
      ...LAGERBUCH_ENV,
    },
  },
  reporter: process.env.CI ? "list" : undefined,
}));

pruefePortsFrei([PORT]);
