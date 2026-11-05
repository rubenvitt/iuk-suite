"use server";

import { revalidatePath } from "next/cache";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { requireEinsatzbuchAktion } from "../_lib/zugang";
import { type ActionErgebnis, zodFehler } from "../_lib/actionErgebnis";
import { leseSuchlage, suchlageEingabe, trenneSuchlage, verbindeSuchlage, type SuchlageVerbindung } from "../_lib/umsysteme";

/** Verbindet das Einsatztagebuch mit Suchlage (IDA-359); der Großbild-Link ersetzt einen alten. */
export async function suchlageVerbindenAction(eingabe: unknown): Promise<ActionErgebnis<SuchlageVerbindung>> {
  const viewer = await requireEinsatzbuchAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const geprueft = suchlageEingabe.safeParse(eingabe);
    if (!geprueft.success) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: zodFehler(geprueft.error) ?? {} };
    const verbindung = verbindeSuchlage(getDb(), geprueft.data.link, viewer.name ?? "Verwaltung", new Date());
    revalidatePath("/m/einsatzbuch/einstellungen");
    return { ok: true, wert: verbindung };
  });
}

export async function suchlageTrennenAction(): Promise<ActionErgebnis<null>> {
  const viewer = await requireEinsatzbuchAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const db = getDb();
    if (leseSuchlage(db)) trenneSuchlage(db);
    revalidatePath("/m/einsatzbuch/einstellungen");
    return { ok: true, wert: null };
  });
}
