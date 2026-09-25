import { existsSync } from "node:fs";
import type { PlaywrightTestConfig } from "@playwright/test";

/**
 * PLAYWRIGHT IN EINER CLOUD-SESSION (Claude Code on the web) — DRK-473.
 *
 * Dieselbe Klasse wie `scripts/cloud-lfs.sh` (DRK-368): die Umgebung weicht an
 * zwei Stellen ab, und beide scheitern, BEVOR ein Test etwas prüft.
 *
 * 1. DER BROWSER FEHLT. Playwright erwartet die Revision aus seinem
 *    `browsers.json` (heute `chromium_headless_shell-1243`), vorinstalliert ist
 *    unter `/opt/pw-browsers` eine ältere (`-1194`). `playwright install` ist
 *    dort nicht vorgesehen; der vorinstallierte volle Chromium läuft aber.
 *
 * 2. CHROMIUM SCHICKT `*.localtest.me` ÜBER DEN AGENT-PROXY. Er liest
 *    `HTTPS_PROXY`/`NO_PROXY` aus der Umgebung, und `NO_PROXY` nennt
 *    `localhost`/`127.0.0.1`, aber nicht `.localtest.me`. Der HMR-WebSocket
 *    bekommt 502, die Anmeldeseite hydriert nie, der Dev-Login fällt in ein
 *    natives Formular-GET zurück — und JEDER `devLogin` endet nach 45 s in einem
 *    Timeout auf `/login`. ⚠️ Die Meldung klingt nach einem Anmeldefehler und
 *    ist keiner. Die Suite spricht nur mit eigenen Servern auf 127.0.0.1, also
 *    braucht der Browser keinen Proxy.
 *
 * Außerhalb der Cloud (lokal, CI) bleibt die Konfiguration UNVERÄNDERT: dort
 * gilt, was Playwright selbst installiert hat.
 *
 * NUR `node:*` zur Laufzeit — die Konfigurationen werden auch von Vitest
 * importiert (dieselbe Regel wie `ports.ts`); der Typ-Import verschwindet.
 */

/** Der vorinstallierte Chromium der Cloud-Umgebung (ein Symlink auf die Revision). */
export const CLOUD_CHROMIUM = "/opt/pw-browsers/chromium";

/** Das Argument, das Abweichung 2 behebt. */
export const OHNE_PROXY = "--no-proxy-server";

export function istCloudSession(
  env: Record<string, string | undefined> = process.env,
  gibtEs: (pfad: string) => boolean = existsSync,
): boolean {
  return env.CLAUDE_CODE_REMOTE === "true" && gibtEs(CLOUD_CHROMIUM);
}

/**
 * Setzt in einer Cloud-Session Browser und Proxy-Verzicht in `use.launchOptions`.
 * Vorhandene `args` (etwa die des PWA-Profils) bleiben stehen, und
 * `executablePath` schlägt `channel`.
 */
export function cloudTauglich(config: PlaywrightTestConfig, cloud = istCloudSession()): PlaywrightTestConfig {
  if (!cloud) return config;
  const use = config.use ?? {};
  const start = use.launchOptions ?? {};
  return {
    ...config,
    use: {
      ...use,
      launchOptions: {
        ...start,
        executablePath: CLOUD_CHROMIUM,
        args: [...(start.args ?? []), OHNE_PROXY],
      },
    },
  };
}
