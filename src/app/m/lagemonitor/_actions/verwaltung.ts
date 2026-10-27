"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";
import { konfigurationEingabe, speichereKonfiguration, type KonfigurationDTO } from "../_lib/konfiguration";
import { legeZugangAn, widerrufeZugang } from "../_lib/schluessel";
import { anzeigeName, requireLagemonitorAktion } from "../_lib/zugang";

function neuLaden(): void {
  revalidatePath("/m/lagemonitor", "layout");
}

/** Speichert die Anzeige. Der Lagemonitor holt sie spätestens nach einer Minute ab. */
export async function anzeigeSpeichernAction(eingabe: unknown): Promise<ActionErgebnis<KonfigurationDTO>> {
  const viewer = await requireLagemonitorAktion();
  const e = konfigurationEingabe.safeParse(eingabe);
  if (!e.success) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: zodFehler(e.error) ?? undefined };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const wert = speichereKonfiguration(getDb(), e.data, anzeigeName(viewer));
    neuLaden();
    return { ok: true, wert };
  });
}

const bezeichnungSchema = z.string().trim().min(1, "Bitte eine Bezeichnung angeben, etwa „FüKw Uelzen“.").max(60, "Höchstens 60 Zeichen.");

/** Legt einen Schlüssel an. Er steht nur in dieser Antwort; gespeichert ist allein sein Hash. */
export async function zugangAnlegenAction(bezeichnung: unknown): Promise<ActionErgebnis<{ schluessel: string }>> {
  const viewer = await requireLagemonitorAktion();
  const b = bezeichnungSchema.safeParse(bezeichnung);
  if (!b.success) return { ok: false, fehler: b.error.issues[0].message, feldFehler: { bezeichnung: b.error.issues[0].message } };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const { schluessel } = legeZugangAn(getDb(), b.data, anzeigeName(viewer));
    neuLaden();
    return { ok: true, wert: { schluessel } };
  });
}

export async function zugangWiderrufenAction(id: unknown): Promise<ActionErgebnis> {
  const viewer = await requireLagemonitorAktion();
  if (typeof id !== "string" || id.length === 0 || id.length > 64) return { ok: false, fehler: "Unbekannter Zugang." };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    if (!widerrufeZugang(getDb(), id)) return { ok: false, fehler: "Diesen Zugang gibt es nicht mehr." };
    neuLaden();
    return { ok: true };
  });
}
