import { headers } from "next/headers";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { SPACE } from "@/core/theme/tokens";
import { getDb } from "../../_db/client";
import { listeFahrzeuge } from "../../_lib/daten";
import { zugeordneteSchluessel } from "../../_lib/erstimport/anwenden";
import { planeErstimport } from "../../_lib/erstimport/plan";
import { leseKandidaten } from "../../_lib/erstimport/quellen";
import { requireFahrzeugeHost } from "../../_lib/host";
import { darfFahrzeugeVerwalten, requireFahrzeugeZugang } from "../../_lib/zugang";
import { Erstimport } from "../../_ui/Erstimport";

export const dynamic = "force-dynamic";

/**
 * Der Erstimport (IDA-256): die Fahrzeugzeilen aus Einsatzbuch, Lagerbuch und Funkgeräten, als
 * Vorschläge gegen den Bestand. Geplant wird hier beim Aufruf (schreibt nichts); „Übernehmen“ plant in
 * der Action neu. Ohne Verwaltungsrecht nur ein Satz — die Vorschau zeigt Daten anderer Apps.
 */
export default async function ErstimportSeite() {
  requireFahrzeugeHost(await headers());
  const viewer = await requireFahrzeugeZugang();
  const kopf = (
    <Seitenkopf
      titel="Erstimport"
      beschreibung="Die Fahrzeuge aus Einsatzbuch, Lagerbuch und Funkgeräten einmal abgleichen: was zusammengehört, wird ein Fahrzeug hier, und jede Zeile in den Apps merkt sich, zu welchem es gehört. Nichts in den Apps wird dabei geändert."
      zurueck={{ titel: "Fahrzeuge", href: "/" }}
    />
  );
  if (!darfFahrzeugeVerwalten(viewer.groups)) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.xl }}>
        {kopf}
        <p style={{ margin: 0 }}>Den Erstimport führt eine Person mit Verwaltungsrecht durch.</p>
      </div>
    );
  }
  const db = getDb();
  const bestand = listeFahrzeuge(db);
  const { kandidaten, fehler } = leseKandidaten();
  const plan = planeErstimport(kandidaten, bestand, zugeordneteSchluessel(db));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.xl }}>
      {kopf}
      <Erstimport
        key={plan.vorschlaege.map((v) => v.schluessel).join("|")}
        plan={plan}
        bestand={bestand.map((f) => ({ id: f.id, funkrufname: f.funkrufname, funkkenner: f.funkkenner, aktiv: f.aktiv }))}
        fehler={fehler}
      />
    </div>
  );
}
