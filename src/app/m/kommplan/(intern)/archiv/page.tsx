import { headers } from "next/headers";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "@/app/m/kommplan/_db/client";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { listePlaene } from "@/app/m/kommplan/_lib/plaene";
import { personAus, requireKommplanZugang } from "@/app/m/kommplan/_lib/zugang";
import { Huelle } from "@/app/m/kommplan/_ui/Huelle";
import { PlanTabelle } from "../PlanTabelle";

export const dynamic = "force-dynamic";

/** Archiv (Spec §8.3; Entscheidung 10): was du sehen darfst; „Wiederherstellen" nur, wer den Plan verwaltet (`_lib/rechte.ts`). */
export default async function Archiv() {
  requireKommplanHost(await headers());
  const viewer = await requireKommplanZugang();
  return (
    <Huelle>
      <Seitenkopf titel="Archiv" zurueck={{ titel: "Alle Pläne", href: "/" }}
        beschreibung="Archivierte Pläne lassen sich ansehen und drucken, aber nicht bearbeiten. Wiederhergestellt stehen sie wieder in der Liste." />
      <PlanTabelle zeilen={listePlaene(getDb(), "archiv", personAus(viewer))} liste="archiv" />
    </Huelle>
  );
}
