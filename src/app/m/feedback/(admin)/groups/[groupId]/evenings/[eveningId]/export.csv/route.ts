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
import { shuffleStable } from "@/app/m/feedback/_lib/aggregation";

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
  // Dieselbe durchmischte Ordnung wie die Auswertung (Entwurf 3.9): Schlüssel
  // ist das re-serialisierte Antwort-Objekt, nicht die rohe Spalte — importierte
  // Zeilen tragen den Alt-JSON-String und würden sonst anders sortieren.
  const responses = shuffleStable(
    listResponses(db, survey.id).map((r) => ({
      answers: JSON.parse(r.answers) as Record<string, unknown>,
    })),
    (r) => JSON.stringify(r.answers),
  );

  /*
   * DER LETZTE RESTKANAL (Entwurf 3.9). `submittedAt` ist für neue Abgaben schon
   * Mitternacht des Abendtags — für IMPORTIERTE Antworten aber weiterhin
   * sekundengenau, weil der Importer direkt schreibt und nicht über
   * `insertResponse` geht. Stand dieser Wert in der Spalte, ließ sich die
   * Eingangsreihenfolge historischer Abende in Excel durch einfaches Sortieren
   * wiederherstellen — und die Durchmischung der Leseordnung war für den Export
   * aufgehoben. Bei ~15 Personen, die über ihre eigene Gruppenleitung urteilen,
   * ist „wer war zuerst" ein Deanonymisierungskanal.
   *
   * Die DATENBANK bleibt unangetastet (Import-Parität mit der Alt-Anwendung);
   * normalisiert wird nur die AUSGABE, und zwar auf denselben Ausdruck wie die
   * Metadaten-Zeile „Datum" — ein Kalendertag ohne Uhrzeit.
   */
  const abendtag = new Date(evening.date).toISOString().slice(0, 10);

  /*
   * DER SPALTENNAME (Fund aus dem Review von Task 8). „Zeitstempel" versprach
   * eine Genauigkeit, die die Ausgabe nach der Normalisierung bewusst NICHT mehr
   * hat: dort steht ein Kalendertag, in jeder Zeile derselbe. „Abendtag" sagt
   * genau das — und bleibt unterscheidbar von der Metadatenzeile „Datum", die
   * denselben Wert trägt (ein zweites „Datum" hier machte jede Suche nach der
   * Kopfzeile zweideutig).
   */
  const rows: string[][] = [
    ["Gruppe", group.name],
    ["Datum", abendtag],
    ["Thema", evening.topic ?? ""],
    ["Anzahl Rückmeldungen", String(responses.length)],
    [],
    ["Abendtag", ...questions.map((q) => q.text)],
    ...responses.map((r) => [
      abendtag,
      ...questions.map((q) => {
        const v = r.answers[q.id];
        return v === undefined || v === null ? "" : String(v);
      }),
    ]),
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
