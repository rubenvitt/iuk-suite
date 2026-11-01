import { headers } from "next/headers";
import { getDb } from "../../_db/client";
import { requireGemeinschaftHost } from "../../_lib/host";
import { formularDaten, projektKarten } from "../../_lib/vorhaben";
import { requireLeitung } from "../../_lib/zugang";
import { VorhabenListe } from "../../_ui/planung/VorhabenListe";

export const dynamic = "force-dynamic";

/** Alle Projekte mit Fortschritt, dazu „Projekt anlegen“. */
export default async function GemeinschaftProjekte() {
  requireGemeinschaftHost(await headers());
  await requireLeitung();
  const db = getDb();
  // `new Date()` statt `Date.now()`: `react-hooks/purity` (Vorbild `files/(verwaltung)/posteingang/page.tsx`).
  const jetzt = new Date().getTime();
  return <VorhabenListe art="projekt" kommend={projektKarten(db, jetzt)} daten={formularDaten(db, jetzt)} />;
}
