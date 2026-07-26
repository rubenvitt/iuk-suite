import { notFound, redirect } from "next/navigation";
import { auth } from "@/core/auth";
import { getDb } from "../../../../../_db/client";
import { getEvening, getSurveyByEvening, memberGroupIdsFor } from "../../../../../_db/queries";
import { viewerFromSession } from "../../../../../_lib/viewer";
import { assertGroupAccess } from "../../../../../_lib/access";

/**
 * DIE ABEND-DETAILSEITE IST KEIN SCREEN MEHR — sie leitet weiter
 * (`docs/design/feedback-admin.md` §4.16: „Abend-Detailseite
 * `evenings/[eveningId]` entfällt als eigener Screen (Redirect auf die
 * Auswertung, damit alte Links und Prefetches nicht ins Leere laufen)").
 *
 * WAS HIER GESTANDEN HAT und warum es weg musste: der Screen trug
 * ausschließlich `SurveyControls` — „Umfrage erstellen" / „Aktivieren" /
 * „Schließen" / „Archivieren", also genau den Dreischritt, den dieses Release
 * den Nutzern als abgeschafft ankündigt („ein separates Aktivieren gibt es nicht
 * mehr", `docs/runbooks/feedback-cutover.md`). Kein einziges Feld des Abends war
 * dort bearbeitbar; ein Weg, der „Bearbeiten" heißt und nichts bearbeiten kann.
 * Über „Umfrage erstellen" entstand außerdem eine Umfrage im Status `draft`, den
 * das Cockpit als „Entwurf (Altbestand)" ausweist — ein Datensatz von heute, dem
 * Nutzer als Altbestand der Vorgängeranwendung vorgelegt.
 *
 * DREI ENTSCHEIDUNGEN, DIE HIER LIEGEN:
 *
 * 1. DER GUARD BLEIBT VOR DEM SPRUNG. Er prüft die ECHTE `group_id` des
 *    Dienstabends, nicht den `groupId`-URL-Parameter — sonst verriete allein das
 *    Sprungziel, zu welcher Gruppe ein fremder Abend gehört (IDOR). Ohne Zugang:
 *    404, nicht 403, und ausdrücklich KEIN Redirect.
 * 2. OHNE UMFRAGE FÜHRT DER SPRUNG AUFS COCKPIT, nicht in die Auswertung: die
 *    antwortet für einen nachgetragenen Abend mit 404 („ohne Umfrage nichts
 *    auszuwerten"), und ein Redirect in einen garantierten 404 wäre schlechter
 *    als der Zustand vorher. Das Cockpit trägt die Zeile samt Bearbeiten-Dialog.
 * 3. KEIN SCHREIBEN. Ein Server-Component-GET feuert auch per Link-Prefetch; der
 *    Auto-Close bleibt an der einzigen Stelle, die einen echten Zugriff belegt
 *    (`f/[slugSecret]/page.tsx`).
 */
export default async function EveningDetail({
  params,
}: {
  params: Promise<{ groupId: string; eveningId: string }>;
}) {
  const { groupId, eveningId } = await params;
  const urlGroupId = Number(groupId);
  const id = Number(eveningId);
  const viewer = viewerFromSession(await auth());
  const db = getDb();

  const evening = getEvening(db, id);
  if (!evening) notFound();
  if (evening.groupId !== urlGroupId) notFound(); // URL-Hygiene, nicht der Guard selbst.

  const memberIds = viewer ? memberGroupIdsFor(db, viewer.sub, viewer.fachgruppen) : [];
  try {
    assertGroupAccess(viewer, evening.groupId, memberIds);
  } catch {
    notFound(); // 404 statt 403 — verrät die Existenz nicht.
  }

  const survey = getSurveyByEvening(db, id);
  redirect(
    survey
      ? `/m/feedback/groups/${evening.groupId}/evenings/${id}/auswertung`
      : `/m/feedback/groups/${evening.groupId}`,
  );
}
