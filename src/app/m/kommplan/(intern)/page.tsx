import { headers } from "next/headers";
import Link from "next/link";
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
  const darf = darfKommplanBearbeiten(viewer.groups);
  return (
    <Huelle>
      <Seitenkopf titel="Kommunikationspläne" beschreibung="Pläne und Fernmeldeskizzen deiner Einsätze. Öffne einen Plan, um ihn anzusehen, zu bearbeiten oder auf A4 zu drucken."
        aktionen={
          <div className="kp-kopfaktionen">
            {darf ? <NeuerPlan /> : null}
            {darf ? <Link href="/bibliothek">Bibliothek</Link> : null}
            {darf ? <Link href="/einstellungen">Einstellungen</Link> : null}
            <Link href="/archiv">Archiv</Link>
          </div>
        } />
      {/* Den Leerzustand trägt die Kartentabelle selbst (`leer`). */}
      <PlanTabelle zeilen={zeilen} />
    </Huelle>
  );
}
