"use server";

import { z } from "zod";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import type { AnlageErgebnis, SpeicherErgebnis, Speicherstand } from "../_lib/ergebnis";
import { ladeStand, legePlanAn, speichereAngaben, speichereInhalt } from "../_lib/speichern";
import { bearbeiterAus, requireKommplanBearbeitenAktion } from "../_lib/zugang";

// Server Actions des Editors (Spec §6.6). Jede prüft selbst (eine Action ist per POST direkt
// erreichbar); die Plan-ID wird in `_lib/speichern.ts` gegen die Datenbank aufgelöst (IDOR).
// Kein revalidatePath: die Editor-Insel ist bis zum Neuladen die Quelle der Wahrheit.

const kopf = z.object({ id: z.string().min(1).max(64), version: z.number().int().min(1) });
const UNGUELTIG = { ok: false, grund: "ungueltig", fehler: "Ungültige Anfrage." } as const;

export async function legePlanAnAction(eingabe: unknown): Promise<AnlageErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => legePlanAn(getDb(), eingabe, bearbeiterAus(viewer), Date.now()));
}

export async function speichereInhaltAction(eingabe: unknown): Promise<SpeicherErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const k = kopf.extend({ inhalt: z.unknown() }).safeParse(eingabe);
    if (!k.success) return UNGUELTIG;
    return speichereInhalt(getDb(), k.data, bearbeiterAus(viewer), Date.now());
  });
}

export async function speichereAngabenAction(eingabe: unknown): Promise<SpeicherErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const k = kopf.extend({ angaben: z.unknown() }).safeParse(eingabe);
    if (!k.success) return UNGUELTIG;
    return speichereAngaben(getDb(), k.data, bearbeiterAus(viewer), Date.now());
  });
}

/** Lesend (Entscheidung 21): der Editor prüft beim Montieren, ob seine Props veraltet sind (Browser-Zurück). */
export async function ladeStandAction(id: unknown): Promise<Speicherstand | null> {
  await requireKommplanBearbeitenAktion();
  const r = kopf.shape.id.safeParse(id);
  return r.success ? ladeStand(getDb(), r.data) : null;
}
