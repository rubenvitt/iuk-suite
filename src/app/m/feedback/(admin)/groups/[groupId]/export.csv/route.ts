import { auth } from "@/core/auth";
import { getDb } from "@/app/m/feedback/_db/client";
import {
  getGroup,
  getSurveyByEvening,
  listEvenings,
  listResponses,
  memberGroupIdsFor,
} from "@/app/m/feedback/_db/queries";
import { viewerFromSession } from "@/app/m/feedback/_lib/viewer";
import { assertGroupAccess } from "@/app/m/feedback/_lib/access";
import { computeDAStats } from "@/app/m/feedback/_lib/aggregation";
import { buildCsv } from "@/app/m/feedback/_lib/csv";
import { formatiereNote } from "@/app/m/feedback/_lib/noten";
import { isRatingType, ratingScale, type Question } from "@/app/m/feedback/_lib/questions";

/**
 * DER AGGREGIERTE GRUPPEN-EXPORT (Plan Task 20, §2.5 „CSV (alle Abende)").
 *
 * ER IST EIN ANDERES ARTEFAKT als `…/evenings/[eveningId]/export.csv`: dort eine
 * Zeile je ANTWORT (die Rohdaten EINES Abends, durchmischt, anonymitaets-
 * gehaertet), hier eine Zeile je DIENSTABEND mit dem Ø je Frage. Der Abend-Export
 * bleibt Zeichen fuer Zeichen unveraendert — beide Dateien beantworten
 * verschiedene Fragen, und eine Datei, die beides versucht, beantwortet keine.
 *
 * VIER ENTSCHEIDUNGEN, DIE HIER UND NUR HIER LIEGEN:
 *
 * 1. DIE SPALTEN SIND EINE VEREINIGUNG UEBER ALLE ABENDE. `surveys.questions`
 *    ist JSON je Umfrage, also kann jeder Abend einen anderen Bogen tragen
 *    (importierte Alt-Umfragen tun das nachweislich). Wer die Spalten je Zeile
 *    aus dem eigenen Bogen zieht, verschiebt sie lautlos — kein Fehler, nur
 *    falsche Zahlen unter richtigen Koepfen. Fehlt eine Frage im Bogen eines
 *    Abends, bleibt die Zelle LEER (nicht 0: „nicht gefragt" ist nicht „Note 0").
 * 2. `stars` BEKOMMT EINE EIGENE SPALTE MIT DER SKALA IM KOPF (§4.12). Eine
 *    1–5-Bewertung in dieselbe Spalte wie eine Schulnote zu schreiben legte zwei
 *    verschiedene Bedeutungen in eine Zahlenreihe — genau der stille Rechenfehler,
 *    den `avgSchulnote` beseitigt. Das gilt AUCH BEI GLEICHER FRAGE-ID: der
 *    normale Cutover bringt `q1` im importierten Alt-Bogen als `stars` und im
 *    neuen Bogen derselben Gruppe als `schulnote` (`STANDARD_QUESTIONS`), und
 *    eine ID-only-Vereinigung legte beide Mittelwerte unter EINEN Kopf. Deshalb
 *    ist der Spaltenschluessel `id|type` (siehe unten).
 * 3. AUFSTEIGEND NACH DATUM. Die Oberflaeche zeigt den jüngsten Abend oben (man
 *    sucht das Letzte); eine Tabellenkalkulation liest dieselben Zahlen als
 *    ZEITREIHE, und ein absteigend sortierter Verlauf ergibt dort eine
 *    rueckwaerts laufende Kurve.
 * 4. NEUTRALISIERT WIRD IN `csv.ts`. Themen und Fragetexte kommen aus
 *    Eingabefeldern; `=`, `+`, `-`, `@` am Feldanfang fuehrt Excel beim Oeffnen als
 *    Formel aus. `buildCsv`/`csvField` erledigt das fuer JEDE Zelle — hier steht
 *    keine zweite Neutralisierung.
 *
 * Route Handler statt Seite, deshalb der Guard inline (wie im Abend-Export):
 * `notFound()` ist auf Server-Component-Rendering zugeschnitten. Fehlende
 * Ressource UND fehlender Zugriff ergeben beide 404 — ein 403 verriete die
 * Existenz der Gruppe.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const id = Number(groupId);

  const db = getDb();
  const group = getGroup(db, id);
  if (!group) {
    return new Response(null, { status: 404 });
  }

  const viewer = viewerFromSession(await auth());
  const memberIds = viewer ? memberGroupIdsFor(db, viewer.sub, viewer.fachgruppen) : [];
  try {
    // Geprüft wird die ECHTE `group.id`, nicht der URL-Parameter — auch wenn
    // beide hier denselben Wert tragen: die Gruppe SELBST ist die geschützte
    // Ressource, und der Guard soll nicht an einer Zahl aus der Adresszeile hängen.
    assertGroupAccess(viewer, group.id, memberIds);
  } catch {
    return new Response(null, { status: 404 });
  }

  // Aufsteigend (Entscheidung 3) — eigene Sortierung, nicht die `ORDER BY
  // date DESC` der Abfrage: die Richtung ist hier fachlich tragend.
  const abende = [...listEvenings(db, id)].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  /*
   * DIE SPALTENVEREINIGUNG. Schlüssel ist `id|type`, NICHT die Frage-ID allein.
   * Die ID ist über Bögen hinweg stabil, die BEDEUTUNG ist es nicht: derselbe
   * `q1` ist im importierten Alt-Bogen eine 1–5-Bewertung (`stars`) und im neuen
   * Bogen derselben Gruppe eine Schulnote 1–6 — eine 5 heißt dort „sehr gut" und
   * hier „mangelhaft". Auf die ID allein geschlüsselt landeten beide Mittelwerte
   * in EINER Spalte unter EINEM Kopf, und der Kopf (der erste gesehene) log über
   * die Hälfte der Zahlen darunter. Die Skala gehört also in den Schlüssel.
   *
   * Der TEXT gehört ausdrücklich NICHT hinein: Reihenfolge ist die des ersten
   * Auftretens — chronologisch, damit die ältesten Fragen links stehen und eine
   * später ergänzte Frage die bestehenden Spalten nicht verschiebt — und der
   * Kopftext ist der ERSTE gesehene. Ein bloß umformulierter Fragetext ergibt
   * keine zweite Spalte, sonst stünden zwei halbe Zeitreihen nebeneinander.
   */
  const spalten = new Map<string, { kopf: string }>();
  const zeilen: { datum: string; thema: string; rueckmeldungen: number; teilnehmer: string; werte: Map<string, string> }[] = [];

  for (const abend of abende) {
    const survey = getSurveyByEvening(db, abend.id);
    const fragen: Question[] = survey ? JSON.parse(survey.questions) : [];
    const antworten = survey
      ? listResponses(db, survey.id).map((r) => JSON.parse(r.answers) as Record<string, unknown>)
      : [];
    const stats = computeDAStats(fragen, antworten);

    const werte = new Map<string, string>();
    for (const frage of stats.perQuestion) {
      // Nur Bewertungsfragen haben einen Ø. Freitexte gehören in den
      // Abend-Export, wo sie einzeln nachlesbar sind — als „Ø" gäbe es sie nicht.
      if (!isRatingType(frage.type)) continue;
      // Schlüssel ist `id|type` — dieselbe ID mit anderer Skala ist eine andere
      // Spalte (Entscheidung 2). `|` kommt in keinem `QuestionType` vor.
      const key = `${frage.id}|${frage.type}`;
      if (!spalten.has(key)) spalten.set(key, { kopf: kopfMitSkala(frage.text, frage.type) });
      if (frage.avg !== null) werte.set(key, formatiereNote(frage.avg));
    }

    zeilen.push({
      // Kalendertag ohne Uhrzeit — `evenings.date` ist Mitternacht UTC.
      datum: abend.date.toISOString().slice(0, 10),
      thema: abend.topic ?? "",
      rueckmeldungen: stats.responseCount,
      // Kein erfundener Nenner (§2.3): ohne Teilnehmerzahl bleibt die Zelle leer.
      teilnehmer: abend.participantCount === null ? "" : String(abend.participantCount),
      werte,
    });
  }

  // `spaltenSchluessel`, nicht `spaltenIds`: die Einträge sind `id|type`, keine
  // Frage-IDs. `werte` ist auf denselben Schlüssel gelegt, deshalb greift der
  // Zugriff unten unverändert.
  const spaltenSchluessel = [...spalten.keys()];
  const rows: string[][] = [
    ["Gruppe", group.name],
    ["Dienstabende", String(zeilen.length)],
    [],
    ["Datum", "Thema", "Rückmeldungen", "Teilnehmer", ...spaltenSchluessel.map((k) => spalten.get(k)!.kopf)],
    ...zeilen.map((z) => [
      z.datum,
      z.thema,
      String(z.rueckmeldungen),
      z.teilnehmer,
      ...spaltenSchluessel.map((k) => z.werte.get(k) ?? ""),
    ]),
  ];

  const csv = buildCsv(rows);
  const filename = `feedback-${group.slug}-abende.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

/**
 * Der Spaltenkopf einer `stars`-Frage nennt seine Skala (§4.12). Ohne den Zusatz
 * stünde eine 4,2 aus fünf Sternen („sehr gut") in derselben Zahlenreihe wie eine
 * 4,2 auf der Schulnotenrampe („ausreichend") — dieselbe Ziffer, gegenteilige
 * Aussage. Schulnoten bleiben unmarkiert: sie sind die Regel, nicht die Ausnahme.
 */
function kopfMitSkala(text: string, type: Question["type"]): string {
  return type === "schulnote" ? text : `${text} (Skala 1–${ratingScale(type)})`;
}
