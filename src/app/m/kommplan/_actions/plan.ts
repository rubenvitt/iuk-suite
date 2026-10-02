"use server";

import { z } from "zod";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import type { AnlageErgebnis, SpeicherErgebnis, Speicherstand } from "../_lib/ergebnis";
import { rechteAn } from "../_lib/rechte";
import { ladeStand, legePlanAn, speichereAngaben, speichereInhalt } from "../_lib/speichern";
import { bearbeiterAus, personAus, requireKommplanAktion } from "../_lib/zugang";

// Server Actions des Editors (Spec §6.6). Jede prüft selbst (eine Action ist per POST direkt
// erreichbar): Modulzugang, dann das Recht am Plan aus der Datenbank (`_lib/rechte.ts`, IDOR).
// Ohne Bearbeitungsrecht ist ein Plan „weg" — derselbe Ausgang wie ein gelöschter, nichts verrät ihn.
// Kein revalidatePath: die Editor-Insel ist bis zum Neuladen die Quelle der Wahrheit.

const kopf = z.object({ id: z.string().min(1).max(64), version: z.number().int().min(1) });
const UNGUELTIG = { ok: false, grund: "ungueltig", fehler: "Ungültige Anfrage." } as const;

const WEG = { ok: false, grund: "weg" } as const;

/** Anlegen darf jeder mit Zugang: der neue Plan ist privat und gehört ihm. */
export async function legePlanAnAction(eingabe: unknown): Promise<AnlageErgebnis> {
  const viewer = await requireKommplanAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => legePlanAn(getDb(), eingabe, bearbeiterAus(viewer), Date.now(), personAus(viewer)));
}

export async function speichereInhaltAction(eingabe: unknown): Promise<SpeicherErgebnis> {
  const viewer = await requireKommplanAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const k = kopf.extend({ inhalt: z.unknown() }).safeParse(eingabe);
    if (!k.success) return UNGUELTIG;
    if (!rechteAn(getDb(), k.data.id, personAus(viewer)).bearbeiten) return WEG;
    return speichereInhalt(getDb(), k.data, bearbeiterAus(viewer), Date.now());
  });
}

export async function speichereAngabenAction(eingabe: unknown): Promise<SpeicherErgebnis> {
  const viewer = await requireKommplanAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const k = kopf.extend({ angaben: z.unknown() }).safeParse(eingabe);
    if (!k.success) return UNGUELTIG;
    if (!rechteAn(getDb(), k.data.id, personAus(viewer)).bearbeiten) return WEG;
    return speichereAngaben(getDb(), k.data, bearbeiterAus(viewer), Date.now());
  });
}

/** Lesend (Entscheidung 21): der Editor prüft beim Montieren, ob seine Props veraltet sind (Browser-Zurück). */
export async function ladeStandAction(id: unknown): Promise<Speicherstand | null> {
  const viewer = await requireKommplanAktion();
  const r = kopf.shape.id.safeParse(id);
  return r.success && rechteAn(getDb(), r.data, personAus(viewer)).bearbeiten ? ladeStand(getDb(), r.data) : null;
}
