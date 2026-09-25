import { readFileSync } from "node:fs";
import { oeffneBlock } from "@/app/m/einsatzbuch/_lib/kern/block";
import { ausBase64 } from "@/app/m/einsatzbuch/_lib/kern/bytes";
import type { Block } from "@/app/m/einsatzbuch/_lib/kern/format";
import { pruefeKette } from "@/app/m/einsatzbuch/_lib/kern/kette";

/**
 * Stufe 5, Task 12 (Entscheidung 16): belegt „Die Verwaltung zeigt entschlüsselt“ ohne Klick in
 * der WKWebView — mit demselben Kernaufruf, den die Verwaltung der Desktop-App nutzt
 * (`apps/einsatzbuch/src/verwaltung/useVerwaltung.ts`, Funktion `oeffne`): `pruefeKette` über
 * alle Blöcke, dann `oeffneBlock` je Block mit dem von der Suite freigegebenen CEK.
 *
 *   pnpm exec tsx scripts/einsatzbuch-e2e-oeffnen.ts <freigabe.json>
 *
 * Die Datei schreibt NUR der Debug-Treiber `apps/einsatzbuch/src-tauri/examples/e2e_lauf.rs`
 * (Schritt 5) und löscht sie danach wieder: `{ bloecke: Block[], schluessel: { "<block>": CEK } }`.
 * Ausgegeben werden nur Blocknummer, Umgebung, Einsatznummer und Stichwort — nie ein CEK und
 * kein weiterer Klartext.
 */
interface Freigabe {
  bloecke: Block[];
  schluessel: Record<string, string>;
}

async function main(): Promise<void> {
  const datei = process.argv[2];
  if (!datei) throw new Error("Aufruf: pnpm exec tsx scripts/einsatzbuch-e2e-oeffnen.ts <freigabe.json>");
  const freigabe = JSON.parse(readFileSync(datei, "utf8")) as Freigabe;
  if (!Array.isArray(freigabe.bloecke) || freigabe.bloecke.length === 0) throw new Error("Die Freigabe enthält keine Blöcke.");

  const kette = await pruefeKette(freigabe.bloecke);
  if (!kette.ok) throw new Error(`Kette ungültig bei Block ${kette.block}: ${kette.grund}`);
  console.log(`Kette gültig: ${freigabe.bloecke.length} Block/Blöcke, vollständig ab Block 1: ${kette.vollstaendig ? "ja" : "nein"}`);

  let fehler = 0;
  for (const block of freigabe.bloecke) {
    const n = block.kopf.block;
    const text = freigabe.schluessel[String(n)];
    if (text === undefined) {
      console.error(`Block ${n}: kein CEK freigegeben`);
      fehler += 1;
      continue;
    }
    const cek = ausBase64(text);
    try {
      const einsatz = await oeffneBlock(block, cek);
      console.log(`Block ${n} (${block.kopf.umgebung}): nummer=${einsatz.nummer} stichwort=${einsatz.stichwort}`);
    } catch (e) {
      console.error(`Block ${n}: lässt sich nicht öffnen (${e instanceof Error ? e.message : String(e)})`);
      fehler += 1;
    } finally {
      cek.fill(0);
    }
  }
  if (fehler > 0) throw new Error(`${fehler} Block/Blöcke nicht geöffnet.`);
}

// Kein Top-Level-`await`: `tsx` übersetzt dieses Skript nach CJS, das kennt es nicht.
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
