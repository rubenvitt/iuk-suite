import { auth } from "@/core/auth";
import { getDb } from "@/app/m/feedback/_db/client";
import {
  getEvening,
  getGroup,
  getSurveyByEvening,
  listResponses,
  memberGroupIdsFor,
} from "@/app/m/feedback/_db/queries";
import { viewerFromSession } from "@/app/m/feedback/_lib/viewer";
import { assertGroupAccess } from "@/app/m/feedback/_lib/access";
import type { Question } from "@/app/m/feedback/_lib/questions";
import { buildCsv } from "@/app/m/feedback/_lib/csv";

/**
 * Route Handler statt Seite: `notFound()` (aus `guardPage.ts`) ist auf
 * Server-Component-Rendering zugeschnitten und in Route Handlern nicht das
 * richtige Werkzeug. Der Guard hier ist deshalb inline (analog zu
 * `assertGroupAccess` in guardPage.ts/guardGroup) und gibt bei fehlendem
 * Zugriff bzw. nicht existierender Ressource direkt eine 404-`Response`
 * zurück — kein 403, verrät die Existenz nicht.
 *
 * Matrix = eine Zeile pro Antwort (Response), eine Spalte pro Frage — die
 * rohen Einzel-Rückmeldungen, nicht aggregiert. JEDE Zelle (auch die
 * Metadaten-Zeilen oben) läuft durch `buildCsv`/`csvField`, damit die
 * Formula-Injection-Neutralisierung (Task 6) auch auf anonymen
 * Freitext-Antworten greift.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ groupId: string; eveningId: string }> },
) {
  const { groupId, eveningId } = await params;
  const urlGroupId = Number(groupId);
  const id = Number(eveningId);

  const db = getDb();
  const evening = getEvening(db, id);
  if (!evening || evening.groupId !== urlGroupId) {
    return new Response(null, { status: 404 });
  }

  const viewer = viewerFromSession(await auth());
  const memberIds = viewer ? memberGroupIdsFor(db, viewer.sub, viewer.fachgruppen) : [];
  try {
    assertGroupAccess(viewer, evening.groupId, memberIds);
  } catch {
    return new Response(null, { status: 404 });
  }

  const group = getGroup(db, evening.groupId);
  const survey = getSurveyByEvening(db, id);
  if (!group || !survey) {
    return new Response(null, { status: 404 });
  }

  const questions: Question[] = JSON.parse(survey.questions);
  const responses = listResponses(db, survey.id);

  const rows: string[][] = [
    ["Gruppe", group.name],
    ["Datum", new Date(evening.date).toISOString().slice(0, 10)],
    ["Thema", evening.topic ?? ""],
    ["Anzahl Rückmeldungen", String(responses.length)],
    [],
    ["Zeitstempel", ...questions.map((q) => q.text)],
    ...responses.map((r) => {
      const answers = JSON.parse(r.answers) as Record<string, unknown>;
      return [
        new Date(r.submittedAt).toISOString(),
        ...questions.map((q) => {
          const v = answers[q.id];
          return v === undefined || v === null ? "" : String(v);
        }),
      ];
    }),
  ];

  const csv = buildCsv(rows);
  const filename = `feedback-${group.slug}-${eveningId}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
