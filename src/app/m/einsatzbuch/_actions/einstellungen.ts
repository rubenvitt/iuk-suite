"use server";

import { revalidatePath } from "next/cache";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { requireEinsatzbuchAktion } from "../_lib/zugang";
import { type ActionErgebnis, zodFehler } from "../_lib/actionErgebnis";
import { einstellungenSchema, leseEinstellungen, schreibeEinstellungen, type Einstellungen } from "../_lib/einstellungen";

export async function einstellungenSpeichernAction(eingabe: unknown): Promise<ActionErgebnis<Einstellungen>> {
  const viewer = await requireEinsatzbuchAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const geprueft = einstellungenSchema.safeParse(eingabe);
    if (!geprueft.success) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: zodFehler(geprueft.error) ?? {} };
    const db = getDb();
    schreibeEinstellungen(db, geprueft.data);
    revalidatePath("/m/einsatzbuch/einstellungen");
    return { ok: true, wert: leseEinstellungen(db) };
  });
}
