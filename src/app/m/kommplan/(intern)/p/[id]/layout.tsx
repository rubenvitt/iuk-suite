import { headers } from "next/headers";
import { getDb } from "@/app/m/kommplan/_db/client";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { ladePlanLesendOder404 } from "@/app/m/kommplan/_lib/plaene";
import { requireKommplanZugang } from "@/app/m/kommplan/_lib/zugang";

/**
 * FALLE 23 FÜR DAS OBJEKT (Vorbild `feedback/(admin)/groups/[groupId]/(cockpit)/layout.tsx`): ein
 * unbekannter Plan ist hier ein echter 404 (archiviert ist nur lesbar, Phase 4) — oberhalb jeder künftigen
 * `loading.tsx` unter `p/[id]` (Editor, Autosave ab Phase 2). Stünde `ladePlanOder404` nur in den
 * Seiten, lieferte die erste Ladegrenze darüber still HTTP 200 (feedback DRK-424, lagerbuch DRK-480).
 *
 * Die Riegel stehen VOR dem Laden, weil Layouts und Seiten parallel rendern: ohne sie könnte ein
 * anonymer Abruf am 404 statt am Login erkennen, ob es einen Plan gibt. Die Seiten darunter
 * prüfen trotzdem selbst und laden den Plan für ihre Daten erneut.
 *
 * ⚠️ DAS LAYOUT LÄUFT AUCH BEIM VORABLADEN (Links aus der Planliste): hier steht nur Lesendes.
 * `notFound()`/`redirect()` bleiben in `_lib` (kein Eintrag im Abdeckungsmanifest von `core/audit`).
 */
export default async function PlanSchutz({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  requireKommplanHost(await headers());
  await requireKommplanZugang();
  ladePlanLesendOder404(getDb(), (await params).id);
  return children;
}
