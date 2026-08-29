import { notFound } from "next/navigation";
import { getDb } from "../../../../_db/client";
import { NotFound, teilnehmerDetail } from "../../../../_lib/queries";
import { magicLink } from "../../../../_lib/magicLink";
import type { ParticipantDetailDTO } from "../../../../_lib/typen";
import { requireUavAdminPage } from "../../../../_lib/requireUavAdmin";
import { TeilnehmerDetail } from "../../../../_ui/admin/TeilnehmerDetail";

export const dynamic = "force-dynamic";

/**
 * `/admin/teilnehmer/<id>` — Detail-Auswertung, Stammdaten, Code und Magic-
 * Link (Aufgabe 16). `teilnehmerDetailInhalt` ist die reine, exportierte
 * Inhaltsfunktion (Vorbild `personenInhalt`) — `magicLink()` läuft HIER,
 * serverseitig, aus `getModule("uav")`/`SUITE_HOST_UAV` (nie `AUTH_URL`, nie
 * `headers().host`).
 */
export function teilnehmerDetailInhalt(detail: ParticipantDetailDTO) {
  return <TeilnehmerDetail detail={detail} magicLink={magicLink(detail.participant.loginCode)} />;
}

export default async function AdminTeilnehmerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUavAdminPage();
  const { id } = await params;
  let detail: ParticipantDetailDTO;
  try {
    detail = teilnehmerDetail(getDb(), id);
  } catch (e) {
    if (e instanceof NotFound) notFound();
    throw e;
  }
  return teilnehmerDetailInhalt(detail);
}
