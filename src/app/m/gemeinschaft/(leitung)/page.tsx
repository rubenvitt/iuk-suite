import { headers } from "next/headers";
import { getDb } from "../_db/client";
import { requireGemeinschaftHost } from "../_lib/host";
import { ladeUebersicht } from "../_lib/uebersicht";
import { tagInZone } from "../_lib/zeit";
import { requireLeitung } from "../_lib/zugang";
import { Uebersicht } from "../_ui/planung/Uebersicht";

export const dynamic = "force-dynamic";

/** Übersicht der Leitung: Kacheln, „Als Nächstes“, „Hier fehlt noch jemand“. */
export default async function GemeinschaftUebersicht() {
  requireGemeinschaftHost(await headers());
  await requireLeitung();
  // `new Date()` statt `Date.now()`: `react-hooks/purity` (Vorbild `files/(verwaltung)/posteingang/page.tsx`).
  const jetzt = new Date().getTime();
  return <Uebersicht u={ladeUebersicht(getDb(), jetzt)} heute={tagInZone(jetzt)} />;
}
