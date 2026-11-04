import { headers } from "next/headers";
import { getDb } from "../../../../_db/client";
import { fahrzeugAuswahl, stammHelfer } from "../../../../_lib/bestand";
import { requireSchichtplanHost } from "../../../../_lib/host";
import { darfPlanungLoeschen, planungOder404, requireSchichtplanZugang } from "../../../../_lib/zugang";
import { PlanEditor } from "../../../../_ui/PlanEditor";

export const dynamic = "force-dynamic";

/** Der Editor einer Planung: Raster, Helfer, Prüfen, Ausgabe als Reiter (`?ansicht=`). */
export default async function PlanungSeite({ params }: { params: Promise<{ planId: string }> }) {
  requireSchichtplanHost(await headers());
  const viewer = await requireSchichtplanZugang();
  const planung = planungOder404(getDb(), (await params).planId);
  return (
    <PlanEditor
      start={planung}
      stamm={stammHelfer()}
      fahrzeuge={fahrzeugAuswahl()}
      darfLoeschen={darfPlanungLoeschen(viewer.groups)}
      jetzt={new Date().getTime()}
    />
  );
}

export const metadata = { title: "Planung" };
