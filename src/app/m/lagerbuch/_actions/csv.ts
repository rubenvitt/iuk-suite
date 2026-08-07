"use server";

import { revalidatePath } from "next/cache";
import { getDb, type DB } from "../_db/client";
import { artikel, buchungen, chargen, newId } from "../_db/schema";
import type { ActionErgebnis } from "../_lib/actionErgebnis";
import { parseArtikelCsv } from "../_lib/csv";
import { CHARGE_OHNE_VERFALL, HANDLAGER_ID, PSEUDO_VERFALL } from "../_lib/konstanten";
import { requireLagerbuchAdmin } from "../_lib/zugang";

const LISTENPFAD = "/m/lagerbuch/verwaltung/artikel";

/**
 * Jede gueltige CSV-Zeile hat ihre eigene Transaktion. Ein defekter Datensatz
 * rollt damit weder fruehere Erfolge zurueck noch hinterlaesst er eine halbe
 * Artikel/Charge/Buchung-Kette. Interne Datenbanktexte verlassen den Server
 * nicht; der Fehlerbericht bleibt fachlich und stabil.
 */
export async function importArtikelCsv(
  text: string,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ angelegt: number; fehler: string[] }>> {
  const viewer = await requireLagerbuchAdmin();
  const { rows, errors } = parseArtikelCsv(text, { mitMetadaten: true });
  const fehler = [...errors];
  let angelegt = 0;

  for (const { row, zeile } of rows) {
    try {
      db.transaction((tx) => {
        const artikelId = newId();
        tx.insert(artikel).values({
          id: artikelId,
          name: row.name,
          einheit: row.einheit,
          fach: row.fach,
          mindestbestand: row.mindestbestand,
          aktiv: true,
          createdAt: new Date(),
        }).run();

        if (row.startbestand > 0) {
          const chargeId = newId();
          tx.insert(chargen).values({
            id: chargeId,
            artikelId,
            chargenNr: CHARGE_OHNE_VERFALL,
            verfall: PSEUDO_VERFALL,
            createdAt: new Date(),
          }).run();
          tx.insert(buchungen).values({
            id: newId(),
            ts: new Date(),
            typ: "korrektur",
            artikelId,
            chargeId,
            lagerortId: HANDLAGER_ID,
            menge: row.startbestand,
            quelleTyp: "oidc",
            quelleId: viewer.sub,
            kommentar: "CSV-Startbestand",
          }).run();
        }
      });
      angelegt += 1;
    } catch {
      fehler.push(`Zeile ${zeile}: „${row.name}“ konnte nicht angelegt werden.`);
    }
  }

  revalidatePath(LISTENPFAD);
  return { ok: true, wert: { angelegt, fehler } };
}
