"use server";

import { revalidatePath } from "next/cache";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";
import { loescheVeranstaltung, NichtGefunden, speichereVeranstaltung } from "../_lib/daten";
import { idSchema, veranstaltungEingabe } from "../_lib/eingabe";
import { requireVeranstaltungenAktion } from "../_lib/zugang";

const UNGUELTIG = "Die Angaben sind unvollständig. Bitte die Seite neu laden.";

/** Die erwartbaren Fehler werden zum Satz; alles andere wirft weiter. */
function ergebnis<T>(schreiben: () => T): ActionErgebnis<T> {
  try {
    const wert = schreiben();
    revalidatePath("/m/veranstaltungen", "layout");
    return { ok: true, wert } as ActionErgebnis<T>;
  } catch (e) {
    if (e instanceof NichtGefunden) return { ok: false, fehler: e.message };
    throw e;
  }
}

/** Anlegen (`id === null`) oder ändern; gibt die Kennung zurück. */
export async function veranstaltungSpeichernAction(id: string | null, eingabe: unknown): Promise<ActionErgebnis<string>> {
  const viewer = await requireVeranstaltungenAktion();
  if (id !== null && !idSchema.safeParse(id).success) return { ok: false, fehler: UNGUELTIG };
  const e = veranstaltungEingabe.safeParse(eingabe);
  if (!e.success) return { ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: zodFehler(e.error) ?? undefined };
  return withAuditContext({ actor: auditActor(viewer) }, async () => ergebnis(() => speichereVeranstaltung(getDb(), id, e.data)));
}

/** Nur Modul-Admins. Planungen, die auf die Veranstaltung verweisen, bleiben stehen. */
export async function veranstaltungLoeschenAction(id: string): Promise<ActionErgebnis> {
  const viewer = await requireVeranstaltungenAktion(true);
  if (!idSchema.safeParse(id).success) return { ok: false, fehler: UNGUELTIG };
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const r = ergebnis(() => loescheVeranstaltung(getDb(), id));
    return r.ok ? { ok: true } : r;
  });
}
