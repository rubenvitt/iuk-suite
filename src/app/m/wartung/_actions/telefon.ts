"use server";

import { auditActor, withAuditContext } from "@/core/audit/server";
import type { Ergebnis } from "../_lib/typen";
import { entnehmenVorgang, stundenEintragenVorgang, zuruecklegenVorgang } from "../_lib/vorgaenge";
import { requireAktion } from "../_lib/zugang";

/**
 * Betriebsstunden am Gerät ablesen — jeder Angemeldete (Entscheidung an IDA-307). Prüfung und Mangel gehen
 * über Route Handler, weil Fotos mitkommen (`g/[id]/pruefung/senden`, `g/[id]/mangel/senden`).
 */
export async function stundenEintragenAction(geraetId: string, eingabe: unknown): Promise<Ergebnis> {
  const z = await requireAktion("zugang");
  return withAuditContext({ actor: auditActor(z.viewer) }, () => stundenEintragenVorgang(z, geraetId, eingabe));
}

/** Aus einer Kiste mitnehmen — jeder Angemeldete. */
export async function entnehmenAction(geraetId: string, eingabe: unknown): Promise<Ergebnis> {
  const z = await requireAktion("zugang");
  return withAuditContext({ actor: auditActor(z.viewer) }, () => entnehmenVorgang(z, geraetId, eingabe));
}

/** Zurücklegen — jeder Angemeldete, auch für Entnahmen anderer. */
export async function zuruecklegenAction(geraetId: string, eingabe: unknown): Promise<Ergebnis> {
  const z = await requireAktion("zugang");
  return withAuditContext({ actor: auditActor(z.viewer) }, () => zuruecklegenVorgang(z, geraetId, eingabe));
}
