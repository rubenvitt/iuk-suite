"use server";

import { z } from "zod";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { austauschDateiname, importierePlan, planDatei, type ExportErgebnis, type PlanImportErgebnis } from "../_lib/austausch";
import { ladePlanFuer } from "../_lib/plaene";
import { PLAN_WEG } from "../_lib/planverwaltung";
import { bearbeiterAus, personAus, requireKommplanAktion } from "../_lib/zugang";

// Export und Import eines Plans (`_lib/austausch.ts`). Exportieren darf, wer den Plan sehen darf — die Datei zeigt
// nichts, was die Ansicht nicht auch zeigt; importieren jeder mit Zugang, als neuen privaten Plan.

export async function exportierePlanAction(planId: unknown): Promise<ExportErgebnis> {
  const viewer = await requireKommplanAktion();
  const id = z.string().min(1).max(64).safeParse(planId);
  const p = id.success ? ladePlanFuer(getDb(), id.data, personAus(viewer)) : null;
  if (!p) return { ok: false, fehler: PLAN_WEG };
  const { plan } = p;
  if (!plan.inhalt) return { ok: false, fehler: "Dieser Plan lässt sich nicht lesen und deshalb nicht exportieren." };
  return { ok: true, datei: planDatei({ ...plan, inhalt: plan.inhalt }, Date.now()), dateiname: austauschDateiname(plan) };
}

export async function importierePlanAction(datei: unknown): Promise<PlanImportErgebnis> {
  const viewer = await requireKommplanAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => importierePlan(getDb(), datei, bearbeiterAus(viewer), Date.now()));
}
