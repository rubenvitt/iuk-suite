import { headers } from "next/headers";
import { getDb } from "@/app/m/kommplan/_db/client";
import { interneDruckdaten } from "@/app/m/kommplan/_lib/druckdaten";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { ladePlanFuerOder404 } from "@/app/m/kommplan/_lib/plaene";
import { personAus, requireKommplanZugang } from "@/app/m/kommplan/_lib/zugang";
import { Druckseite } from "@/app/m/kommplan/_ui/druck/Druckseite";
import { ARIMO } from "@/app/m/kommplan/_ui/schrift";

export const dynamic = "force-dynamic";

/**
 * DRUCK A3 QUER (Spec §8.1; Falle 18: eigene Route, Phase 5, Entscheidung 13). Host, Zugang und das 404 des Plans prüfen `(intern)/layout.tsx`,
 * `(intern)/p/[id]/layout.tsx` UND diese Seite; archiviert bleibt druckbar (Phase 4, Entscheidung 10).
 */
export default async function DruckA3({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ export?: string | string[] }>;
}) {
  requireKommplanHost(await headers());
  const viewer = await requireKommplanZugang();
  const { id } = await params;
  const db = getDb();
  const { plan, rechte } = ladePlanFuerOder404(db, id, personAus(viewer));
  return <Druckseite schrift={{ familie: ARIMO.style.fontFamily, klasse: ARIMO.className }} daten={await interneDruckdaten(db, plan, rechte.verwalten, "a3-quer", new Date().getTime())}
    automatisch={(await searchParams).export !== "svg"} />;
}
