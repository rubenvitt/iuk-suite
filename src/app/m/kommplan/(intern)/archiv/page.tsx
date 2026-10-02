import { headers } from "next/headers";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "@/app/m/kommplan/_db/client";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { listePlaene } from "@/app/m/kommplan/_lib/plaene";
import { darfKommplanBearbeiten, requireKommplanZugang } from "@/app/m/kommplan/_lib/zugang";
import { Huelle } from "@/app/m/kommplan/_ui/Huelle";
import { PlanTabelle } from "../PlanTabelle";

export const dynamic = "force-dynamic";

/** Archiv (Spec §8.3; Entscheidung 10): für alle mit Zugang lesbar; „Wiederherstellen" und „Endgültig löschen" nur für Bearbeitende. */
export default async function Archiv() {
  requireKommplanHost(await headers());
  const viewer = await requireKommplanZugang();
  const darf = darfKommplanBearbeiten(viewer.groups);
  return (
    <Huelle>
      <Seitenkopf titel="Archiv" zurueck={{ titel: "Alle Pläne", href: "/" }}
        beschreibung={`Archivierte Pläne lassen sich ansehen und drucken, aber nicht bearbeiten. Wiederhergestellt stehen sie wieder in der Liste.${darf ? " Endgültig gelöscht sind sie samt ihrer Links weg." : ""}`} />
      <PlanTabelle zeilen={listePlaene(getDb(), "archiv")} liste="archiv" darfBearbeiten={darf} />
    </Huelle>
  );
}
