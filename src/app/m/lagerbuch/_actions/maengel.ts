"use server";
/**
 * MÄNGEL ERLEDIGEN UND WIEDER ÖFFNEN (IDA-298) — nur die Verwaltung des Lagerbuchs
 * (`requireLagerbuchAdmin`, dieselbe Stufe wie `/verwaltung`).
 */
import { withAuditContext, auditActor } from "@/core/audit/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import type { ActionAusgang } from "../_lib/actionErgebnis";
import { erledigeMangel, oeffneMangelWieder } from "../_lib/maengel/daten";
import { VERMERK_MAX } from "../_lib/maengel/meldung";
import { requireLagerbuchAdmin } from "../_lib/zugang";

const ErledigenSchema = z.object({
  id: z.string().min(1),
  vermerk: z.string().max(VERMERK_MAX).transform((v) => v.trim() || null),
});

const IdSchema = z.object({ id: z.string().min(1) });

function aktualisiere(): void {
  revalidatePath("/m/lagerbuch/verwaltung/maengel");
  revalidatePath("/m/lagerbuch/verwaltung");
}

export async function mangelErledigen(eingabe: unknown, db: DB = getDb()): Promise<ActionAusgang> {
  const viewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(viewer) }, async (): Promise<ActionAusgang> => {
    const v = ErledigenSchema.safeParse(eingabe);
    if (!v.success) return { ok: false, fehler: `Der Vermerk darf höchstens ${VERMERK_MAX} Zeichen lang sein.` };
    if (!erledigeMangel(db, v.data.id, viewer.sub, v.data.vermerk, new Date())) {
      return { ok: false, fehler: "Dieser Mangel ist schon erledigt oder existiert nicht mehr." };
    }
    aktualisiere();
    return { ok: true };
  });
}

export async function mangelWiederOeffnen(eingabe: unknown, db: DB = getDb()): Promise<ActionAusgang> {
  const viewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(viewer) }, async (): Promise<ActionAusgang> => {
    const v = IdSchema.safeParse(eingabe);
    if (!v.success || !oeffneMangelWieder(db, v.data.id)) {
      return { ok: false, fehler: "Dieser Mangel ist schon offen oder existiert nicht mehr." };
    }
    aktualisiere();
    return { ok: true };
  });
}
