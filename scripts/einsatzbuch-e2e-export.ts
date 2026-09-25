import { readFileSync } from "node:fs";
import { baueExport, type Exportauftrag } from "../apps/einsatzbuch/src/logik/export";
import { ausBase64 } from "@/app/m/einsatzbuch/_lib/kern/bytes";
import type { Block } from "@/app/m/einsatzbuch/_lib/kern/format";

/**
 * Stufe 6, Task 11: der Export des Ende-zu-Ende-Laufs ohne Klick in der WKWebView — mit
 * `baueExport` aus `apps/einsatzbuch/src/logik/export.ts`, also demselben Modul, das der
 * Export-Dialog der Desktop-App ruft (`ExportDialog.tsx`, Funktion `speichern`).
 *
 *   pnpm exec tsx scripts/einsatzbuch-e2e-export.ts <auftrag.json>
 *
 * Den Alias `@kern/*`, den `export.ts` importiert, löst `tsx` über `paths` in der
 * `tsconfig.json` des Repos auf (derselbe Kernordner wie in `apps/einsatzbuch/tsconfig.json`);
 * nur so prüft auch `pnpm typecheck` dieses Skript samt `export.ts`.
 *
 * Die Auftragsdatei schreibt NUR der Debug-Treiber `apps/einsatzbuch/src-tauri/examples/e2e_lauf.rs`
 * (Schritt 5b) und löscht sie danach wieder:
 * `{ bloecke: Block[], schluessel: { "<block>": CEK }, auftrag: { umfang, gewaehlt, anker, … } }`.
 * Das Kennwort kommt aus `E2E_EXPORT_KENNWORT` (Vorgabe `VORGABE_KENNWORT`).
 *
 * Auf stdout steht NUR das Exportdatei-JSON — der Treiber speichert es unverändert mit
 * `export::speichere_export`. Hinweise gehen nach stderr; nie ein CEK und nie das Kennwort.
 */
const VORGABE_KENNWORT = "e2e-export-kennwort";

interface Auftragsdatei {
  bloecke: Block[];
  schluessel: Record<string, string>;
  auftrag: Omit<Exportauftrag, "bloecke" | "ceks">;
}

async function main(): Promise<void> {
  const datei = process.argv[2];
  if (!datei) throw new Error("Aufruf: pnpm exec tsx scripts/einsatzbuch-e2e-export.ts <auftrag.json>");
  const kennwort = process.env.E2E_EXPORT_KENNWORT || VORGABE_KENNWORT;
  const eingabe = JSON.parse(readFileSync(datei, "utf8")) as Auftragsdatei;
  if (!Array.isArray(eingabe.bloecke) || eingabe.bloecke.length === 0) throw new Error("Der Auftrag enthält keine Blöcke.");

  const ceks = new Map<number, Uint8Array>();
  try {
    for (const [block, text] of Object.entries(eingabe.schluessel)) ceks.set(Number(block), ausBase64(text));
    const { datei: exportdatei, dateiname } = await baueExport({ ...eingabe.auftrag, bloecke: eingabe.bloecke, ceks }, kennwort);
    const k = exportdatei.kopf;
    console.error(`baueExport: umfang=${k.umfang} von=${k.von} bis=${k.bis} anzahl=${k.anzahl} erstellt=${k.erstellt} quelle=${k.quelle} vorgeschlagen=${dateiname}`);
    process.stdout.write(JSON.stringify(exportdatei));
  } finally {
    for (const cek of ceks.values()) cek.fill(0);
    ceks.clear();
  }
}

// Kein Top-Level-`await`: `tsx` übersetzt dieses Skript nach CJS, das kennt es nicht.
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
