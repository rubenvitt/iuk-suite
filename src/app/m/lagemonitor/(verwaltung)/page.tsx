import { headers } from "next/headers";
import { getDb } from "../_db/client";
import { requireLagemonitorHost } from "../_lib/host";
import { leseKonfiguration } from "../_lib/konfiguration";
import { listeKategorien } from "../_lib/kategorien";
import { listeLagekarte } from "../_lib/lagekarte";
import { offeneMeldungen } from "../_lib/meldungen";
import { onlineAdresse } from "../_lib/online";
import { listeZugaenge } from "../_lib/schluessel";
import { listeStandorte } from "../_lib/standort";
import { requireLagemonitorVerwaltung } from "../_lib/zugang";
import { MeldungenSeite } from "../_ui/MeldungenSeite";

export const dynamic = "force-dynamic";

/** Die Meldungen des Lagemonitors, Startseite (IDA-396). Die Riegel stehen hier noch einmal: eine Route Group ist keine Sicherheitsgrenze. */
export default async function LagemonitorSeite() {
  requireLagemonitorHost(await headers());
  await requireLagemonitorVerwaltung();
  const db = getDb();
  return (
    <MeldungenSeite
      konfiguration={leseKonfiguration(db)}
      meldungen={offeneMeldungen(db)}
      kategorien={listeKategorien(db)}
      online={onlineAdresse()}
      zugaenge={listeZugaenge(db)}
      standorte={listeStandorte(db).je}
      lagekarte={listeLagekarte(db).liste}
    />
  );
}
