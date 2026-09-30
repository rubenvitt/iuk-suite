import { headers } from "next/headers";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../_db/client";
import { requireKommplanHost } from "../_lib/host";
import { listePlaene } from "../_lib/plaene";
import { darfKommplanBearbeiten, requireKommplanZugang } from "../_lib/zugang";
import { Huelle } from "../_ui/Huelle";
import { NeuerPlan } from "./NeuerPlan";
import { PlanTabelle } from "./PlanTabelle";

export const dynamic = "force-dynamic";

export default async function Planliste() {
  requireKommplanHost(await headers());
  const viewer = await requireKommplanZugang();
  const zeilen = listePlaene(getDb());
  return (
    <Huelle>
      <Seitenkopf titel="Kommunikationspläne" beschreibung="Pläne und Fernmeldeskizzen deiner Einsätze. Öffne einen Plan, um ihn anzusehen, zu bearbeiten oder auf A4 zu drucken."
        aktionen={darfKommplanBearbeiten(viewer.groups) ? <NeuerPlan /> : undefined} />
      {/* Den Leerzustand trägt die Kartentabelle selbst (`leer`). */}
      <PlanTabelle zeilen={zeilen} />
    </Huelle>
  );
}
