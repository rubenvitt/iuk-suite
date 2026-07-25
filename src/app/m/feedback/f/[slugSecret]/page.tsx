import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import type { ReactElement } from "react";
import { getDb } from "../../_db/client";
import {
  getGroupBySlug,
  activeSurveyForGroup,
  setSurveyStatus,
  listEvenings,
  getSurveyByEvening,
} from "../../_db/queries";
import type { EveningRow, GroupRow, SurveyRow } from "../../_db/schema";
import { parseToken } from "../../_lib/token";
import { nextStatusOnAccess, TIME_ZONE } from "../../_lib/lifecycle";
import { isRatingType, ratingScale, type Question } from "../../_lib/questions";
import { submitResponseAction } from "../../actions";
import { Huelle, ZustandC, ZustandD, ZustandE, ZustandF } from "./Zustaende";
import { Zettel } from "./Zettel";
import s from "./zettel.module.css";

/**
 * DAS ANONYMITAETSSIEGEL — Wortlaut A aus Entwurf §3.9, wortgenau.
 *
 * Er steht hier und nicht im Client, weil er eine Zusage ueber SERVER-Verhalten
 * ist und neben den Code gehoert, der sie wahr macht. Beide Voraussetzungen sind
 * erfuellt, sonst waere nur die schwaechere Fassung B zulaessig:
 *   1. "keine Uhrzeit" — `submitResponseAction` speichert `active.evening.date`
 *      (Mitternacht UTC des Abends) als `submitted_at`, nicht `new Date()`. Bei
 *      ~15 Abgaben waere die Sekunde allein ein Deanonymisierungskanal.
 *   2. "in zufaelliger Reihenfolge" — `shuffleStable` (FNV-1a) mischt die
 *      Leseordnung deterministisch; Aggregation UND CSV-Export nutzen sie.
 * Die IP wird fuer das Ratelimit gebraucht, liegt aber nur in einer fluechtigen
 * In-Memory-Map (`_lib/ratelimit.ts`) und nie an der Antwort. Kommt jemals ein
 * persistenter Limiter mit IP-Spalte, aendert sich DIESER TEXT — nicht
 * stillschweigend seine Bedeutung.
 */
const ANONYMITAETSSIEGEL =
  "Diese Rückmeldung ist anonym. Gespeichert werden nur deine Noten und deine Texte — kein Name, keine E-Mail, keine Geräte- oder IP-Kennung, keine Uhrzeit. Die Gruppenleitung sieht Durchschnitte und die Texte in zufälliger Reihenfolge, nie eine Person.";

/**
 * Datum eines Abends. `timeZone: "UTC"` ist PFLICHT, nicht Geschmack:
 * `evenings.date` ist Mitternacht UTC, und jede negative Zeitzone schiebt den
 * Kalendertag sonst um einen Tag nach vorn — dann steht auf dem Zettel der
 * falsche Dienstabend.
 */
function langesDatum(date: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function tagUndMonat(date: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Die Vertragszeile (§3.2 Punkt 2) sagt vorab, was der Zettel kostet. Die Zahlen
 * kommen aus den TATSAECHLICHEN Fragen dieser Umfrage, nicht aus dem
 * Standardsatz: importierte Alt-Umfragen haben andere Zuschnitte, und eine
 * Zusage, die nicht zum Bogen passt, ist schlimmer als keine.
 */
function vertragszeile(questions: Question[]): string {
  const noten = questions.filter((q) => isRatingType(q.type)).length;
  const zeilen = questions.length - noten;
  const notenteil = noten === 1 ? "1 Note" : `${noten} Noten`;
  const zeilenteil = zeilen === 1 ? "1 freie Zeile" : `${zeilen} freie Zeilen`;
  return `Anonym · ${notenteil}, ${zeilenteil} · etwa 2 Minuten`;
}

/**
 * Der Schliesszeitpunkt fuer Zustand D — der FRUEHERE der beiden Kandidaten.
 *
 * Beide Spalten koennen luegen, jede in eine Richtung: `closesAt` ist bei einer
 * von Hand geschlossenen Umfrage noch Tage entfernt (eine Zusage ueber die
 * Zukunft), `closedAt` ist beim Lazy-Auto-Close der Zeitpunkt DIESES Aufrufs
 * (21:47, obwohl seit 09:00 zu ist). Das Minimum trifft in beiden Faellen zu.
 * `null` heisst "kein belegter Zeitpunkt" — bei importierten Altbestaenden wird
 * dann keiner behauptet.
 */
function schliesszeit(survey: SurveyRow): Date | null {
  const kandidaten = [survey.closesAt, survey.closedAt].filter((d): d is Date => d instanceof Date);
  if (kandidaten.length === 0) return null;
  return new Date(Math.min(...kandidaten.map((d) => d.getTime())));
}

/**
 * "am 23. Juli um 09:00" — in der Zeitzone, in der die Frist GERECHNET wurde.
 *
 * Hier ist `timeZone: "UTC"` falsch, anders als beim Abenddatum: `closesAt` ist
 * ein Zeitpunkt aus `computeClosesAt(..., TIME_ZONE)`, kein Kalendertag. In UTC
 * formatiert stuende auf dem Zettel 07:00 — eine Uhrzeit, zu der noch offen war.
 */
function geschlossenAm(zeit: Date): string {
  const tag = new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "long",
    timeZone: TIME_ZONE,
  }).format(zeit);
  const uhr = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(zeit);
  return `am ${tag} um ${uhr}`;
}

/** Die Skala der Umfrage: 6 bei `schulnote`, 5 bei importierten `stars`. */
function skala(survey: SurveyRow): number {
  const questions: Question[] = JSON.parse(survey.questions);
  return ratingScale(questions.find((q) => isRatingType(q.type))?.type ?? "schulnote");
}

/** Zustand D aus Umfrage und Abend — an zwei Stellen gebraucht, einmal gebaut. */
function beendet(survey: SurveyRow, evening: EveningRow) {
  const zeit = schliesszeit(survey);
  return (
    <ZustandD
      thema={evening.topic}
      datum={langesDatum(evening.date)}
      geschlossenAm={zeit ? geschlossenAm(zeit) : null}
      stufen={skala(survey)}
    />
  );
}

/**
 * Ohne aktive Umfrage: Zustand D, wenn der LETZTE Abend der Gruppe einen
 * beendeten Bogen hat — sonst C.
 *
 * Ohne diesen Blick waere D praktisch unerreichbar: nur der erste Besucher nach
 * Fristende loest den Lazy-Auto-Close aus und sieht "beendet", jeder danach
 * bekaeme "zurzeit laeuft keine Umfrage" — obwohl er den richtigen Zettel zu
 * spaet erwischt hat. Bewusst nur der NEUESTE Abend: auf ihn zeigt der QR-Code
 * gerade, ein Bogen von vor drei Wochen wuerde ein falsches "dieser Abend"
 * behaupten. `draft` (noch nicht freigegeben) fuehrt zu C, `archived` wird
 * tolerant wie `closed` gelesen.
 */
function ohneAktiveUmfrage(
  db: ReturnType<typeof getDb>,
  group: GroupRow,
  slugSecret: string,
): ReactElement {
  const abende = listEvenings(db, group.id);
  const letzter = abende.reduce<EveningRow | undefined>(
    (spitze, abend) => (!spitze || abend.date > spitze.date ? abend : spitze),
    undefined,
  );
  const survey = letzter ? getSurveyByEvening(db, letzter.id) : undefined;
  if (letzter && survey && (survey.status === "closed" || survey.status === "archived")) {
    return beendet(survey, letzter);
  }
  return <ZustandC gruppe={group.name} url={`/f/${slugSecret}`} />;
}

export default async function ParticipatePage({
  params,
}: {
  params: Promise<{ slugSecret: string }>;
}) {
  const { slugSecret } = await params;
  const parsed = parseToken(slugSecret);
  /*
   * Zustand F statt `notFound()`: eine gestaltete Seite (3.2 F). Und sie bekommt
   * KEINE Daten — kaputtes Token, unbekannter Slug und falsches Secret ergeben
   * Zeichen fuer Zeichen dieselbe Antwort, sonst waere die Seite ein Orakel fuer
   * geratene Slugs.
   */
  if (!parsed) return <ZustandF />;
  const db = getDb();
  const group = getGroupBySlug(db, parsed.slug);
  if (!group || group.secret !== parsed.secret) return <ZustandF />;

  const active = activeSurveyForGroup(db, group.id);
  if (!active) return ohneAktiveUmfrage(db, group, slugSecret);
  const survey = active.survey;
  // Lazy Auto-Close: abgelaufene aktive Umfrage sofort schließen.
  const jetzt = new Date();
  if (nextStatusOnAccess("active", survey.closesAt, jetzt) !== "active") {
    setSurveyStatus(db, survey.id, "closed", { closedAt: jetzt });
    return beendet({ ...survey, status: "closed", closedAt: jetzt }, active.evening);
  }
  /*
   * Bereits von DIESEM Geraet abgegeben (3.2 E): Zustand E statt einer stummen
   * Weiterleitung nach /thanks. Handys werden in einer Gruppe herumgegeben — die
   * Weiterleitung sperrte die zweite Person aus, ohne ein Wort zu sagen.
   */
  const already = (await cookies()).get(`feedback-${survey.id}`);
  if (already) return <ZustandE slugSecret={slugSecret} surveyId={survey.id} />;

  const questions: Question[] = JSON.parse(survey.questions);
  // Die Skala der UMFRAGE (Legendenstreifen, Ankerwoerter): 6 bei `schulnote`,
  // 5 bei importierten `stars`. Kein Default aus dem Nichts — der erste
  // Bewertungstyp entscheidet, ohne solchen bleibt es bei der Schulnote.
  const ersteNote = questions.find((q) => isRatingType(q.type));
  const scale = ratingScale(ersteNote?.type ?? "schulnote");
  // Schluessel des Entwurfsspeichers (Task 12): aus dem Token abgeleitet, damit
  // zwei Gruppen auf demselben Geraet sich nicht ueberschreiben — und gehasht,
  // damit das Token selbst nicht im `sessionStorage` landet.
  const tokenHash = createHash("sha256").update(slugSecret).digest("hex").slice(0, 16);

  return (
    <Huelle
      titel={active.evening.topic ?? `Dienstabend am ${tagUndMonat(active.evening.date)}`}
      kopf={
        <>
          {/* Ohne Uhrzeit, anders als im Entwurfsbeispiel "… · 19:30": `evenings`
              traegt nur ein Kalenderdatum (Mitternacht UTC), eine Startzeit gibt
              es im Schema nicht. Eine erfundene Uhrzeit waere schlimmer als
              keine — der Zettel muss zum Abend passen, den der Nutzer erlebt hat. */}
          <p className={s.meta}>
            {group.name} · <span className={s.datum}>{langesDatum(active.evening.date)}</span>
          </p>
          <p className={s.vertrag}>{vertragszeile(questions)}</p>
        </>
      }
    >
      {/*
        Die Action wird GEBUNDEN uebergeben und im Formular unveraendert als
        `action` verwendet — nur so bleibt die Abgabe ohne JavaScript moeglich
        (§3.11). Ein Client-Wrapper waere keine serialisierbare Server Action
        mehr, und dieser Bruch ist fuer Typecheck und Build unsichtbar.
      */}
      <Zettel
        questions={questions}
        scale={scale}
        action={submitResponseAction.bind(null, slugSecret)}
        tokenHash={tokenHash}
        siegel={ANONYMITAETSSIEGEL}
      />
    </Huelle>
  );
}
