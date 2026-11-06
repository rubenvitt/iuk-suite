"use server";

import { auditActor, withAuditContext } from "@/core/audit/server";
import type { Ergebnis } from "../_lib/typen";
import { anlassVermerkenVorgang, stundenEintragenVorgang } from "../_lib/vorgaenge";
import { requireAktion } from "../_lib/zugang";

/**
 * Betriebsstunden am Gerät ablesen — jeder Angemeldete (Entscheidung an IDA-307). Prüfung und Mangel gehen
 * über Route Handler, weil Fotos mitkommen (`g/[id]/pruefung/senden`, `g/[id]/mangel/senden`).
 */
export async function stundenEintragenAction(geraetId: string, eingabe: unknown): Promise<Ergebnis> {
  const z = await requireAktion("zugang");
  return withAuditContext({ actor: auditActor(z.viewer) }, () => stundenEintragenVorgang(z, geraetId, eingabe));
}

/** „Wird eingesetzt“ bzw. „Zurück“ (IDA-369) — wie das Prüfen jeder Angemeldete, am Gerät und in der Akte. */
export async function anlassVermerkenAction(geraetId: string, anlass: unknown): Promise<Ergebnis> {
  const z = await requireAktion("zugang");
  return withAuditContext({ actor: auditActor(z.viewer) }, () => anlassVermerkenVorgang(z, geraetId, anlass));
}
