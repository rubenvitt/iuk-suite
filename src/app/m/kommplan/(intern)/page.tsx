import { headers } from "next/headers";
import Link from "next/link";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../_db/client";
import { requireKommplanHost } from "../_lib/host";
import { listePlaene } from "../_lib/plaene";
import { vorlagenZurAuswahl } from "../_lib/planverwaltung";
import { heuteIso } from "../_lib/tagesfassung";
import { darfKommplanBearbeiten, requireKommplanZugang } from "../_lib/zugang";
import { Huelle } from "../_ui/Huelle";
import { NeuerPlan } from "./NeuerPlan";
import { PlanTabelle } from "./PlanTabelle";

export const dynamic = "force-dynamic";

export default async function Planliste() {
  requireKommplanHost(await headers());
  const viewer = await requireKommplanZugang();
  const db = getDb();
  const darf = darfKommplanBearbeiten(viewer.groups);
  const vorlagen = vorlagenZurAuswahl(db);
  // `new Date()` statt `Date.now()`: `react-hooks/purity` (Vorbild `files/(verwaltung)/posteingang/page.tsx`).
  const jetzt = new Date().getTime();
  const heute = heuteIso(jetzt);
  return (
    <Huelle>
      <Seitenkopf titel="Kommunikationspläne"
        beschreibung={`Pläne und Fernmeldeskizzen deiner Einsätze. Öffne einen Plan, um ihn anzusehen${darf ? ", zu bearbeiten" : ""} oder zu drucken.`}
        aktionen={
          <div className="kp-kopfaktionen">
            {darf ? <NeuerPlan vorlagen={vorlagen} heute={heute} /> : null}
            {darf ? <Link href="/bibliothek">Bibliothek</Link> : null}
            {darf ? <Link href="/einstellungen">Einstellungen</Link> : null}
            <Link href="/archiv">Archiv</Link>
          </div>
        } />
      {/* Den Leerzustand trägt die Kartentabelle selbst (`leer`). */}
      <PlanTabelle zeilen={listePlaene(db, "plaene", jetzt)} liste="plaene" darfBearbeiten={darf} />
      <h2 className="kp-abschnittstitel">Vorlagen</h2>
      <PlanTabelle zeilen={listePlaene(db, "vorlagen", jetzt)} liste="vorlagen" darfBearbeiten={darf} vorlagen={vorlagen} heute={heute} />
    </Huelle>
  );
}
