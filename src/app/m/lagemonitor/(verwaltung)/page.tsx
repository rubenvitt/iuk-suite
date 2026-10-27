import { headers } from "next/headers";
import { getDb } from "../_db/client";
import { requireLagemonitorHost } from "../_lib/host";
import { leseKonfiguration } from "../_lib/konfiguration";
import { listeZugaenge } from "../_lib/schluessel";
import { requireLagemonitorVerwaltung } from "../_lib/zugang";
import { AnzeigeVerwaltung } from "../_ui/AnzeigeVerwaltung";

export const dynamic = "force-dynamic";

/** Die Anzeige des Lagemonitors. Die Riegel stehen hier noch einmal: eine Route Group ist keine Sicherheitsgrenze. */
export default async function LagemonitorSeite() {
  requireLagemonitorHost(await headers());
  await requireLagemonitorVerwaltung();
  const db = getDb();
  return <AnzeigeVerwaltung konfiguration={leseKonfiguration(db)} zugaenge={listeZugaenge(db)} />;
}
