import "../../_ui/ehrlich.css";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../../_db/client";
import { holeDetail, listeMitteilungen } from "../../_lib/ehrlich/daten";
import { requireEhrlichLeser } from "../../_lib/ehrlich/zugang";
import { EhrlichVerwaltung, type Filter } from "../../_ui/EhrlichVerwaltung";

/**
 * DIE VERWALTUNG VON „EHRLICH GESAGT" (IDA-314): Eingang links, gewählte Mitteilung rechts (schmal: nur eins
 * von beiden). Die Auswahl steht in `?m=`, damit „Zurück" des Browsers und ein Neuladen dort bleiben.
 * Der Riegel ist die Lesegruppe, nicht der Modulzugang — `feedback-admin` sieht den Kasten nicht.
 */
export default async function EhrlichGesagtSeite({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; filter?: string }>;
}) {
  await requireEhrlichLeser();
  const { m, filter: f } = await searchParams;
  const db = getDb();
  const liste = listeMitteilungen(db);
  const gewaehlt = m && /^\d+$/.test(m) ? holeDetail(db, Number(m)) : null;
  const filter: Filter = f === "erledigt" || f === "alle" ? f : "offen";
  const zahl = (s: string) => liste.filter((z) => z.status === s).length;

  return (
    <div style={{ maxWidth: 1120 }}>
      <Seitenkopf
        titel="Ehrlich gesagt"
        beschreibung={`${zahl("neu")} neu · ${zahl("bearbeitung")} in Bearbeitung · ${zahl("erledigt")} erledigt`}
      />
      <EhrlichVerwaltung liste={liste} detail={gewaehlt} filter={filter} />
    </div>
  );
}
