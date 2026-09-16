import { auditDelivery, auditActor } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { blatt, freiesBlatt, type ExportSpalte } from "@/core/export";
import { xlsxAntwort } from "@/core/export/server";
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
import { isRatingType, ratingScale, type Question } from "@/app/m/feedback/_lib/questions";

/**
 * DER AGGREGIERTE GRUPPEN-EXPORT (Plan Task 20, §2.5 „alle Abende").
 *
 * ER IST EIN ANDERES ARTEFAKT als `…/evenings/[eveningId]/export.xlsx`: dort eine
 * Zeile je ANTWORT (die Rohdaten EINES Abends, durchmischt, anonymitaets-
 * gehaertet), hier eine Zeile je DIENSTABEND mit dem Ø je Frage. Beide
 * Dateien beantworten verschiedene Fragen, und eine Datei, die beides versucht,
 * beantwortet keine.
 *
 * ⚠️ SEIT DRK-186 EINE EXCEL-MAPPE. Der Pfad heißt deshalb `export.xlsx` und
 * nicht mehr `export.csv` — er steht in der Adresszeile und in jedem Lesezeichen,
 * und ein Pfad, der eine CSV verspricht und eine Mappe liefert, ist eine stille
 * Lüge. Beide Verweise in der Oberfläche (`_ui/Verlauf.tsx`, `trend/page.tsx`)
 * sind mitgewandert.
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
 * 4. ⛔ DIE Ø-WERTE SIND ZAHLEN, KEINE ZEICHENKETTEN — und das ist die
 *    eigentliche Ausbeute des Formatwechsels. Im CSV-Weg stand dort
 *    `formatiereNote(avg)`, also „2,0" mit Dezimalkomma; eine Kalkulation las
 *    das je nach Gebietsschema als Text und konnte darueber weder rechnen noch
 *    ein Diagramm legen. Gerundet wird auf EINE Nachkommastelle, also genau so
 *    weit wie `formatiereNote` — die Datei zeigt dieselbe Zahl wie der
 *    Bildschirm, nur eben als Zahl. Das Dezimalkomma malt die Kalkulation
 *    selbst, nach der Spracheinstellung ihres Lesers.
 *
 * ⛔ HIER STAND EINE VIERTE ENTSCHEIDUNG ZUR FORMEL-NEUTRALISIERUNG, UND SIE IST
 * MIT DEM FORMAT ENTFALLEN. Themen und Fragetexte kommen aus Eingabefeldern;
 * `=`, `+`, `-`, `@` am Feldanfang fuehrte Excel beim Oeffnen einer CSV als
 * Formel aus, und `csvField` setzte deshalb einen Apostroph davor — der dann im
 * Spaltenkopf MITZULESEN war („'-Verpflegung?"). Der Baustein legt jede
 * Textzelle als Textzelle an; eine Textzelle KANN keine Formel sein. Die
 * Neutralisierung ist nicht abgeschaltet, sie ist nicht mehr anwendbar.
 *
 * Route Handler statt Seite, deshalb der Guard inline (wie im Abend-Export):
 * `notFound()` ist auf Server-Component-Rendering zugeschnitten. Fehlende
 * Ressource UND fehlender Zugriff ergeben beide 404 — ein 403 verriete die
 * Existenz der Gruppe.
 */

/** Eine Zeile der Mappe: ein Dienstabend. */
type AbendZeile = {
  datum: string;
  thema: string;
  rueckmeldungen: number;
  teilnehmer: number | null;
  werte: Map<string, number>;
};

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
  return auditDelivery("feedback", "export", "group_export", auditActor(viewer), async (target) => {
    target(String(group.id));

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
    const zeilen: AbendZeile[] = [];

    for (const abend of abende) {
      const survey = getSurveyByEvening(db, abend.id);
      const fragen: Question[] = survey ? JSON.parse(survey.questions) : [];
      const antworten = survey
        ? listResponses(db, survey.id).map((r) => JSON.parse(r.answers) as Record<string, unknown>)
        : [];
      const stats = computeDAStats(fragen, antworten);

      const werte = new Map<string, number>();
      for (const frage of stats.perQuestion) {
        // Nur Bewertungsfragen haben einen Ø. Freitexte gehören in den
        // Abend-Export, wo sie einzeln nachlesbar sind — als „Ø" gäbe es sie nicht.
        if (!isRatingType(frage.type)) continue;
        // Schlüssel ist `id|type` — dieselbe ID mit anderer Skala ist eine andere
        // Spalte (Entscheidung 2). `|` kommt in keinem `QuestionType` vor.
        const key = `${frage.id}|${frage.type}`;
        if (!spalten.has(key)) spalten.set(key, { kopf: kopfMitSkala(frage.text, frage.type) });
        // Eine Nachkommastelle wie `formatiereNote` (Entscheidung 4), aber als
        // Zahl: `Number(x.toFixed(1))` rundet und gibt die Zahl zurück.
        if (frage.avg !== null) werte.set(key, Number(frage.avg.toFixed(1)));
      }

      zeilen.push({
        // Kalendertag ohne Uhrzeit — `evenings.date` ist Mitternacht UTC.
        datum: abend.date.toISOString().slice(0, 10),
        thema: abend.topic ?? "",
        rueckmeldungen: stats.responseCount,
        // Kein erfundener Nenner (§2.3): ohne Teilnehmerzahl bleibt die Zelle leer.
        teilnehmer: abend.participantCount,
        werte,
      });
    }

    // `spaltenSchluessel`, nicht `spaltenIds`: die Einträge sind `id|type`, keine
    // Frage-IDs. `werte` ist auf denselben Schlüssel gelegt, deshalb greift der
    // Zugriff unten unverändert.
    const spaltenSchluessel = [...spalten.keys()];
    const excelSpalten: ExportSpalte<AbendZeile>[] = [
      { kopf: "Datum", breite: 12, wert: (z) => z.datum },
      { kopf: "Thema", breite: 32, wert: (z) => z.thema },
      { kopf: "Rückmeldungen", breite: 15, wert: (z) => z.rueckmeldungen },
      { kopf: "Teilnehmer", breite: 12, wert: (z) => z.teilnehmer },
      ...spaltenSchluessel.map((k) => ({
        kopf: spalten.get(k)!.kopf,
        breite: 18,
        wert: (z: AbendZeile) => z.werte.get(k) ?? null,
      })),
    ];

    return xlsxAntwort(`feedback-${group.slug}-abende.xlsx`, [
      blatt("Dienstabende", excelSpalten, zeilen),
      /*
       * DIE KOPFDATEN AUF EIGENEM BLATT. Im CSV-Weg standen sie als Vorspann
       * ÜBER der Kopfzeile, weil eine Textdatei nur eine Fläche hat. In einer
       * Kalkulation ist genau das schädlich: Sortieren, Filtern und „als
       * Tabelle formatieren" gehen von einer Kopfzeile in Zeile 1 aus, und ein
       * Vorspann verschiebt sie um vier Zeilen.
       */
      freiesBlatt(
        "Kopfdaten",
        [["Gruppe", group.name], ["Dienstabende", zeilen.length]],
        [18, 34],
      ),
    ]);
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
