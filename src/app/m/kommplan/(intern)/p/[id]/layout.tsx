import { headers } from "next/headers";
import { getDb } from "@/app/m/kommplan/_db/client";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { ladePlanFuerOder404 } from "@/app/m/kommplan/_lib/plaene";
import { personAus, requireKommplanZugang } from "@/app/m/kommplan/_lib/zugang";

/**
 * FALLE 23 FÜR DAS OBJEKT (Vorbild `feedback/(admin)/groups/[groupId]/(cockpit)/layout.tsx`): ein
 * unbekannter Plan ist hier ein echter 404 (archiviert ist nur lesbar, Phase 4) — oberhalb jeder künftigen
 * `loading.tsx` unter `p/[id]` (Editor, Autosave ab Phase 2). Stünde `ladePlanFuerOder404` nur in den
 * Seiten, lieferte die erste Ladegrenze darüber still HTTP 200 (feedback DRK-424, lagerbuch DRK-480).
 *
 * Die Riegel stehen VOR dem Laden, weil Layouts und Seiten parallel rendern: ohne sie könnte ein
 * anonymer Abruf am 404 statt am Login erkennen, ob es einen Plan gibt. Ein fremder privater Plan ist hier
 * dasselbe 404 (`_lib/rechte.ts`). Die Seiten darunter prüfen trotzdem selbst und laden den Plan erneut.
 *
 * ⚠️ DAS LAYOUT LÄUFT AUCH BEIM VORABLADEN (Links aus der Planliste): hier steht nur Lesendes.
 * `notFound()`/`redirect()` bleiben in `_lib` (kein Eintrag im Abdeckungsmanifest von `core/audit`).
 */
export default async function PlanSchutz({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  requireKommplanHost(await headers());
  const viewer = await requireKommplanZugang();
  ladePlanFuerOder404(getDb(), (await params).id, personAus(viewer));
  return children;
}
