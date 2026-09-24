import { sha256Hex, utf8 } from "./bytes";
import { GENESIS, type Block } from "./format";
import { kanonisch } from "./kanonisch";

/** SHA-256 über das kanonische JSON von Kopf, IV, Chiffrat und Umschlag — nie über Klartext (Spec §3.2). */
export async function blockHash(block: Pick<Block, "kopf" | "iv" | "daten" | "umschlag">): Promise<string> {
  const { kopf, iv, daten, umschlag } = block;
  return sha256Hex(utf8(kanonisch({ kopf, iv, daten, umschlag })));
}

export type Kettenergebnis =
  | { ok: true; vollstaendig: boolean }
  | { ok: false; block: number; grund: string };

/**
 * Prüft Reihenfolge und Fingerabdrücke. Die Gründe sind wörtlich die der Vorlage
 * (`docs/design/einsatzbuch-v2/vorlage/einsatzbuch-kern.js`, `pruefeKette`), weil die
 * Oberfläche sie so anzeigt. `vollstaendig` heißt: die Kette beginnt bei Block 1.
 */
export async function pruefeKette(bloecke: readonly Block[]): Promise<Kettenergebnis> {
  for (let i = 0; i < bloecke.length; i++) {
    const b = bloecke[i];
    const vorher = bloecke[i - 1];
    if ((await blockHash(b)) !== b.hash) return { ok: false, block: b.kopf.block, grund: "Inhalt passt nicht zum Fingerabdruck" };
    if (vorher && b.kopf.prev !== vorher.hash) return { ok: false, block: b.kopf.block, grund: "Vorgänger fehlt oder wurde verändert" };
    if (!vorher && b.kopf.block === 1 && b.kopf.prev !== GENESIS) return { ok: false, block: 1, grund: "Anfang der Kette stimmt nicht" };
    if (vorher && b.kopf.block !== vorher.kopf.block + 1) return { ok: false, block: b.kopf.block, grund: "Lücke in der Reihenfolge" };
  }
  return { ok: true, vollstaendig: bloecke.length > 0 && bloecke[0].kopf.block === 1 };
}
