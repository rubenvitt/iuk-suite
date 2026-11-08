import { notFound } from "next/navigation";
import { getDb } from "../../../_db/client";
import { idSchema } from "../../../_lib/eingabe";
import { heute } from "../../../_lib/heute";
import { ladeAmGeraet } from "../../../_lib/telefon";
import { besucher, requireZugang } from "../../../_lib/zugang";

async function geraet(params: Promise<{ id: string }>, pruefartId?: string | null) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const daten = ladeAmGeraet(getDb(), id, heute(), pruefartId);
  if (!daten) notFound();
  return daten;
}

/**
 * Riegel und Daten der Telefonseiten mit Modulzugang (Prüfung, Stunden): sonst Login bzw. 404. `pruefartId` wählt
 * die Prüfung am Gerät (IDA-369); `unterpfad` ist der Rückweg nach der Anmeldung, samt Auswahl.
 */
export async function geraetOder404(params: Promise<{ id: string }>, unterpfad: string, pruefartId?: string | null) {
  const { id } = await params;
  const { viewer, rechte } = await requireZugang(`/g/${encodeURIComponent(id)}/${unterpfad}`);
  return { ...(await geraet(params, pruefartId)), viewer, rechte };
}

/** Steckbrief und Mangel melden: jeder mit dem QR-Code, auch ohne Anmeldung (IDA-337). */
export async function geraetOeffentlich(params: Promise<{ id: string }>) {
  const b = await besucher();
  return { ...(await geraet(params)), ...b };
}
