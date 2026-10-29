import { defineConfig } from "@playwright/test";

import { cloudTauglich } from "../../../e2e/helpers/cloud";
import { E2E_PORTS } from "../../../e2e/helpers/ports";

/**
 * Erzeugt die Anwenderanleitung für den Einsatzbuch-Rechner (IDA-289): `pnpm anleitung`.
 * Kein Test, sondern ein Generator — deshalb nicht unter `e2e/`. Die CI fährt ihn trotzdem
 * (`einsatzbuch.yml`, Job `oberflaeche`), damit eine Änderung an der Erfassung ihn nicht still bricht.
 * Sechster Platz im Zehnerblock der Arbeitskopie; `e2e` der App belegt +4.
 */
const PORT = E2E_PORTS.web + 5;

export default cloudTauglich(defineConfig({
  testDir: ".",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Fenstergröße eines kleinen Laptops (16:9); die Bilder kommen doppelt aufgelöst, damit der
    // Druck scharf bleibt. `--lang` braucht das Datumsfeld, `locale` allein lässt es amerikanisch.
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    launchOptions: { args: ["--lang=de-DE"] },
  },
  webServer: {
    command: `pnpm vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    cwd: "..",
    reuseExistingServer: false,
    timeout: 120_000,
  },
}));
