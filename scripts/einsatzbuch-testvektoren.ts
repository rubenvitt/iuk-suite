import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TESTEINSAETZE, TESTVERSIEGELT } from "@/app/m/einsatzbuch/_lib/kern/testvektoren/einsaetze";
import { erzeugeErwartung, neueEingaben, type Testeingaben } from "@/app/m/einsatzbuch/_lib/kern/testvektoren/erzeuge";

/**
 * Schreibt die Testvektoren des Einsatzbuchs neu (Spec §9.1).
 *   pnpm exec tsx scripts/einsatzbuch-testvektoren.ts        → erwartet.json aus eingaben.json
 *   pnpm exec tsx scripts/einsatzbuch-testvektoren.ts --neu  → auch neue Schlüssel und Nonces
 * `--neu` nur bei einem bewussten Formatwechsel: Die Rust-Seite vergleicht gegen genau diese Dateien.
 * Der private Schlüssel in `eingaben.json` ist ein TESTSCHLÜSSEL und schützt nichts.
 */
const ordner = path.join(process.cwd(), "src/app/m/einsatzbuch/_lib/kern/testvektoren");
const neu = process.argv.includes("--neu");

async function main() {
  const eingaben: Testeingaben = neu
    ? await neueEingaben(TESTEINSAETZE, TESTVERSIEGELT)
    : JSON.parse(readFileSync(path.join(ordner, "eingaben.json"), "utf8"));
  if (neu) writeFileSync(path.join(ordner, "eingaben.json"), JSON.stringify(eingaben, null, 2) + "\n");
  writeFileSync(path.join(ordner, "erwartet.json"), JSON.stringify(await erzeugeErwartung(eingaben), null, 2) + "\n");
  console.log(`Testvektoren geschrieben${neu ? " (neue Schlüssel)" : ""}: ${ordner}`);
}

main().catch((fehler) => { console.error(fehler); process.exit(1); });
