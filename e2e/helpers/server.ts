import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * GEGEN WELCHEN NEXT-SERVER DIE SUITE FÄHRT (DRK-415) — `next dev` oder einen
 * vorgebauten Stand.
 *
 * `E2E_VORGEBAUT=1` fährt `next start` gegen das `.next` eines vorigen
 * `next build`; ohne die Variable bleibt es bei `next dev`. Die CI setzt sie
 * (`.github/workflows/ci.yml`, Job `e2e`): der Job `e2e-build` baut EINMAL, jede
 * Gruppe lädt das Ergebnis. Unter `next dev` übersetzte jede der Gruppen die
 * Routen, die sie anfasst, beim ersten Treffer selbst — gemessen in DRK-408 groß
 * genug, um eine Umverteilung von 96 s Fallzeit ganz aufzufressen, und die
 * Ursache der Fallen 10 und 12 in `CLAUDE.md`.
 *
 * LOKAL BLEIBT `next dev` DIE VORGABE: dort zählt, dass eine Änderung ohne
 * Build-Schritt im nächsten Lauf steht. Wer lokal den CI-Weg nachfahren will,
 * nimmt `pnpm e2e:gebaut` (baut und fährt).
 *
 * ⚠️ DER GEBAUTE STAND IST EIN ANDERES PROGRAMM, NICHT NUR EIN SCHNELLERES.
 * `next build` backt `process.env.NODE_ENV` als `"production"` in den
 * Servercode. Ohne `SUITE_LOKAL_HTTP=1` (`src/core/lokalHttp.ts`) trügen die
 * Anmelde-Cookies `Secure` — Chromium verwirft sie über
 * `http://*.localtest.me` still — und Modul-Links zeigten auf die
 * Produktionshosts. `SUITE_SEED=1` holt den Boot-Seed zurück, den unter
 * `next dev` `NODE_ENV=development` auslöst (`shouldSeed` in `core/bootstrap`).
 *
 * NUR `node:*` — dieselbe Regel wie `ports.ts`: die Konfiguration importiert
 * diese Datei, und Vitest importiert die Konfiguration.
 */
export const E2E_VORGEBAUT = process.env.E2E_VORGEBAUT === "1";

/** Die Umgebung, die der gebaute Stand zusätzlich braucht — unter `next dev` leer. */
export const VORGEBAUT_ENV: Readonly<Record<string, string>> = E2E_VORGEBAUT
  ? { SUITE_LOKAL_HTTP: "1", SUITE_SEED: "1" }
  : {};

/**
 * Der Startbefehl des Next-Servers.
 *
 * `NODE_ENV=production` STEHT IM BEFEHL, NICHT IN `webServer.env`: die Seeds
 * davor (`scripts/seed-lokal.ts`) verweigern `production`, und `webServer.env`
 * gilt für die ganze Befehlskette. `next start` übernähme sonst das
 * `development` aus `webServer.env` und liefe als Zwitter — gebaute Bundles
 * mit Entwicklungs-Laufzeit.
 */
export function nextServerBefehl(port: number, wurzel = process.cwd()): string {
  if (!E2E_VORGEBAUT) return `next dev -p ${port}`;
  pruefeBuild(wurzel);
  return `NODE_ENV=production next start -p ${port}`;
}

function pruefeBuild(wurzel: string): void {
  const buildId = join(wurzel, ".next", "BUILD_ID");
  if (!existsSync(buildId)) {
    throw new Error(
      "E2E_VORGEBAUT=1, aber es gibt keinen gebauten Stand (.next/BUILD_ID fehlt). " +
        "Lokal: `pnpm e2e:gebaut`. In der CI kommt er aus dem Job `e2e-build`.",
    );
  }
  /*
   * Ein VERALTETER Build ist lokal die eigentliche Falle: die Suite prüft dann
   * still den Stand von gestern. Nur eine Warnung und nur außerhalb der CI —
   * dort entpackt der Job das Artefakt mit den Zeitstempeln des Build-Jobs, und
   * die sind älter als der frische Checkout daneben.
   */
  if (process.env.CI) return;
  const gebaut = statSync(buildId).mtimeMs;
  const neuer = neuesteAenderung(join(wurzel, "src"));
  if (neuer > gebaut) {
    console.warn(
      "⚠️ E2E_VORGEBAUT=1: `src/` ist neuer als der Build in `.next` — die Suite prüft einen " +
        "alten Stand. `pnpm e2e:gebaut` baut vorher neu.",
    );
  }
}

function neuesteAenderung(verzeichnis: string): number {
  let neueste = 0;
  for (const name of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, name);
    const info = statSync(pfad);
    neueste = Math.max(neueste, info.isDirectory() ? neuesteAenderung(pfad) : info.mtimeMs);
  }
  return neueste;
}
