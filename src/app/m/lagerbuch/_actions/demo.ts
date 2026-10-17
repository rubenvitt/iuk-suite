"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { demoEinstellung } from "../_db/schema";
import type { ActionErgebnis } from "../_lib/actionErgebnis";
import { DEMO_EINSTELLUNG_ID } from "../_lib/lesepfade/demo";
import { templateDetail } from "../_lib/lesepfade/fahrzeuge";
import { requireLagerbuchAdmin } from "../_lib/zugang";

const Schema = z.object({
  aktiv: z.boolean(),
  templateId: z.string().min(1).nullable(),
});

/**
 * IDA-224 — Demo-Check ein- oder ausschalten und die Vorlage waehlen
 * (voruebergehend, Rueckbau IDA-225). Nur Lagerbuch-Admins
 * (`requireLagerbuchAdmin`, also `adminGroups` des Moduls — nie
 * `session.user.isAdmin`).
 *
 * Einschalten verlangt eine aktive Vorlage mit Positionen; sonst gaebe die
 * Demo-Seite trotz „an" ein 404, und das fiele erst vor dem Publikum auf.
 */
export async function setzeDemoCheck(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  const viewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(viewer) }, async (): Promise<ActionErgebnis> => {
    const geparst = Schema.safeParse(eingabe);
    if (!geparst.success) return { ok: false, fehler: "Die Einstellung konnte nicht gespeichert werden." };
    const { aktiv, templateId } = geparst.data;

    if (aktiv) {
      const vorlage = templateId ? templateDetail(db, templateId) : null;
      if (!vorlage || !vorlage.aktiv || vorlage.positionen.length === 0) {
        return { ok: false, fehler: "Wähle zuerst eine aktive Vorlage mit Positionen." };
      }
    }

    const werte = { aktiv, templateId, geaendertAt: new Date() };
    db.insert(demoEinstellung).values({ id: DEMO_EINSTELLUNG_ID, ...werte })
      .onConflictDoUpdate({ target: demoEinstellung.id, set: werte })
      .run();

    revalidatePath("/m/lagerbuch/verwaltung/vorlagen");
    return { ok: true };
  });
}
