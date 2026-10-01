import { headers } from "next/headers";
import { getDb } from "@/app/m/kommplan/_db/client";
import { interneDruckdaten } from "@/app/m/kommplan/_lib/druckdaten";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { ladePlanLesendOder404 } from "@/app/m/kommplan/_lib/plaene";
import { darfKommplanBearbeiten, requireKommplanZugang } from "@/app/m/kommplan/_lib/zugang";
import { Druckseite } from "@/app/m/kommplan/_ui/druck/Druckseite";
import { ARIMO } from "@/app/m/kommplan/_ui/schrift";

export const dynamic = "force-dynamic";

/**
 * DRUCK A4 QUER (Spec §8.1). Host, Zugang und das 404 des Plans prüfen `(intern)/layout.tsx`,
 * `(intern)/p/[id]/layout.tsx` UND diese Seite; archiviert bleibt druckbar (Phase 4, Entscheidung 10).
 */
export default async function DruckA4({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ export?: string | string[] }>;
}) {
  requireKommplanHost(await headers());
  const viewer = await requireKommplanZugang();
  const { id } = await params;
  const db = getDb();
  const plan = ladePlanLesendOder404(db, id);
  return <Druckseite schrift={{ familie: ARIMO.style.fontFamily, klasse: ARIMO.className }} daten={await interneDruckdaten(db, plan, darfKommplanBearbeiten(viewer.groups), "a4-quer", new Date().getTime())}
    automatisch={(await searchParams).export !== "svg"} />;
}
