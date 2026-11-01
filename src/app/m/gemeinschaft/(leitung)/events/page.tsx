import { headers } from "next/headers";
import { getDb } from "../../_db/client";
import { requireGemeinschaftHost } from "../../_lib/host";
import { eventKarten, formularDaten } from "../../_lib/vorhaben";
import { requireLeitung } from "../../_lib/zugang";
import { VorhabenListe } from "../../_ui/planung/VorhabenListe";

export const dynamic = "force-dynamic";

/** Alle Events, kommend und vorbei, dazu „Event anlegen“. */
export default async function GemeinschaftEvents() {
  requireGemeinschaftHost(await headers());
  await requireLeitung();
  const db = getDb();
  // `new Date()` statt `Date.now()`: `react-hooks/purity` (Vorbild `files/(verwaltung)/posteingang/page.tsx`).
  const jetzt = new Date().getTime();
  const { kommend, vorbei } = eventKarten(db, jetzt);
  return <VorhabenListe art="event" kommend={kommend} vorbei={vorbei} daten={formularDaten(db, jetzt)} />;
}
