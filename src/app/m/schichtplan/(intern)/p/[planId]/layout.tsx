import { headers } from "next/headers";
import { getDb } from "../../../_db/client";
import { requireSchichtplanHost } from "../../../_lib/host";
import { planungOder404, requireSchichtplanZugang } from "../../../_lib/zugang";

/**
 * Falle 23 für das Objekt (Vorbild `kommplan/(intern)/p/[id]/layout.tsx`): eine unbekannte Planung
 * ist hier ein echter 404, oberhalb jeder künftigen `loading.tsx`. Die Riegel stehen VOR dem Laden, damit
 * ein anonymer Abruf nicht am 404 erkennt, ob es eine Planung gibt. Die Seiten prüfen selbst noch einmal.
 */
export default async function PlanungSchutz({ children, params }: { children: React.ReactNode; params: Promise<{ planId: string }> }) {
  requireSchichtplanHost(await headers());
  await requireSchichtplanZugang();
  planungOder404(getDb(), (await params).planId);
  return children;
}
