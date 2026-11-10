import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
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
 *    `--proxy-server=direct://`, NICHT `--no-proxy-server` (DRK-489): die
 *    Headless-Shell hält sich bei `--no-proxy-server` nur für HTTP daran, der
 *    WebSocket geht weiter über den Proxy (gemessen: 502, im vollen Chromium
 *    offen). `direct://` öffnet ihn in beiden.
 *
 * 3. `*.localtest.me` LÖST NICHT AUF (IDA-374). Der Resolver des Containers
 *    beantwortet öffentliche Namen, verwirft aber Antworten auf Loopback-
 *    Adressen — dauerhaft, gesehen am 31.10., 08.11. und 10.11.2026. Der
 *    Webserver-Start wartete 180 s auf `feedback.localtest.me/login` und brach
 *    mit „Timed out waiting from config.webServer" ab. ⚠️ Klingt nach einem
 *    langsamen Server, ist die Namensauflösung. Abhilfe ohne root und ohne
 *    `/etc/hosts` (der Eintrag verschwand mitten in der Sitzung):
 *    `loopback-dns.cjs` im Lauf und per `NODE_OPTIONS` in Workern und Server,
 *    `--host-resolver-rules` im Browser.
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
export const OHNE_PROXY = "--proxy-server=direct://";

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
  aufloesen: () => void = loopbackDnsEinrichten,
): PlaywrightTestConfig {
  if (!cloud) return config;
  aufloesen();
  return { ...config, use: cloudTauglichUse(config.use ?? {}, cloud, findeShell) };
}

/**
 * Dasselbe für ein `test.use` im Spec (DRK-503). Playwright führt Optionen nicht
 * zusammen: ein `test.use({ launchOptions })` ERSETZT die der Config samt
 * Cloud-Browser, und der Lauf sucht wieder die nicht installierte Revision.
 * Wer im Spec Startoptionen oder `channel` setzt, reicht sie deshalb hier durch;
 * `scripts/e2e-cloud.test.ts` verlangt das.
 */
export function cloudTauglichUse<T extends Use>(
  use: T,
  cloud = istCloudSession(),
  findeShell: () => string | undefined = cloudHeadlessShell,
): T {
  if (!cloud) return use;
  const start = use.launchOptions ?? {};
  const browser = use.channel === "chromium" ? CLOUD_CHROMIUM : (findeShell() ?? CLOUD_CHROMIUM);
  return {
    ...use,
    launchOptions: {
      ...start,
      executablePath: browser,
      args: [...(start.args ?? []), OHNE_PROXY, LOOPBACK_IM_BROWSER],
    },
  };
}

type Use = NonNullable<PlaywrightTestConfig["use"]>;

/** Das Argument, das Abweichung 3 im Browser behebt. */
export const LOOPBACK_IM_BROWSER = "--host-resolver-rules=MAP *.localtest.me 127.0.0.1, MAP localtest.me 127.0.0.1";

/** Die Datei, die Abweichung 3 in Node behebt (`dns.lookup` umgebogen). */
export const LOOPBACK_DNS = path.join(__dirname, "loopback-dns.cjs");

/**
 * Abweichung 3 in Node: im eigenen Prozess (der Lauf prüft die Webserver-URL,
 * die `request`-Fixture spricht aus ihm) und über `NODE_OPTIONS` in jedem
 * Kindprozess — Worker und `webServer` erben die Umgebung beim Start, und beide
 * entstehen erst nach dem Laden der Konfiguration. Wiederholt aufgerufen
 * ändert sich nichts mehr.
 */
export function loopbackDnsEinrichten(
  env: Record<string, string | undefined> = process.env,
  laden: (pfad: string) => unknown = createRequire(LOOPBACK_DNS),
): void {
  laden(LOOPBACK_DNS);
  env.NODE_OPTIONS = mitPreload(env.NODE_OPTIONS);
}

/** `NODE_OPTIONS` mit `--require` auf `LOOPBACK_DNS`, ohne Doppel. */
export function mitPreload(optionen: string | undefined, datei = LOOPBACK_DNS): string {
  const bisher = optionen?.trim() ?? "";
  if (bisher.includes(datei)) return bisher;
  const eintrag = /\s/.test(datei) ? `--require "${datei}"` : `--require ${datei}`;
  return bisher ? `${bisher} ${eintrag}` : eintrag;
}
