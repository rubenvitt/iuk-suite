"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { buchungen, chargen, newId } from "../_db/schema";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";
import { handlagerOrte } from "../_lib/lesepfade/orte";
import { verfallSchwellen, verfallStatus } from "../_lib/domain/verfall";
import { requireLagerbuchAdmin } from "../_lib/zugang";

const AussondernSchema = z.object({
  chargeId: z.string().min(1),
  kommentar: z.string().trim().min(1, "Kommentar erforderlich"),
});

/**
 * Bucht den positiven Rest einer abgelaufenen Charge im Handlager vollständig
 * als Korrektur aus. Bestand derselben Charge in Fahrzeugen bleibt unberührt.
 */
export async function aussondern(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  const viewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(viewer) }, async (): Promise<ActionErgebnis> => {

    const geparst = AussondernSchema.safeParse(eingabe);
    if (!geparst.success) {
      const feldFehler = zodFehler(geparst.error);
      return {
        ok: false,
        fehler: "Bitte die markierten Felder prüfen.",
        ...(feldFehler ? { feldFehler } : {}),
      };
    }
    const v = geparst.data;

    let fachFehler: string | null;
    try {
      const schwellen = verfallSchwellen();
      const jetzt = new Date();
      fachFehler = db.transaction((tx): string | null => {
        const charge = tx.select().from(chargen).where(eq(chargen.id, v.chargeId)).get();
        if (!charge) return "Charge nicht gefunden.";

        if (!verfallStatus(charge.verfall, schwellen, jetzt).abgelaufen) {
          return "Nur abgelaufene Chargen können ausgesondert werden.";
        }

        // DRK-297 — der Rest je ORT, nicht als eine Summe über den Bereich.
        // EINE Abfrage, `GROUP BY lagerort_id`, mit Bereichs-Prädikat.
        const orte = handlagerOrte(tx);
        const jeOrt = tx
          .select({
            lagerortId: buchungen.lagerortId,
            summe: sql<number>`sum(${buchungen.menge})`,
          })
          .from(buchungen)
          .where(and(
            eq(buchungen.chargeId, charge.id),
            inArray(buchungen.lagerortId, [...orte]),
          ))
          .groupBy(buchungen.lagerortId)
          .all();

        const gesamt = jeOrt.reduce((s, z) => s + z.summe, 0);
        if (gesamt <= 0) return "Charge hat keinen Restbestand im Handlager.";

        for (const zeile of jeOrt) {
          // ⚠️ EIN ORT MIT REST 0 ODER WENIGER BEKOMMT KEINE ZEILE. Eine
          // Buchung über 0 stünde im Journal und sagte nichts; eine über eine
          // negative Zahl drehte das Vorzeichen um und schriebe Bestand ZU.
          if (zeile.summe <= 0) continue;
          tx.insert(buchungen).values({
            id: newId(), ts: jetzt, typ: "korrektur", artikelId: charge.artikelId,
            chargeId: charge.id, lagerortId: zeile.lagerortId, menge: -zeile.summe,
            quelleTyp: "oidc", quelleId: viewer.sub, referenz: null, kommentar: v.kommentar,
          }).run();
        }
        return null;
      });
    } catch {
      return { ok: false, fehler: "Aussondern fehlgeschlagen." };
    }

    if (fachFehler !== null) return { ok: false, fehler: fachFehler };

    revalidatePath("/m/lagerbuch/verwaltung/verfall");
    revalidatePath("/m/lagerbuch/verwaltung/artikel");
    revalidatePath("/m/lagerbuch/verwaltung");
    return { ok: true };
  });
}
