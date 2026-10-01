"use server";

import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import type { FreigabeErgebnis } from "../_lib/ergebnis";
import { stelleFreigabeAus, widerrufeFreigabe } from "../_lib/freigaben";
import { bearbeiterAus, requireKommplanBearbeitenAktion } from "../_lib/zugang";

// Token-Links (Spec §8.2): Plan und Link werden in `_lib/freigaben.ts` gegen die Datenbank aufgelöst (IDOR).
// Beide geben die ganze Liste zurück — das Flyin und der QR-Hinweis rechnen nie selbst mit der Uhr.

export async function stelleFreigabeAusAction(eingabe: unknown): Promise<FreigabeErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => stelleFreigabeAus(getDb(), eingabe, bearbeiterAus(viewer), Date.now()));
}

export async function widerrufeFreigabeAction(eingabe: unknown): Promise<FreigabeErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => widerrufeFreigabe(getDb(), eingabe, Date.now()));
}
