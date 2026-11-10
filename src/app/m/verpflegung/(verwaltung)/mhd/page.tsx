import { redirect } from "next/navigation";
import { requireZugang } from "../../_lib/zugang";

export const dynamic = "force-dynamic";

/**
 * Die frühere MHD-Kontrolle ist seit IDA-382 eine Stufe des Bestands. Die Adresse bleibt für Lesezeichen und alte
 * Einträge in „Was steht an“; sie führt auf die kritischen Chargen.
 */
export default async function MhdSeite() {
  await requireZugang("/mhd");
  redirect("/bestand?stufe=kritisch");
}
