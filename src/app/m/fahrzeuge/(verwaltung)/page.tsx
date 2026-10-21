import { headers } from "next/headers";
import { getDb } from "../_db/client";
import { listeFahrzeuge } from "../_lib/daten";
import { requireFahrzeugeHost } from "../_lib/host";
import { darfFahrzeugeVerwalten, requireFahrzeugeZugang } from "../_lib/zugang";
import { FahrzeugVerwaltung } from "../_ui/FahrzeugVerwaltung";

export const dynamic = "force-dynamic";

/** Die Fahrzeugliste. Die Riegel stehen hier noch einmal: eine Route Group ist keine Sicherheitsgrenze. */
export default async function FahrzeugeSeite() {
  requireFahrzeugeHost(await headers());
  const viewer = await requireFahrzeugeZugang();
  return <FahrzeugVerwaltung liste={listeFahrzeuge(getDb())} darfVerwalten={darfFahrzeugeVerwalten(viewer.groups)} />;
}
