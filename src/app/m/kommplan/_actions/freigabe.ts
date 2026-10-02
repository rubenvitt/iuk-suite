"use server";

import { z } from "zod";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import type { FreigabeErgebnis } from "../_lib/ergebnis";
import type { FreigabeZeile } from "../_lib/freigabe/regeln";
import { freigabenFuer, stelleFreigabeAus, widerrufeFreigabe } from "../_lib/freigaben";
import { rechteAn } from "../_lib/rechte";
import { bearbeiterAus, personAus, requireKommplanAktion } from "../_lib/zugang";

// Token-Links (Spec §8.2): Plan, Link und das Recht daran (verwalten, `_lib/rechte.ts`) werden in
// `_lib/freigaben.ts` gegen die Datenbank aufgelöst (IDOR).
// Beide geben die ganze Liste zurück — das Flyin und der QR-Hinweis rechnen nie selbst mit der Uhr.

export async function stelleFreigabeAusAction(eingabe: unknown): Promise<FreigabeErgebnis> {
  const viewer = await requireKommplanAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => stelleFreigabeAus(getDb(), eingabe, bearbeiterAus(viewer), Date.now(), personAus(viewer)));
}

export async function widerrufeFreigabeAction(eingabe: unknown): Promise<FreigabeErgebnis> {
  const viewer = await requireKommplanAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => widerrufeFreigabe(getDb(), eingabe, Date.now(), personAus(viewer)));
}

/**
 * Lesend (Review Phase 5): der Editor gleicht die Liste beim Montieren und beim Öffnen von „Teilen“ und „Plan und
 * Verbindungen“ ab — ein Link läuft ab, während der Editor offen ist; Browser-Zurück und ein zweiter Tab zeigten
 * sonst einen alten Stand. Der Status kommt wie immer vom Server. Nur die Links DIESES Plans (`freigabenFuer`).
 */
export async function ladeFreigabenAction(planId: unknown): Promise<FreigabeZeile[] | null> {
  const viewer = await requireKommplanAktion();
  const r = z.string().min(1).max(64).safeParse(planId);
  return r.success && rechteAn(getDb(), r.data, personAus(viewer)).verwalten ? freigabenFuer(getDb(), r.data, Date.now()) : null;
}
