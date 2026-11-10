import { headers } from "next/headers";
import { getDb } from "../../_db/client";
import { listeFahrzeuge } from "../../_lib/fahrzeuge";
import { requireLagemonitorHost } from "../../_lib/host";
import { leseKonfiguration } from "../../_lib/konfiguration";
import { listeKategorien } from "../../_lib/kategorien";
import { listeLagekarte } from "../../_lib/lagekarte";
import { listeLinks } from "../../_lib/links";
import { offeneMeldungen } from "../../_lib/meldungen";
import { onlineAdresse } from "../../_lib/online";
import { listeZugaenge } from "../../_lib/schluessel";
import { listeStandorte } from "../../_lib/standort";
import { requireLagemonitorVerwaltung } from "../../_lib/zugang";
import { AnzeigeVerwaltung } from "../../_ui/AnzeigeVerwaltung";

export const dynamic = "force-dynamic";

/** Die Einrichtung des Lagemonitors (IDA-396). Die Riegel stehen hier noch einmal: eine Route Group ist keine Sicherheitsgrenze. */
export default async function LagemonitorEinrichtung() {
  requireLagemonitorHost(await headers());
  await requireLagemonitorVerwaltung();
  const db = getDb();
  return <AnzeigeVerwaltung konfiguration={leseKonfiguration(db)} zugaenge={listeZugaenge(db)} meldungen={offeneMeldungen(db)} kategorien={listeKategorien(db)} links={listeLinks(db)} online={onlineAdresse()} fahrzeuge={listeFahrzeuge(db)} standorte={listeStandorte(db)} lagekarte={listeLagekarte(db)} />;
}
