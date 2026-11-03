import { getDb } from "../../_db/client";
import { ladeGruppen } from "../../_lib/daten";
import { requireAdmin } from "../../_lib/zugang";
import { GruppenVerwaltung } from "../../_ui/GruppenVerwaltung";

export const dynamic = "force-dynamic";

export default async function GruppenSeite() {
  await requireAdmin();
  return <GruppenVerwaltung gruppen={ladeGruppen(getDb())} />;
}
