"use server";

import { z } from "zod";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import type { AnlageErgebnis, EinfachErgebnis } from "../_lib/ergebnis";
import { archiviere, dupliziere, setzeVorlage, stelleWiederHer } from "../_lib/planverwaltung";
import { bearbeiterAus, requireKommplanBearbeitenAktion } from "../_lib/zugang";

// Planverwaltung (Spec §6.7, §8.3): jede Action prüft selbst, die ID wird in `_lib/planverwaltung.ts` gegen die
// Datenbank aufgelöst. Kein revalidatePath: die Liste ruft `router.refresh()`.

const ID = z.string().min(1).max(64);
const UNGUELTIG = { ok: false, fehler: "Ungültige Anfrage." } as const;

export async function dupliziereAction(id: unknown): Promise<AnlageErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  const r = ID.safeParse(id);
  if (!r.success) return { ...UNGUELTIG, feldFehler: {} };
  return withAuditContext({ actor: auditActor(viewer) }, async () => dupliziere(getDb(), r.data, bearbeiterAus(viewer), Date.now()));
}

export async function setzeVorlageAction(eingabe: unknown): Promise<EinfachErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  const r = z.object({ id: ID, vorlage: z.boolean() }).strict().safeParse(eingabe);
  if (!r.success) return UNGUELTIG;
  return withAuditContext({ actor: auditActor(viewer) }, async () => setzeVorlage(getDb(), r.data.id, r.data.vorlage));
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
