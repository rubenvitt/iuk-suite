"use server";

import { revalidatePath } from "next/cache";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { idSchema, stundenEingabe } from "../_lib/eingabe";
import { heute } from "../_lib/heute";
import { Abgelehnt, stundenEintragen } from "../_lib/schreiben";
import type { Ergebnis } from "../_lib/typen";
import { anzeigename, requireAktion } from "../_lib/zugang";

/**
 * Betriebsstunden am Gerät ablesen — jeder Angemeldete (Entscheidung an IDA-307). Prüfung und Mangel gehen
 * über Route Handler, weil Fotos mitkommen (`g/[id]/pruefung/senden`, `g/[id]/mangel/senden`).
 */
export async function stundenEintragenAction(geraetId: string, eingabe: unknown): Promise<Ergebnis> {
  const { viewer } = await requireAktion("angemeldet");
  const e = stundenEingabe.safeParse(eingabe);
  if (!idSchema.safeParse(geraetId).success || !e.success) return { ok: false, fehler: "Bitte ganze Stunden eingeben.", feldFehler: { stunden: "Bitte ganze Stunden eingeben." } };
  return withAuditContext({ actor: auditActor(viewer) }, async (): Promise<Ergebnis> => {
    try {
      stundenEintragen(getDb(), geraetId, e.data.stunden, { jetzt: Date.now(), heute: heute(), wer: anzeigename(viewer) });
    } catch (f) {
      if (f instanceof Abgelehnt) return { ok: false, fehler: f.message, feldFehler: f.feld ? { [f.feld]: f.message } : undefined };
      throw f;
    }
    revalidatePath("/m/wartung", "layout");
    return { ok: true };
  });
}
