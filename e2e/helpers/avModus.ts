import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Der Umschalter fuer den Fake-clamd aus `scripts/fake-clamd.mjs` (Spec §6.8,
 * Plan-Festlegung H).
 *
 * WARUM DER PFAD HIER STEHT UND NICHT IN `playwright.config.ts`: der Fake LIEST
 * die Modusdatei (per Verbindung, nicht beim Start), der Test SCHREIBT sie —
 * zwei Prozesse, und `webServer.env` erreicht nur den Serverprozess, nicht den
 * Testprozess. Ein `process.env.FAKE_CLAMD_MODUS_DATEI` waere hier deshalb
 * `undefined`, und ein eigener Literalpfad waere eine ZWEITE Wahrheit: weichen
 * die Pfade ab, schreibt der Test ins Leere, der Fake bleibt auf `ok`, und der
 * Lauf ist rennabhaengig gruen. Also genau eine Konstante — und
 * `playwright.config.ts` importiert sie von hier.
 *
 * AUSSERHALB von `./.data/e2e`: der next-dev-Eintrag loescht dieses
 * Verzeichnis bei jedem Start (`rm -rf ./.data/e2e`). Laege die Modusdatei
 * darin, verschwaende sie mitten im Lauf.
 *
 * NUR `node:fs` und `node:path` — kein `@playwright/test`. Diese Datei wird von
 * `playwright.config.ts` importiert und damit mittelbar auch von einem Vitest,
 * der die Konfiguration liest.
 */
export const AV_MODUS_DATEI = "./.data/fake-clamd-modus-e2e";

/**
 * Die vier Modi des Fakes. `scripts/fake-clamd.mjs` fuehrt dieselbe Liste, und
 * `_lib/devAufbau.test.ts` vergleicht beide: ein Modus, den der Fake nicht
 * kennt, gilt dort als `error` — der Test bekaeme fail-closed, wo er `found`
 * bestellt hat.
 */
export const AV_MODI = ["ok", "found", "error", "haengt"] as const;

export type AvModus = (typeof AV_MODI)[number];

/**
 * Schaltet den Fake-clamd um. **Synchron**, mit Absicht: ein Playwright-Test
 * navigiert unmittelbar nach dem Aufruf weiter, und ein noch fliegender Schreib
 * waere ein Rennen gegen den ersten Scan des naechsten Uploads.
 *
 * Wirkt ohne Neustart des Fakes — er liest die Datei bei JEDER Verbindung. Ein
 * Lauf braucht `ok` und `error` im selben Prozess (`workers: 1`), ein
 * Startwert allein macht die fail-closed-Zusage aus §6.3 unpruefbar.
 *
 * `datei` setzt ausschliesslich der Test dieses Helfers, damit er nicht in eine
 * eventuell laufende E2E-Sitzung hineinschreibt. Produktiv gilt immer
 * `AV_MODUS_DATEI` — eine Quelle.
 */
export function setzeAvModus(modus: AvModus, datei: string = AV_MODUS_DATEI): void {
  mkdirSync(path.dirname(datei), { recursive: true });
  writeFileSync(datei, `${modus}\n`, "utf8");
}
