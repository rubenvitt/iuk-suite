import { headers } from "next/headers";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../../_db/client";
import { requireEinsatzbuchHost } from "../../_lib/host";
import { requireEinsatzbuchZugang } from "../../_lib/zugang";
import { leseEinstellungen } from "../../_lib/einstellungen";
import { EinstellungenFormular } from "../../_ui/EinstellungenFormular";

export const dynamic = "force-dynamic";

export default async function EinstellungenSeite() {
  requireEinsatzbuchHost(await headers());
  await requireEinsatzbuchZugang();
  return (
    <>
      <Seitenkopf titel="Einstellungen" beschreibung="Diese Werte bekommt der Einsatzbuch-Rechner zusammen mit den Stammdaten." />
      <EinstellungenFormular start={leseEinstellungen(getDb())} />
    </>
  );
}
