"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { artikel } from "../_db/schema";
import type { ActionErgebnis } from "../_lib/actionErgebnis";
import { requireLagerbuchAdmin } from "../_lib/zugang";

const Schema = z.object({
  artikelId: z.string().min(1),
  bestellt: z.boolean(),
});

/**
 * Die Bestellmarkierung ist ein Zeitstempel, kein boolescher Haken: Die
 * Oberfläche zeigt daraus, seit wann eine Bestellung offen ist. Ein Zugang
 * setzt `bestelltAt` in `bucheZugang` wieder auf `null` zurück.
 */
export async function markiereBestellt(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  await requireLagerbuchAdmin();

  const geparst = Schema.safeParse(eingabe);
  if (!geparst.success) {
    return { ok: false, fehler: "Ungültige Eingabe." };
  }

  db.update(artikel)
    .set({ bestelltAt: geparst.data.bestellt ? new Date() : null })
    .where(eq(artikel.id, geparst.data.artikelId))
    .run();

  revalidatePath("/m/lagerbuch/verwaltung/bestellung");
  revalidatePath("/m/lagerbuch/verwaltung");
  return { ok: true };
}
