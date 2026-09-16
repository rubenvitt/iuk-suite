import { auditDelivery, auditActor } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { blatt, freiesBlatt, type ExportSpalte } from "@/core/export";
import { xlsxAntwort } from "@/core/export/server";
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
import { isRatingType, type Question } from "@/app/m/feedback/_lib/questions";
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
 * rohen Einzel-Rückmeldungen, nicht aggregiert.
 *
 * ⚠️ SEIT DRK-186 EINE EXCEL-MAPPE, und der Pfad heißt entsprechend
 * `export.xlsx`. ⛔ DER SATZ „JEDE Zelle läuft durch `buildCsv`/`csvField`,
 * damit die Formula-Injection-Neutralisierung auch auf anonymen
 * Freitext-Antworten greift" STAND HIER UND IST ENTFALLEN — nicht weil die
 * Gefahr kleiner geworden wäre (die Freitexte sind weiterhin anonym und
 * öffentlich eingegeben), sondern weil sie auf diesem Weg nicht mehr existiert:
 * der Baustein legt jede Textzelle mit `type: String` als Textzelle an, und eine
 * Textzelle kann keine Formel sein. Wer hier je wieder eine CSV ausliefert,
 * braucht die Neutralisierung zurück.
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
  return auditDelivery("feedback", "export", "evening_export", auditActor(viewer), async (target) => {
    target(String(evening.id));

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
     * Kopfdatenzeile „Datum" — ein Kalendertag ohne Uhrzeit.
     */
    const abendtag = new Date(evening.date).toISOString().slice(0, 10);

    /*
     * DER SPALTENNAME (Fund aus dem Review von Task 8). „Zeitstempel" versprach
     * eine Genauigkeit, die die Ausgabe nach der Normalisierung bewusst NICHT mehr
     * hat: dort steht ein Kalendertag, in jeder Zeile derselbe. „Abendtag" sagt
     * genau das — und bleibt unterscheidbar von der Kopfdatenzeile „Datum", die
     * denselben Wert trägt (ein zweites „Datum" hier machte jede Suche nach der
     * Kopfzeile zweideutig).
     */
    type AntwortZeile = { answers: Record<string, unknown> };
    const spalten: ExportSpalte<AntwortZeile>[] = [
      { kopf: "Abendtag", breite: 12, wert: () => abendtag },
      ...questions.map((q) => ({
        kopf: q.text,
        breite: isRatingType(q.type) ? 14 : 46,
        /*
         * ⛔ EINE BEWERTUNG IST EINE ZAHL, EIN FREITEXT IST TEXT. Der CSV-Weg
         * schrieb beides als `String(v)`; eine Kalkulation konnte über die
         * Notenspalten dann weder mitteln noch ein Diagramm legen — genau das,
         * wofür man diese Datei herunterlädt. Der Typ der FRAGE entscheidet,
         * nicht der Laufzeitwert: eine Bewertungsfrage, die ausnahmsweise Text
         * trägt, ist ein Datenfehler und soll als solcher sichtbar bleiben.
         */
        wert: (z: AntwortZeile) => {
          const v = z.answers[q.id];
          if (v === undefined || v === null) return null;
          if (isRatingType(q.type) && typeof v === "number") return v;
          return String(v);
        },
      })),
    ];

    return xlsxAntwort(`feedback-${group.slug}-${eveningId}.xlsx`, [
      blatt("Rückmeldungen", spalten, responses),
      // Kopfdaten auf eigenem Blatt — im CSV-Weg standen sie als Vorspann ÜBER
      // der Kopfzeile und verschoben dort Sortieren und Filtern.
      freiesBlatt(
        "Kopfdaten",
        [
          ["Gruppe", group.name],
          ["Datum", abendtag],
          ["Thema", evening.topic ?? ""],
          ["Anzahl Rückmeldungen", responses.length],
        ],
        [22, 34],
      ),
    ]);
  });
}
