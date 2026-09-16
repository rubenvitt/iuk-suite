"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { lagerorte, lagerortVerfall, sollPositionen } from "../_db/schema";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";
import { MONAT_REGEX } from "../_lib/konstanten";
import { setzeVerfall } from "../_lib/schreibpfade/lagerortVerfall";
import type { VerfallWert } from "../_lib/verfallStand";
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
 *
 * ⚠️ SIE MELDET DEN GESCHRIEBENEN WERT, NICHT „GESETZT JA/NEIN" (DRK-345). Der
 * Monatswähler daneben hält einen Spiegel dieses Werts; ohne einen Wert in der
 * Antwort blieb ihm nur, seine EIGENE Eingabe zu spiegeln — und damit war der
 * Spiegel nur so lange richtig, wie niemand sonst schrieb. Die zweite Aktion
 * auf dieser Tabelle (`aussondernVomLagerort`) meldet ihn seit DRK-303; beide
 * teilen sich seither `VerfallWert`, damit ein Trichter für beide reicht.
 */
export async function verfallSetzen(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<VerfallWert>> {
  const viewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(viewer) }, async (): Promise<ActionErgebnis<VerfallWert>> => {

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

    /*
     * ⚠️ SCHREIBEN UND ZURUECKLESEN IN EINER TRANSAKTION, UND DAS RUECKGELESENE
     * WIRD GEMELDET — nicht `v.verfall`. Der Unterschied ist heute keiner:
     * `setzeVerfall` schreibt bedingungslos. Er ist die ZUSAGE, die der Spiegel
     * daneben braucht: „was du bekommst, steht in der Datenbank". Ein Echo der
     * Eingabe sähe genauso aus und wäre in dem Moment falsch, in dem diese
     * Aktion einmal bedingt schreibt — so wie es die Aussonderung längst tut.
     *
     * `setzeVerfall` läuft transaktions-FREI und nimmt `DB | Tx`; die
     * Transaktion hier ist die des Aufrufers und keine zweite Ebene.
     */
    const geschrieben = db.transaction((tx): string | null => {
      setzeVerfall(tx, {
        lagerortId: v.lagerortId,
        artikelId: v.artikelId,
        verfall: v.verfall,
        quelle: { quelleTyp: "oidc", quelleId: viewer.sub },
      });
      const zeile = tx.select({ verfall: lagerortVerfall.verfall })
        .from(lagerortVerfall)
        .where(and(
          eq(lagerortVerfall.lagerortId, v.lagerortId),
          eq(lagerortVerfall.artikelId, v.artikelId),
        ))
        .get();
      return zeile?.verfall ?? null;
    });

    revalidatePath(`/m/lagerbuch/verwaltung/fahrzeuge/${v.lagerortId}`);
    revalidatePath("/m/lagerbuch/verwaltung/fahrzeuge");
    revalidatePath("/m/lagerbuch/verwaltung/verfall");
    return { ok: true, wert: { verfall: geschrieben } };
  });
}
