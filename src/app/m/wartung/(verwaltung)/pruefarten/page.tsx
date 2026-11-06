import { getDb } from "../../_db/client";
import { ladeArten, ladePruefarten } from "../../_lib/daten";
import { requireVerwalter } from "../../_lib/zugang";
import { PruefartenVerwaltung } from "../../_ui/PruefartenVerwaltung";

export const dynamic = "force-dynamic";

/** Der Katalog der Prüfarten (IDA-368); wie die Gerätearten für alle Gruppen, pflegen darf ihn jeder Verwalter. */
export default async function PruefartenSeite() {
  await requireVerwalter();
  const db = getDb();
  const artNamen = Object.fromEntries(ladeArten(db).map((a) => [a.id, a.name]));
  return <PruefartenVerwaltung pruefarten={ladePruefarten(db)} artNamen={artNamen} />;
}

export const metadata = { title: "Prüfarten" };
