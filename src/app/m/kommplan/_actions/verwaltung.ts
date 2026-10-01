"use server";

import { z } from "zod";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import type { DuplikatErgebnis, EinfachErgebnis, VorlageErgebnis } from "../_lib/ergebnis";
import { archiviere, dupliziere, speichereAlsVorlage, stelleWiederHer } from "../_lib/planverwaltung";
import { bearbeiterAus, requireKommplanBearbeitenAktion } from "../_lib/zugang";

// Planverwaltung (Spec §6.7, §8.3): jede Action prüft selbst, die ID wird in `_lib/planverwaltung.ts` gegen die
// Datenbank aufgelöst. Kein revalidatePath: die Liste ruft `router.refresh()`.

const ID = z.string().min(1).max(64);
const UNGUELTIG = { ok: false, fehler: "Ungültige Anfrage." } as const;

export async function dupliziereAction(id: unknown): Promise<DuplikatErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  const r = ID.safeParse(id);
  if (!r.success) return { ...UNGUELTIG, feldFehler: {} };
  return withAuditContext({ actor: auditActor(viewer) }, async () => dupliziere(getDb(), r.data, bearbeiterAus(viewer), Date.now()));
}

/** `trotzdem`: eine zweite Vorlage gleichen Titels — erst nach der Rückfrage in der Liste. */
export async function speichereAlsVorlageAction(id: unknown, trotzdem?: unknown): Promise<VorlageErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  const r = ID.safeParse(id);
  const t = z.boolean().optional().safeParse(trotzdem);
  if (!r.success || !t.success) return { ...UNGUELTIG, feldFehler: {} };
  return withAuditContext({ actor: auditActor(viewer) }, async () => speichereAlsVorlage(getDb(), r.data, bearbeiterAus(viewer), Date.now(), t.data ?? false));
}

export async function archiviereAction(id: unknown): Promise<EinfachErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  const r = ID.safeParse(id);
  if (!r.success) return UNGUELTIG;
  return withAuditContext({ actor: auditActor(viewer) }, async () => archiviere(getDb(), r.data, Date.now()));
}

export async function stelleWiederHerAction(id: unknown): Promise<EinfachErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  const r = ID.safeParse(id);
  if (!r.success) return UNGUELTIG;
  return withAuditContext({ actor: auditActor(viewer) }, async () => stelleWiederHer(getDb(), r.data));
}
