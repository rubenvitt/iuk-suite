import { headers } from "next/headers";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../_db/client";
import { requireKommplanHost } from "../_lib/host";
import { listePlaene } from "../_lib/plaene";
import { vorlagenZurAuswahl } from "../_lib/planverwaltung";
import { heuteIso } from "../_lib/tagesfassung";
import { personAus, requireKommplanZugang } from "../_lib/zugang";
import { Huelle } from "../_ui/Huelle";
import { PlanImport } from "./PlanImport";
import { NeuerPlan } from "./NeuerPlan";
import { PlanTabelle } from "./PlanTabelle";

export const dynamic = "force-dynamic";

export default async function Planliste() {
  requireKommplanHost(await headers());
  const viewer = await requireKommplanZugang();
  const db = getDb();
  // Anlegen und Importieren darf jeder mit Zugang (der Plan ist privat); Bibliothek und Einstellungen stehen im Menü (`_lib/nav.ts`).
  const wer = personAus(viewer);
  const vorlagen = vorlagenZurAuswahl(db, wer);
  // `new Date()` statt `Date.now()`: `react-hooks/purity` (Vorbild `files/(verwaltung)/posteingang/page.tsx`).
  const jetzt = new Date().getTime();
  const heute = heuteIso(jetzt);
  return (
    <Huelle viewer={viewer}>
      <Seitenkopf titel="Kommunikationspläne"
        aktionen={
          <div className="kp-kopfaktionen">
            <NeuerPlan vorlagen={vorlagen} heute={heute} />
            <PlanImport />
          </div>
        } />
      {/* Den Leerzustand trägt die Kartentabelle selbst (`leer`). */}
      <PlanTabelle zeilen={listePlaene(db, "plaene", wer, jetzt)} liste="plaene" />
      <h2 className="kp-abschnittstitel">Vorlagen</h2>
      <PlanTabelle zeilen={listePlaene(db, "vorlagen", wer, jetzt)} liste="vorlagen" vorlagen={vorlagen} heute={heute} />
    </Huelle>
  );
}
