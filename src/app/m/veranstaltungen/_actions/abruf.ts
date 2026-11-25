"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import type { ActionErgebnis } from "../_lib/actionErgebnis";
import { legeZugangAn, widerrufeZugang } from "../_lib/schluessel";
import { anzeigeName, requireVeranstaltungenAktion } from "../_lib/zugang";

const bezeichnungSchema = z.string().trim().min(1, "Bitte eine Bezeichnung angeben, etwa „Lifeline Hub“.").max(80, "Höchstens 80 Zeichen.");

/** Nur Modul-Admins: legt einen Abruf-Zugang an (LLH-2097). Der Schlüssel steht nur in dieser Antwort. */
export async function abrufZugangAnlegenAction(bezeichnung: unknown): Promise<ActionErgebnis<{ schluessel: string }>> {
  const viewer = await requireVeranstaltungenAktion(true);
  const b = bezeichnungSchema.safeParse(bezeichnung);
  if (!b.success) return { ok: false, fehler: b.error.issues[0].message, feldFehler: { bezeichnung: b.error.issues[0].message } };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const { schluessel } = legeZugangAn(getDb(), b.data, anzeigeName(viewer));
    revalidatePath("/m/veranstaltungen", "layout");
    return { ok: true, wert: { schluessel } };
  });
}

/** Nur Modul-Admins: widerruft einen Abruf-Zugang; Lifeline Hub bekommt ab dann 401. */
export async function abrufZugangWiderrufenAction(id: unknown): Promise<ActionErgebnis> {
  const viewer = await requireVeranstaltungenAktion(true);
  if (typeof id !== "string" || id.length === 0 || id.length > 64) return { ok: false, fehler: "Unbekannter Zugang." };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    if (!widerrufeZugang(getDb(), id)) return { ok: false, fehler: "Diesen Zugang gibt es nicht mehr." };
    revalidatePath("/m/veranstaltungen", "layout");
    return { ok: true };
  });
}
