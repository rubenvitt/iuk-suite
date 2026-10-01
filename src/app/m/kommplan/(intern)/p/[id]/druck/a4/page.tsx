import { headers } from "next/headers";
import { getDb } from "@/app/m/kommplan/_db/client";
import { druckseitenDaten, qrZielIntern } from "@/app/m/kommplan/_lib/druckdaten";
import { qrZielSatz } from "@/app/m/kommplan/_lib/freigabe/texte";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { ladePlanLesendOder404 } from "@/app/m/kommplan/_lib/plaene";
import { requireKommplanZugang } from "@/app/m/kommplan/_lib/zugang";
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
  await requireKommplanZugang();
  const { id } = await params;
  const db = getDb();
  const plan = ladePlanLesendOder404(db, id);
  const ziel = qrZielIntern(db, plan, new Date().getTime());
  return <Druckseite schrift={{ familie: ARIMO.style.fontFamily, klasse: ARIMO.className }} daten={await druckseitenDaten(db, plan, { format: "a4-quer", qrUrl: ziel?.url ?? null, qrSatz: ziel ? qrZielSatz(ziel) : null, mitSvgExport: true })}
    automatisch={(await searchParams).export !== "svg"} />;
}
