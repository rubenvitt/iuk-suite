"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { buchungen, chargen, newId } from "../_db/schema";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";
import { bestandProLagerortUndCharge } from "../_lib/domain/bestand";
import { verfallSchwellen, verfallStatus } from "../_lib/domain/verfall";
import { HANDLAGER_ID } from "../_lib/konstanten";
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

      const chargeBuchungen = tx
        .select()
        .from(buchungen)
        .where(eq(buchungen.chargeId, charge.id))
        .all();
      const rest =
        bestandProLagerortUndCharge(
          chargeBuchungen.map((buchung) => ({
            lagerortId: buchung.lagerortId,
            chargeId: buchung.chargeId,
            menge: buchung.menge,
          })),
          HANDLAGER_ID,
        ).get(charge.id) ?? 0;
      if (rest <= 0) return "Charge hat keinen Restbestand im Handlager.";

      tx.insert(buchungen)
        .values({
          id: newId(),
          ts: jetzt,
          typ: "korrektur",
          artikelId: charge.artikelId,
          chargeId: charge.id,
          lagerortId: HANDLAGER_ID,
          menge: -rest,
          quelleTyp: "oidc",
          quelleId: viewer.sub,
          referenz: null,
          kommentar: v.kommentar,
        })
        .run();
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
}
