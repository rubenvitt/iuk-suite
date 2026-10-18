"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { and, inArray, isNotNull, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { artikel } from "../_db/schema";
import type { ActionErgebnis } from "../_lib/actionErgebnis";
import { idBloecke, SAMMEL_MAX_ARTIKEL } from "../_lib/sammelAenderung";
import { requireLagerbuchAdmin } from "../_lib/zugang";

/**
 * IDA-238 — EINE LISTE VON ARTIKELN STATT EINES EINZELNEN. Die Oberflaeche
 * markiert eine Auswahl in EINER Anfrage; ein einzelner Artikel ist eine
 * Auswahl mit einer Zeile.
 */
const Schema = z.object({
  artikelIds: z.array(z.string().min(1)).min(1).max(SAMMEL_MAX_ARTIKEL),
  bestellt: z.boolean(),
});

/**
 * Die Bestellmarkierung ist ein Zeitstempel, kein boolescher Haken: Die
 * Oberfläche zeigt daraus, seit wann eine Bestellung offen ist. Ein Zugang
 * setzt `bestelltAt` in `bucheZugang` wieder auf `null` zurück.
 *
 * ⚠️ EIN SCHON MARKIERTER ARTIKEL BEHAELT SEIN DATUM. Wer eine Auswahl als
 * bestellt markiert, in der eine Zeile seit drei Wochen „bestellt" steht,
 * erneuert damit nicht deren Bestellung — „seit" bliebe sonst nicht die eine
 * wahre Aussage, die `bestelltAt` traegt (`_lib/lesepfade/bestellung.ts`).
 * Gesetzt wird deshalb nur, wo noch nichts steht, und genullt nur, wo etwas
 * steht. `betroffen` zaehlt die Zeilen, die sich wirklich geaendert haben.
 *
 * ⚠️ KEINE JOURNALZEILE, WIE BISHER: die Markierung ist keine Buchung. Belegt
 * wird sie im Audit — der Trigger `audit_artikel_update` schreibt je
 * geaendertem Artikel eine Zeile, auch wenn die Aenderung in EINEM `UPDATE`
 * steht. Ein unveraenderter Artikel schreibt keine (die `WHEN`-Klausel des
 * Triggers), und genau deshalb fasst die Bedingung unten ihn gar nicht an.
 *
 * Unbekannte IDs werden still uebergangen: eine Auswahl kann aelter sein als
 * die Liste.
 */
export async function markiereBestellt(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ betroffen: number }>> {
  const auditViewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async (): Promise<ActionErgebnis<{ betroffen: number }>> => {

    const geparst = Schema.safeParse(eingabe);
    if (!geparst.success) {
      return { ok: false, fehler: "Ungültige Eingabe." };
    }

    const { bestellt } = geparst.data;
    const ids = [...new Set(geparst.data.artikelIds)];
    const jetzt = new Date();
    let betroffen = 0;
    db.transaction((tx) => {
      for (const block of idBloecke(ids)) {
        betroffen += tx.update(artikel)
          .set({ bestelltAt: bestellt ? jetzt : null })
          .where(and(
            inArray(artikel.id, block),
            bestellt ? isNull(artikel.bestelltAt) : isNotNull(artikel.bestelltAt),
          ))
          .run().changes;
      }
    });

    revalidatePath("/m/lagerbuch/verwaltung/bestellung");
    revalidatePath("/m/lagerbuch/verwaltung");
    return { ok: true, wert: { betroffen } };
  });
}
