"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { newId, plomben } from "../_db/schema";
import { type ActionErgebnis, zodFehler } from "../_lib/actionErgebnis";
import { findeFahrzeug } from "../_lib/schreibpfade/fahrzeug";
import { requireLagerbuchAdmin } from "../_lib/zugang";
import { verwaltungDetailPfadIntern } from "../_lib/verwaltungPfad";

/**
 * Plomben einer Einheit pflegen (IDA-222).
 *
 * Die Verwaltung legt fest, WELCHE Behaelter verplombt werden und welches Fach
 * der Soll-Bestueckung sie abdecken. Die NUMMER setzt sie hier nicht — die
 * setzt der Vollcheck, wenn der Behaelter wirklich zu ist. Eine Nummer aus der
 * Verwaltung bezeugte einen Inhalt, den niemand gezaehlt hat.
 *
 * ⚠️ WER DAS FACH AENDERT, OEFFNET DIE PLOMBE. Sie bezeugt den Inhalt genau
 * des Fachs, das beim Setzen galt; deckt sie danach ein anderes ab, waere das
 * eine Zusage ueber Positionen, die beim Verplomben niemand angesehen hat.
 * Dasselbe beim Reaktivieren: was stillgelegt war, kann zwischendurch geoeffnet
 * worden sein.
 */

const FEHLER = "Plombe konnte nicht gespeichert werden.";

function validierungsFehler(e: unknown): Extract<ActionErgebnis, { ok: false }> {
  const feldFehler = zodFehler(e);
  return {
    ok: false,
    fehler: (feldFehler && Object.values(feldFehler)[0]) || FEHLER,
    ...(feldFehler ? { feldFehler } : {}),
  };
}

const fach = z.string().trim().max(120).nullable()
  .transform((v) => (v ? v : null));

const AnlegenSchema = z.object({
  lagerortId: z.string().min(1),
  bezeichnung: z.string().trim().min(1, "Bezeichnung darf nicht leer sein").max(120),
  fachLabel: fach,
});

export async function plombeAnlegen(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ id: string }>> {
  const auditViewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async (): Promise<ActionErgebnis<{ id: string }>> => {
    let v: z.output<typeof AnlegenSchema>;
    try {
      v = AnlegenSchema.parse(eingabe);
    } catch (e) {
      return validierungsFehler(e);
    }
    if (!findeFahrzeug(db, v.lagerortId)) return { ok: false, fehler: "Einheit nicht gefunden." };

    const id = newId();
    try {
      const sortierung = db.select().from(plomben).where(eq(plomben.lagerortId, v.lagerortId)).all().length;
      db.insert(plomben).values({
        id, lagerortId: v.lagerortId, bezeichnung: v.bezeichnung, fachLabel: v.fachLabel,
        sortierung, createdAt: new Date(),
      }).run();
    } catch {
      return { ok: false, fehler: FEHLER };
    }
    revalidatePath(verwaltungDetailPfadIntern("fahrzeuge", v.lagerortId));
    return { ok: true, wert: { id } };
  });
}

const AendernSchema = z.object({
  id: z.string().min(1),
  lagerortId: z.string().min(1),
  bezeichnung: z.string().trim().min(1, "Bezeichnung darf nicht leer sein").max(120).optional(),
  fachLabel: fach.optional(),
  aktiv: z.boolean().optional(),
});

export async function plombeAendern(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  const auditViewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(auditViewer) }, async (): Promise<ActionErgebnis> => {
    let v: z.output<typeof AendernSchema>;
    try {
      v = AendernSchema.parse(eingabe);
    } catch (e) {
      return validierungsFehler(e);
    }
    const wo = and(eq(plomben.id, v.id), eq(plomben.lagerortId, v.lagerortId));
    try {
      const alt = db.select().from(plomben).where(wo).get();
      if (!alt) return { ok: false, fehler: "Plombe nicht gefunden." };
      const fachGeaendert = v.fachLabel !== undefined && v.fachLabel !== alt.fachLabel;
      const reaktiviert = v.aktiv === true && !alt.aktiv;
      db.update(plomben).set({
        ...(v.bezeichnung !== undefined ? { bezeichnung: v.bezeichnung } : {}),
        ...(v.fachLabel !== undefined ? { fachLabel: v.fachLabel } : {}),
        ...(v.aktiv !== undefined ? { aktiv: v.aktiv } : {}),
        // Kopf: ein neues Fach oder eine Rueckkehr aus der Stilllegung oeffnet die Plombe.
        ...(fachGeaendert || reaktiviert ? { nummer: null, gesetztAt: null } : {}),
      }).where(wo).run();
    } catch {
      return { ok: false, fehler: FEHLER };
    }
    revalidatePath(verwaltungDetailPfadIntern("fahrzeuge", v.lagerortId));
    return { ok: true };
  });
}
