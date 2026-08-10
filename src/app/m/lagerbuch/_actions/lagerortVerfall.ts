"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { lagerorte, sollPositionen } from "../_db/schema";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";
import { MONAT_REGEX } from "../_lib/konstanten";
import { setzeVerfall } from "../_lib/schreibpfade/lagerortVerfall";
import { requireLagerbuchAdmin } from "../_lib/zugang";

const VerfallSchema = z.object({
  lagerortId: z.string().min(1),
  artikelId: z.string().min(1),
  verfall: z
    .union([
      z.string().regex(MONAT_REGEX, "Verfall muss das Format YYYY-MM haben"),
      z.literal(""),
    ])
    .nullable()
    .transform((wert) => wert || null),
});

/**
 * Pflegt den im Fahrzeug abgelesenen Verfall eines Sollartikels.
 *
 * Nur eine aktive Sollposition begründet die Zugehörigkeit. Grabsteine bleiben
 * für den Vorlagen-Sync erhalten, sind im Fahrzeug-Verfall-Editor aber bewusst
 * unsichtbar; sie dürfen daher keine nicht mehr pflegbare Meldung erzeugen.
 */
export async function verfallSetzen(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ gesetzt: boolean }>> {
  const viewer = await requireLagerbuchAdmin();

  const geparst = VerfallSchema.safeParse(eingabe);
  if (!geparst.success) {
    const feldFehler = zodFehler(geparst.error);
    return {
      ok: false,
      fehler: "Bitte die markierten Felder prüfen.",
      ...(feldFehler ? { feldFehler } : {}),
    };
  }
  const v = geparst.data;

  const ort = db.select({ id: lagerorte.id })
    .from(lagerorte)
    .where(eq(lagerorte.id, v.lagerortId))
    .get();
  if (!ort) {
    return { ok: false, fehler: "Lagerort nicht gefunden." };
  }

  const imSoll = db.select({ id: sollPositionen.id })
    .from(sollPositionen)
    .where(and(
      eq(sollPositionen.fahrzeugId, v.lagerortId),
      eq(sollPositionen.artikelId, v.artikelId),
      eq(sollPositionen.entfernt, false),
    ))
    .get();
  if (!imSoll) {
    return { ok: false, fehler: "Artikel steht an diesem Lagerort nicht im Soll." };
  }

  setzeVerfall(db, {
    lagerortId: v.lagerortId,
    artikelId: v.artikelId,
    verfall: v.verfall,
    quelle: { quelleTyp: "oidc", quelleId: viewer.sub },
  });

  revalidatePath(`/m/lagerbuch/verwaltung/fahrzeuge/${v.lagerortId}`);
  revalidatePath("/m/lagerbuch/verwaltung/fahrzeuge");
  revalidatePath("/m/lagerbuch/verwaltung/verfall");
  return { ok: true, wert: { gesetzt: v.verfall !== null } };
}
