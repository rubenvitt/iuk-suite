import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { scanne, type AvErgebnis, type AvKonfig } from "@/core/av/scanner";

/**
 * VIRENSCAN DER VERTRAGSDATEIEN (IDA-343): Vorlage der Leitung, von der Leitung abgelegte Verträge und Dateien von
 * der Statusseite. Muster `kommplan/_lib/logoScan.ts`: clamd liest eine Wegwerfdatei per `zSCAN`, synchron im
 * Upload, gelöscht im `finally`; erst danach landen die Bytes in `gemeinschaft.db`. Fail-closed: nur `clean` gibt frei.
 *
 * Die Wegwerfdatei liegt in einem Unterordner `gemeinschaft` des Scan-Volumes `kommplan_scan` (`compose.yaml`,
 * `/data/kommplan-scan`, für clamd lesend gemountet). Bewusst kein zweites Volume: es hält nur Sekunden lang
 * Wegwerfdateien, und neue Mount-Zeilen verschöben Zeilenanker anderer Dateien in `compose.yaml`.
 * EIGENE VARIABLEN (`GEMEINSCHAFT_AV_*`), nie die eines anderen Moduls.
 */
const VORGABE = { host: "clamav", port: 3310, timeoutMs: 30_000 } as const;
type Env = Record<string, string | undefined>;

function ganzzahl(roh: string | undefined, vorgabe: number): number {
  const t = roh?.trim() ?? "";
  return /^[+-]?\d+$/.test(t) ? Number(t) : vorgabe;
}

export function avKonfigAusEnv(env: Env = process.env): AvKonfig {
  return {
    host: env.GEMEINSCHAFT_AV_HOST?.trim() || VORGABE.host,
    port: ganzzahl(env.GEMEINSCHAFT_AV_PORT, VORGABE.port),
    timeoutMs: ganzzahl(env.GEMEINSCHAFT_AV_TIMEOUT_MS, VORGABE.timeoutMs),
  };
}

/** Absolut: clamd hat ein anderes Arbeitsverzeichnis als der Node-Prozess. */
export function scanWurzel(env: Env = process.env): string {
  return resolve(env.DATA_DIR ?? "./.data", "kommplan-scan", "gemeinschaft");
}

export async function scanneVertrag(bytes: Uint8Array, konfig: AvKonfig = avKonfigAusEnv()): Promise<AvErgebnis> {
  const ordner = scanWurzel();
  const pfad = join(ordner, randomUUID()); // nie aus dem Dateinamen: der ist Eingabe, kein Pfad
  try {
    await mkdir(ordner, { recursive: true, mode: 0o750 });
    await writeFile(pfad, bytes, { mode: 0o640, flag: "wx" });
    const r = await scanne(pfad, konfig);
    if (r.art === "infected") console.error(`[gemeinschaft][vertrag-scan] Fund: ${r.signatur}`);
    if (r.art === "error") console.error(`[gemeinschaft][vertrag-scan] Prüfung nicht möglich: ${r.grund}`);
    return r;
  } catch (fehler) {
    const grund = fehler instanceof Error ? fehler.message : String(fehler);
    console.error(`[gemeinschaft][vertrag-scan] Prüfung nicht möglich: ${grund}`);
    return { art: "error", grund };
  } finally {
    await unlink(pfad).catch(() => {});
  }
}

/** Der Satz für die Oberfläche, oder `null` bei `clean`. */
export function scanSatz(r: AvErgebnis): string | null {
  if (r.art === "clean") return null;
  if (r.art === "infected") return "In dieser Datei wurde Schadsoftware gefunden. Sie wurde nicht gespeichert.";
  return "Die Virenprüfung ist gerade nicht möglich. Bitte später noch einmal versuchen.";
}
