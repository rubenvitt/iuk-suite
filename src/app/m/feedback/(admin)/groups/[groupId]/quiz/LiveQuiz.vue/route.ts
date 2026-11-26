// DIE SLIDEV-KOMPONENTE ZUM HERUNTERLADEN (`…/quiz/LiveQuiz.vue`). Der Schnipsel im Quiz-Editor
// braucht sie in `components/` des Slidev-Projekts (`docs/slidev/README.md`). Derselbe Guard wie die
// Exporte der Gruppe: 404 bei unbekannter Gruppe und bei fehlendem Zugriff, nie 403. Die Datei ist
// für jede Gruppe gleich und trägt kein Secret; der Guard hält nur die Verwaltung geschlossen.
import { auth } from "@/core/auth";
import { getDb } from "@/app/m/feedback/_db/client";
import { getGroup, memberGroupIdsFor } from "@/app/m/feedback/_db/queries";
import { assertGroupAccess } from "@/app/m/feedback/_lib/access";
import { viewerFromSession } from "@/app/m/feedback/_lib/viewer";
import { LIVE_QUIZ_VUE } from "@/app/m/feedback/_lib/quiz/liveQuizVue";

export async function GET(_req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const db = getDb();
  const group = getGroup(db, Number((await params).groupId));
  if (!group) return new Response(null, { status: 404 });
  const viewer = viewerFromSession(await auth());
  const memberIds = viewer ? memberGroupIdsFor(db, viewer.sub, viewer.fachgruppen) : [];
  try {
    assertGroupAccess(viewer, group.id, memberIds);
  } catch {
    return new Response(null, { status: 404 });
  }
  return new Response(LIVE_QUIZ_VUE, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": 'attachment; filename="LiveQuiz.vue"',
      "cache-control": "no-store",
    },
  });
}
