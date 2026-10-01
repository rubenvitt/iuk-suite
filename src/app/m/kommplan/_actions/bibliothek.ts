"use server";

import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { importiereBibEinheiten, importiereBibVerbindungen, loescheBibEintrag, speichereBibEinheit, speichereBibStelle, speichereBibVerbindung } from "../_lib/bibliothekDb";
import type { BibEinheitErgebnis, BibStelleErgebnis, BibVerbindungErgebnis, EinfachErgebnis, ImportErgebnis, VerbindungsImportErgebnis } from "../_lib/ergebnis";
import { requireKommplanBearbeitenAktion } from "../_lib/zugang";

// Bibliothek (Spec §4.3, §6.1): jede Action prüft selbst; Schema, Dubletten und IDs in `_lib/bibliothekDb.ts`.
// Kein revalidatePath: die Seite ruft `router.refresh()`, der Editor ergänzt seinen Kontext selbst.

export async function speichereBibStelleAction(eingabe: unknown): Promise<BibStelleErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => speichereBibStelle(getDb(), eingabe));
}

export async function speichereBibEinheitAction(eingabe: unknown): Promise<BibEinheitErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => speichereBibEinheit(getDb(), eingabe));
}

export async function speichereBibVerbindungAction(eingabe: unknown): Promise<BibVerbindungErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => speichereBibVerbindung(getDb(), eingabe));
}

export async function loescheBibEintragAction(eingabe: unknown): Promise<EinfachErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => loescheBibEintrag(getDb(), eingabe));
}

export async function importiereBibEinheitenAction(eingabe: unknown): Promise<ImportErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => importiereBibEinheiten(getDb(), eingabe));
}

export async function importiereBibVerbindungenAction(eingabe: unknown): Promise<VerbindungsImportErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => importiereBibVerbindungen(getDb(), eingabe));
}
