import { getDb } from "../../_db/client";
import { ladeOrte } from "../../_lib/daten";
import { requireAdmin } from "../../_lib/zugang";
import { OrteVerwaltung } from "../../_ui/OrteVerwaltung";

export const dynamic = "force-dynamic";

export default async function OrteSeite() {
  await requireAdmin("/orte");
  return <OrteVerwaltung orte={ladeOrte(getDb())} />;
}

export const metadata = { title: "Lagerorte" };
