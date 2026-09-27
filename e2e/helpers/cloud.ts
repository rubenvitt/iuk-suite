import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
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
 *    dort nicht vorgesehen; die vorinstallierten Browser laufen aber.
 *
 *    Genommen wird DERSELBE BROWSERTYP WIE IN DER CI (DRK-489): die Headless-
 *    Shell, und der volle Chromium nur für ein Profil mit `channel: "chromium"`
 *    (PWA) — genau Playwrights eigene Wahl. Bis DRK-489 lief alles im vollen
 *    Chromium; der fragt anders als die Shell von selbst `/favicon.ico` an, die
 *    Suite hat keins, und der 404 landet als „Failed to load resource" in der
 *    Konsole. Jeder Test mit leerer Fehlerliste war so nur in der Cloud rot.
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

/** Wo die Cloud-Umgebung ihre Browser ablegt. */
export const CLOUD_BROWSER = "/opt/pw-browsers";

/**
 * Die vorinstallierte Headless-Shell. Die Revision steht im Verzeichnisnamen
 * und hat keinen Symlink wie `CLOUD_CHROMIUM`, deshalb gesucht statt
 * geschrieben; fehlt sie, `undefined` (dann bleibt es beim vollen Chromium).
 */
export function cloudHeadlessShell(
  liste: (pfad: string) => string[] = (pfad) => (existsSync(pfad) ? readdirSync(pfad) : []),
  gibtEs: (pfad: string) => boolean = existsSync,
): string | undefined {
  const revision = liste(CLOUD_BROWSER)
    .filter((name) => name.startsWith("chromium_headless_shell-"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .at(-1);
  if (!revision) return undefined;
  const kandidaten = ["chrome-linux/headless_shell", "chrome-headless-shell-linux64/chrome-headless-shell"];
  return kandidaten.map((rel) => path.join(CLOUD_BROWSER, revision, rel)).find(gibtEs);
}

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
 * Vorhandene `args` (etwa die des PWA-Profils) bleiben stehen. `executablePath`
 * schlägt `channel`, deshalb liest der Helfer `channel` selbst und wählt danach.
 */
export function cloudTauglich(
  config: PlaywrightTestConfig,
  cloud = istCloudSession(),
  findeShell: () => string | undefined = cloudHeadlessShell,
): PlaywrightTestConfig {
  if (!cloud) return config;
  const use = config.use ?? {};
  const start = use.launchOptions ?? {};
  const browser = use.channel === "chromium" ? CLOUD_CHROMIUM : (findeShell() ?? CLOUD_CHROMIUM);
  return {
    ...config,
    use: {
      ...use,
      launchOptions: {
        ...start,
        executablePath: browser,
        args: [...(start.args ?? []), OHNE_PROXY],
      },
    },
  };
}
