import { notFound } from "next/navigation";
import { getDb } from "../../../_db/client";
import { idSchema } from "../../../_lib/eingabe";
import { heute } from "../../../_lib/heute";
import { ladeAmGeraet } from "../../../_lib/telefon";
import { requireAngemeldet } from "../../../_lib/zugang";

/** Riegel und Daten jeder Telefonseite: angemeldet, Gerät aktiv, sonst 404. */
export async function geraetOder404(params: Promise<{ id: string }>) {
  const { viewer, rechte } = await requireAngemeldet();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const daten = ladeAmGeraet(getDb(), id, heute());
  if (!daten) notFound();
  return { ...daten, viewer, rechte };
}
