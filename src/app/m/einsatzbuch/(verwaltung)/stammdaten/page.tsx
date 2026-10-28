import { headers } from "next/headers";
import { getDb } from "../../_db/client";
import { requireEinsatzbuchHost } from "../../_lib/host";
import { requireEinsatzbuchZugang } from "../../_lib/zugang";
import { listeFahrzeuge, listePersonal, listeQualifikationen, listeStichworte } from "../../_lib/stammdaten/daten";
import { REITER, type Reiter } from "../../_lib/stammdaten/typen";
import { Stammdaten } from "../../_ui/stammdaten/Stammdaten";

export const dynamic = "force-dynamic";

/**
 * Fahrzeuge, Personal, Stichworte und Qualifikationen als Reiter. Die Riegel stehen hier noch einmal, weil
 * eine Route Group keine Sicherheitsgrenze ist. Der gewählte Reiter kommt aus `?reiter=`;
 * ein unbekannter Wert fällt still auf „fahrzeuge“ zurück.
 */
export default async function StammdatenSeite({ searchParams }: { searchParams: Promise<{ reiter?: string }> }) {
  requireEinsatzbuchHost(await headers());
  await requireEinsatzbuchZugang();
  const { reiter } = await searchParams;
  const db = getDb();
  const start: Reiter = REITER.includes(reiter as Reiter) ? (reiter as Reiter) : "fahrzeuge";
  return <Stammdaten reiter={start} fahrzeuge={listeFahrzeuge(db)} personal={listePersonal(db)} stichworte={listeStichworte(db)} qualifikationen={listeQualifikationen(db)} />;
}
