"use server";

import { revalidatePath } from "next/cache";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import {
  aendereMitglied, entferneMitglied, erneuereLink, idSchema, legeMitgliedAn, MitgliedNichtGefunden, mitgliedEingabe,
} from "../_lib/mitglieder";
import type { MitgliederErgebnis } from "../_lib/mitgliederAnzeige";
import { requireLeitungAktion, type Viewer } from "../_lib/zugang";

/*
 * Die Mitgliederpflege der Leitung (`/mitglieder`). Jede Action prüft Host, Sitzung und Leitungsrecht selbst
 * (`requireLeitungAktion`) und läuft im Audit-Kontext der angemeldeten Person.
 */

const UNGUELTIG = "Die Angaben sind unvollständig. Bitte die Seite neu laden.";

/** Schreibt im Audit-Kontext der Leitung; die erwartbare Ablehnung wird zum Satz, alles andere wirft weiter. */
async function alsLeitung(viewer: Viewer, schreiben: () => void): Promise<MitgliederErgebnis> {
  return withAuditContext({ actor: auditActor(viewer) }, async (): Promise<MitgliederErgebnis> => {
    try {
      schreiben();
    } catch (e) {
      if (e instanceof MitgliedNichtGefunden) return { ok: false, fehler: e.message };
      throw e;
    }
    revalidatePath("/m/gemeinschaft", "layout");
    return { ok: true };
  });
}

function pruefe(eingabe: unknown) {
  const e = mitgliedEingabe.safeParse(eingabe);
  if (e.success) return { ok: true as const, wert: e.data };
  const feldFehler: Record<string, string> = {};
  for (const p of e.error.issues) {
    const feld = p.path.join(".") || "_";
    if (!(feld in feldFehler)) feldFehler[feld] = p.message;
  }
  return { ok: false as const, fehler: "Bitte die markierten Felder prüfen.", feldFehler };
}

export async function mitgliedAnlegenAction(eingabe: unknown): Promise<MitgliederErgebnis> {
  const viewer = await requireLeitungAktion();
  const e = pruefe(eingabe);
  if (!e.ok) return e;
  return alsLeitung(viewer, () => { legeMitgliedAn(getDb(), e.wert, Date.now()); });
}

export async function mitgliedSpeichernAction(id: string, eingabe: unknown): Promise<MitgliederErgebnis> {
  const viewer = await requireLeitungAktion();
  if (!idSchema.safeParse(id).success) return { ok: false, fehler: UNGUELTIG };
  const e = pruefe(eingabe);
  if (!e.ok) return e;
  return alsLeitung(viewer, () => aendereMitglied(getDb(), id, e.wert, Date.now()));
}

/** Neuer persönlicher Link; der alte gilt ab sofort nicht mehr. */
export async function mitgliedNeuerLinkAction(id: string): Promise<MitgliederErgebnis> {
  const viewer = await requireLeitungAktion();
  if (!idSchema.safeParse(id).success) return { ok: false, fehler: UNGUELTIG };
  return alsLeitung(viewer, () => { erneuereLink(getDb(), id, Date.now()); });
}

/** Zuständigkeiten fallen weg, eine Verantwortung wird leer, die Aufgaben bleiben. */
export async function mitgliedEntfernenAction(id: string): Promise<MitgliederErgebnis> {
  const viewer = await requireLeitungAktion();
  if (!idSchema.safeParse(id).success) return { ok: false, fehler: UNGUELTIG };
  return alsLeitung(viewer, () => entferneMitglied(getDb(), id));
}
