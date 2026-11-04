import { headers } from "next/headers";
import { Seite } from "@/core/seite/Seite";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../../_db/client";
import { requireEinsatzbuchHost } from "../../_lib/host";
import { requireEinsatzbuchZugang } from "../../_lib/zugang";
import { leseEinstellungen } from "../../_lib/einstellungen";
import { EinstellungenFormular } from "../../_ui/EinstellungenFormular";
import { leseSuchlage } from "../../_lib/umsysteme";
import { SuchlageVerbindung } from "../../_ui/SuchlageVerbindung";

export const dynamic = "force-dynamic";

export default async function EinstellungenSeite() {
  requireEinsatzbuchHost(await headers());
  await requireEinsatzbuchZugang();
  const db = getDb();
  const suchlage = leseSuchlage(db);
  return (
    <Seite typ="formular">
      <Seitenkopf titel="Einstellungen" />
      <EinstellungenFormular start={leseEinstellungen(db)} />
      <SuchlageVerbindung start={suchlage ? { adresse: suchlage.adresse, sperreAbgelehnt: suchlage.sperreAbgelehnt } : null} />
    </Seite>
  );
}

export const metadata = { title: "Einstellungen" };
