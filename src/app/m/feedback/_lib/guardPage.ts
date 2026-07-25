import { notFound } from "next/navigation";
import { auth } from "@/core/auth";
import { getDb } from "@/app/m/feedback/_db/client";
import { memberGroupIdsFor } from "@/app/m/feedback/_db/queries";
import { viewerFromSession } from "@/app/m/feedback/_lib/viewer";
import { assertGroupAccess, type Viewer } from "@/app/m/feedback/_lib/access";

/**
 * Seiten-Guard analog zu `guardGroup` in actions.ts — aber für Server-
 * Component-Seiten: statt zu werfen, rendert er bei fehlendem Zugriff
 * `notFound()` (404 statt 403, verrät die Existenz nicht; siehe GroupDetail/
 * EveningDetail aus Task 12). `groupId` MUSS die aus der DB geladene group_id
 * sein (bei evening/survey-Seiten über `evening.groupId`), NIE der rohe
 * URL-Parameter — sonst IDOR wie bei der Alt-App.
 *
 * NICHT für Route Handler (z. B. `export.csv/route.ts`) geeignet: `notFound()`
 * ist auf Seiten-Rendering zugeschnitten, ein Route Handler muss seine eigene
 * `Response` mit Statuscode zurückgeben.
 *
 * `memberIds` wird MITGEGEBEN, nicht verworfen: das Cockpit muss wissen, ob der
 * Einstieg diesen Nutzer sofort wieder hierher leiten würde (`_lib/einstieg.ts`,
 * §4.1 — dann trägt es keine Breadcrumb). Die Liste ist hier ohnehin gerechnet;
 * ein zweiter `memberGroupIdsFor`-Aufruf auf der heißesten Seite des Moduls wäre
 * dieselbe Abfrage zweimal.
 */
export async function guardPage(groupId: number): Promise<{
  viewer: Viewer | null;
  db: ReturnType<typeof getDb>;
  memberIds: number[];
}> {
  const viewer = viewerFromSession(await auth());
  const db = getDb();
  const memberIds = viewer ? memberGroupIdsFor(db, viewer.sub, viewer.fachgruppen) : [];
  try {
    assertGroupAccess(viewer, groupId, memberIds);
  } catch {
    notFound();
  }
  return { viewer, db, memberIds };
}
