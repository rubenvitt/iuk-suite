import { headers } from "next/headers";
import { getDb } from "../../_db/client";
import { requireEinsatzbuchHost } from "../../_lib/host";
import { requireEinsatzbuchZugang } from "../../_lib/zugang";
import { listeFahrzeuge, listePersonal, listeStichworte } from "../../_lib/stammdaten/daten";
import { STAMMDATENARTEN, type Stammdatenart } from "../../_lib/stammdaten/typen";
import { Stammdaten } from "../../_ui/stammdaten/Stammdaten";

export const dynamic = "force-dynamic";

/**
 * Fahrzeuge, Personal und Stichworte als Reiter. Die Riegel stehen hier noch einmal, weil
 * eine Route Group keine Sicherheitsgrenze ist. Der gewählte Reiter kommt aus `?reiter=`;
 * ein unbekannter Wert fällt still auf „fahrzeuge“ zurück.
 */
export default async function StammdatenSeite({ searchParams }: { searchParams: Promise<{ reiter?: string }> }) {
  requireEinsatzbuchHost(await headers());
  await requireEinsatzbuchZugang();
  const { reiter } = await searchParams;
  const db = getDb();
  const start: Stammdatenart = STAMMDATENARTEN.includes(reiter as Stammdatenart) ? (reiter as Stammdatenart) : "fahrzeuge";
  return <Stammdaten reiter={start} fahrzeuge={listeFahrzeuge(db)} personal={listePersonal(db)} stichworte={listeStichworte(db)} />;
}
