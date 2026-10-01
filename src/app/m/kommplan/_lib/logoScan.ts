import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { scanne, type AvErgebnis, type AvKonfig } from "@/core/av/scanner";

/**
 * VIRENSCAN DES LOGOS (Spec §4.4; Umsetzungsplan Phase 4, Entscheidung 4). Muster `aufgaben/_lib/scan.ts`:
 * clamd liest die Datei selbst (`zSCAN <pfad>`), `core/av` bleibt unverändert. Anders als dort gibt es
 * keine Warteschlange — ein Logo wird im Upload SYNCHRON geprüft und erst danach gespeichert. Die Bytes
 * liegen dafür kurz als Wegwerfdatei unter `$DATA_DIR/kommplan-scan` (Volume `kommplan_scan`, das clamd
 * lesend sieht, `compose.yaml`) und werden im `finally` gelöscht, auch bei Fehler oder Befund.
 *
 * EIGENE VARIABLEN (`KOMMPLAN_AV_*`), nie die von `files` oder `aufgaben` — eine geteilte Zahl wäre eine
 * Kopplung, die niemand gewählt hat (Kopfkommentar `aufgaben/_lib/scan.ts`). Den prozessweiten Netzhaken
 * registriert `src/instrumentation.ts` schon. Wirft nie: jeder Fehler ist `{ art: "error" }` (fail-closed).
 */
const VORGABE = { host: "clamav", port: 3310, timeoutMs: 30_000 } as const;
type Env = Record<string, string | undefined>;

function ganzzahl(roh: string | undefined, vorgabe: number): number {
  const t = roh?.trim() ?? "";
  return /^[+-]?\d+$/.test(t) ? Number(t) : vorgabe; // ungültig → Vorgabe; eine kaputte Zahl fängt `scanne` fail-closed ab
}

export function avKonfigAusEnv(env: Env = process.env): AvKonfig {
  return {
    host: env.KOMMPLAN_AV_HOST?.trim() || VORGABE.host,
    port: ganzzahl(env.KOMMPLAN_AV_PORT, VORGABE.port),
    timeoutMs: ganzzahl(env.KOMMPLAN_AV_TIMEOUT_MS, VORGABE.timeoutMs),
  };
}

/** Absolut: clamd bekommt den Pfad und hat ein anderes Arbeitsverzeichnis als der Node-Prozess. */
export function scanWurzel(env: Env = process.env): string {
  return resolve(env.DATA_DIR ?? "./.data", "kommplan-scan");
}

export async function scanneLogo(bytes: Uint8Array, konfig: AvKonfig = avKonfigAusEnv()): Promise<AvErgebnis> {
  const ordner = scanWurzel();
  const pfad = join(ordner, randomUUID()); // nie aus einem Dateinamen: der Upload-Name ist Eingabe, kein Pfad
  try {
    await mkdir(ordner, { recursive: true, mode: 0o750 });
    await writeFile(pfad, bytes, { mode: 0o640, flag: "wx" });
    const r = await scanne(pfad, konfig);
    // `scanne` wirft bei Befund und Verbindungsfehler nicht, es gibt sie zurück: hier ins Log, sonst erführe der
    // Betrieb weder von einem Fund noch von einem dauerhaft fehlenden Scanner (Muster aufgaben/_lib/scan.ts).
    if (r.art === "infected") console.error(`[kommplan][logo-scan] Fund im Logo-Upload: ${r.signatur}`);
    if (r.art === "error") console.error(`[kommplan][logo-scan] Prüfung nicht möglich: ${r.grund}`);
    return r;
  } catch (fehler) {
    const grund = fehler instanceof Error ? fehler.message : String(fehler);
    console.error(`[kommplan][logo-scan] Prüfung nicht möglich: ${grund}`);
    return { art: "error", grund };
  } finally {
    await unlink(pfad).catch(() => {});
  }
}
