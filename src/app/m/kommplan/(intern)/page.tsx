import { headers } from "next/headers";
import Link from "next/link";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../_db/client";
import { requireKommplanHost } from "../_lib/host";
import { listePlaene } from "../_lib/plaene";
import { vorlagenZurAuswahl } from "../_lib/planverwaltung";
import { heuteIso } from "../_lib/tagesfassung";
import { darfKommplanBearbeiten, personAus, requireKommplanZugang } from "../_lib/zugang";
import { Huelle } from "../_ui/Huelle";
import { PlanImport } from "./PlanImport";
import { NeuerPlan } from "./NeuerPlan";
import { PlanTabelle } from "./PlanTabelle";

export const dynamic = "force-dynamic";

export default async function Planliste() {
  requireKommplanHost(await headers());
  const viewer = await requireKommplanZugang();
  const db = getDb();
  // Anlegen und Importieren darf jeder mit Zugang (der Plan ist privat); Bibliothek und Einstellungen nur der Admin.
  const admin = darfKommplanBearbeiten(viewer.groups);
  const wer = personAus(viewer);
  const vorlagen = vorlagenZurAuswahl(db, wer);
  // `new Date()` statt `Date.now()`: `react-hooks/purity` (Vorbild `files/(verwaltung)/posteingang/page.tsx`).
  const heute = heuteIso(new Date().getTime());
  return (
    <Huelle>
      <Seitenkopf titel="Kommunikationspläne"
        beschreibung="Pläne und Fernmeldeskizzen deiner Einsätze. Ein neuer Plan ist privat, bis du ihn in der Organisation teilst."
        aktionen={
          <div className="kp-kopfaktionen">
            <NeuerPlan vorlagen={vorlagen} heute={heute} />
            <PlanImport />
            {admin ? <Link href="/bibliothek">Bibliothek</Link> : null}
            {admin ? <Link href="/einstellungen">Einstellungen</Link> : null}
            <Link href="/archiv">Archiv</Link>
          </div>
        } />
      {/* Den Leerzustand trägt die Kartentabelle selbst (`leer`). */}
      <PlanTabelle zeilen={listePlaene(db, "plaene", wer)} liste="plaene" />
      <h2 className="kp-abschnittstitel">Vorlagen</h2>
      <PlanTabelle zeilen={listePlaene(db, "vorlagen", wer)} liste="vorlagen" vorlagen={vorlagen} heute={heute} />
    </Huelle>
  );
}
