import { headers } from "next/headers";
import { getDb } from "../../_db/client";
import { requireGemeinschaftHost } from "../../_lib/host";
import { kalenderEintraege } from "../../_lib/kalender";
import { kalenderFenster, kalenderTag } from "../../_lib/kalenderTage";
import { tagInZone } from "../../_lib/zeit";
import { requireLeitung } from "../../_lib/zugang";
import { Kalender } from "../../_ui/planung/Kalender";

export const dynamic = "force-dynamic";

/** Monatsansicht mit Events und Bar-Belegung; `?tag=JJJJ-MM-TT` wählt Tag und Monat. */
export default async function GemeinschaftKalender({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  requireGemeinschaftHost(await headers());
  await requireLeitung();
  // `new Date()` statt `Date.now()`: `react-hooks/purity` (Vorbild `files/(verwaltung)/posteingang/page.tsx`).
  const heute = tagInZone(new Date().getTime());
  const tag = kalenderTag((await searchParams).tag, heute);
  const { von, bis } = kalenderFenster(tag);
  // `key`: ein anderer Monat ist ein frischer Kalender mit dem Tag aus der Adresse.
  return <Kalender key={tag.slice(0, 7)} tag={tag} heute={heute} eintraege={kalenderEintraege(getDb(), von, bis)} />;
}
