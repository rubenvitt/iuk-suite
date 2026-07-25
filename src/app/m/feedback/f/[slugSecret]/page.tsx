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
import { FEHLER_PARAMETER } from "../../_lib/absenden";
import { submitResponseAction } from "../../actions";
import { Fehlerpanel, Huelle, ZustandC, ZustandD, ZustandE, ZustandF } from "./Zustaende";
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

/**
 * DIE FEHLERPFADE OHNE JAVASCRIPT (Entwurf 3.8), Wortlaute wortgenau.
 *
 * Sie kommen als `?fehler=…` von `submitResponseAction` — der einzige Weg, auf
 * dem ein nativer POST etwas sichtbar machen kann (den Rueckgabewert der Action
 * liest ohne JavaScript niemand, die Seite wuerde unveraendert neu rendern; acht
 * getippte Noten und kein Pixel Reaktion). Der Ratelimit-Text bekommt den Zusatz
 * mit dem Zurueck-Pfeil: ohne JavaScript ist die Umleitung ein neuer, LEERER
 * Bogen, und die Eingaben liegen nur noch in der Formular-Wiederherstellung des
 * Browsers.
 */
const ZUSATZ_GESCHLOSSEN = "Deine Rückmeldung konnte nicht mehr gespeichert werden.";

const FEHLER_TEXT: Record<string, string> = {
  [FEHLER_PARAMETER.ratelimit]:
    "Gerade sind viele Rückmeldungen gleichzeitig unterwegs. Bitte einmal auf Absenden tippen. " +
    "Mit dem Zurück-Pfeil des Browsers stehen deine Eingaben noch da.",
  [FEHLER_PARAMETER.incomplete]: "Da fehlten noch Noten.",
};

/**
 * Ein Query-Parameter kann doppelt vorkommen; Next liefert dann ein Array. Ohne
 * diese Zeile faellt jeder Vergleich still durch — und der Fehlerpfad waere
 * wieder unsichtbar, diesmal fuer den, bei dem `?fehler=` zweimal in der URL
 * steht.
 */
function einzelwert(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/**
 * Der Satz zu einem `?fehler=`-Wert — oder `null`.
 *
 * `Object.hasOwn` und nicht `FEHLER_TEXT[wert]`: der Wert kommt aus der URL, und
 * ein Zugriff ohne diese Pruefung liefert bei `?fehler=constructor` eine
 * FUNKTION aus dem Prototyp. Die landete als React-Kind im Baum und riss die
 * ganze Seite mit — die einzige oeffentliche, login-freie Seite dieses Moduls.
 */
function fehlertext(wert: string | null): string | null {
  if (wert === null || !Object.hasOwn(FEHLER_TEXT, wert)) return null;
  return FEHLER_TEXT[wert];
}

/** Die Skala der Umfrage: 6 bei `schulnote`, 5 bei importierten `stars`. */
function skala(survey: SurveyRow): number {
  const questions: Question[] = JSON.parse(survey.questions);
  return ratingScale(questions.find((q) => isRatingType(q.type))?.type ?? "schulnote");
}

/** Zustand D aus Umfrage und Abend — an zwei Stellen gebraucht, einmal gebaut. */
function beendet(survey: SurveyRow, evening: EveningRow, zusatz: string | null = null) {
  const zeit = schliesszeit(survey);
  return (
    <ZustandD
      thema={evening.topic}
      datum={langesDatum(evening.date)}
      geschlossenAm={zeit ? geschlossenAm(zeit) : null}
      stufen={skala(survey)}
      zusatz={zusatz}
    />
  );
}

/**
 * WIE LANGE "diese Umfrage" noch "diese" ist: 48 Stunden nach dem Schluss.
 *
 * Zustand D sagt "richtiger Zettel, zu spaet" — eine Aussage ueber DEN Abend,
 * den die Person gerade erlebt hat. Nach dem naechsten Wochenende ist derselbe
 * Satz eine Verwechslung: der Aushang haengt weiter, gescannt wird er zwischen
 * zwei Abenden staendig, und D nennt dann einen wochenalten Abend "diesen" —
 * ohne den Satz, den der Entwurf genau dafuer in C stellt ("Der QR-Code bleibt
 * gueltig — probier es am Ende des naechsten Abends noch einmal.").
 *
 * 48 Stunden und nicht 24: die Frist liegt regelmaessig am Morgen NACH dem Abend
 * (Ende des Abendtags + 9 h = 09:00), und wer am Abend danach scannt, ist dann
 * schon 36 Stunden nach dem Schluss. Diese Zahl ist damit tragend — sie
 * unterscheidet "gestern verpasst" von "vorletzte Woche"; wer sie enger zieht,
 * schickt den ersten Fall in den falschen Zustand.
 *
 * `null` als Schliesszeit heisst "kein belegter Zeitpunkt" (importierte
 * Altbestaende): dann entscheidet der Abend selbst, mit demselben Fenster.
 */
const D_FENSTER_MS = 48 * 3600_000;

function frischBeendet(survey: SurveyRow, evening: EveningRow, jetzt: Date): boolean {
  const zeit = schliesszeit(survey) ?? evening.date;
  return jetzt.getTime() - zeit.getTime() < D_FENSTER_MS;
}

/**
 * Ohne aktive Umfrage: Zustand D, wenn der LETZTE Abend der Gruppe einen
 * FRISCH beendeten Bogen hat — sonst C.
 *
 * Ohne diesen Blick waere D praktisch unerreichbar: nur der erste Besucher nach
 * Fristende loest den Lazy-Auto-Close aus und sieht "beendet", jeder danach
 * bekaeme "zurzeit laeuft keine Umfrage" — obwohl er den richtigen Zettel zu
 * spaet erwischt hat. Bewusst nur der NEUESTE Abend: auf ihn zeigt der QR-Code
 * gerade. Und bewusst nur SOLANGE der Schluss frisch ist: sonst wird D zum
 * Dauerzustand zwischen zwei Abenden (siehe `frischBeendet`). `draft` (noch
 * nicht freigegeben) fuehrt zu C, `archived` wird tolerant wie `closed` gelesen.
 *
 * `gerade abgewiesen` hebelt das Fenster aus — und zwar begruendet: wer eben
 * abgesendet hat und ohne JavaScript hier landet (`?fehler=geschlossen`), hat
 * mit GENAU diesem Bogen interagiert. Ihn stattdessen mit "zurzeit laeuft keine
 * Umfrage" abzuspeisen, weil die Frist schon vor Wochen ablief (ein Bogen, den
 * niemand angesehen und darum niemand automatisch geschlossen hat), waere wieder
 * die stille Wirkung, gegen die dieser Weg gebaut ist.
 */
function ohneAktiveUmfrage(
  db: ReturnType<typeof getDb>,
  group: GroupRow,
  slugSecret: string,
  jetzt: Date,
  abgewiesen: boolean,
): ReactElement {
  const abende = listEvenings(db, group.id);
  const letzter = abende.reduce<EveningRow | undefined>(
    (spitze, abend) => (!spitze || abend.date > spitze.date ? abend : spitze),
    undefined,
  );
  const survey = letzter ? getSurveyByEvening(db, letzter.id) : undefined;
  if (letzter && survey && (survey.status === "closed" || survey.status === "archived")) {
    if (abgewiesen || frischBeendet(survey, letzter, jetzt)) {
      return beendet(survey, letzter, abgewiesen ? ZUSATZ_GESCHLOSSEN : null);
    }
  }
  return <ZustandC gruppe={group.name} url={`/f/${slugSecret}`} />;
}

export default async function ParticipatePage({
  params,
  searchParams,
}: {
  params: Promise<{ slugSecret: string }>;
  /**
   * Optional, damit die Seite ohne Query aufrufbar bleibt (Next liefert sie
   * immer, Tests nicht zwingend). Gelesen wird genau ein Parameter: `fehler`.
   */
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slugSecret } = await params;
  const fehler = einzelwert((await searchParams)?.fehler);
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

  /*
   * "Gerade abgewiesen": die Abgabe kam eben von dieser Person und wurde als
   * `closed` zurueckgewiesen (der Weg ohne JavaScript, 3.8). Der Parameter traegt
   * zwei Wirkungen — der ehrliche Zusatz UND das Aushebeln des Frische-Fensters:
   * wer eben abgesendet hat, hat mit genau diesem Bogen interagiert, auch wenn
   * dessen Frist Wochen zurueckliegt.
   */
  const abgewiesen = fehler === FEHLER_PARAMETER.closed;
  const jetzt = new Date();
  const active = activeSurveyForGroup(db, group.id);
  if (!active) return ohneAktiveUmfrage(db, group, slugSecret, jetzt, abgewiesen);
  const survey = active.survey;
  // Lazy Auto-Close: abgelaufene aktive Umfrage sofort schließen.
  if (nextStatusOnAccess("active", survey.closesAt, jetzt) !== "active") {
    setSurveyStatus(db, survey.id, "closed", { closedAt: jetzt });
    /*
     * Auch hier gilt das Frische-Fenster: liegt die Frist Wochen zurueck und hat
     * nur niemand hingesehen (der Bogen stand darum noch auf `active`), ist
     * "die Umfrage zu DIESEM Abend" die falsche Auskunft — der Abend ist nicht
     * der, von dem der Scanner gerade kommt. Geschlossen wird trotzdem, das ist
     * eine Frage der Daten und nicht der Anzeige.
     */
    const geschlossen = { ...survey, status: "closed" as const, closedAt: jetzt };
    if (abgewiesen || frischBeendet(geschlossen, active.evening, jetzt)) {
      return beendet(geschlossen, active.evening, abgewiesen ? ZUSATZ_GESCHLOSSEN : null);
    }
    return <ZustandC gruppe={group.name} url={`/f/${slugSecret}`} />;
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
  const satz = fehlertext(fehler);

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
        Der Fehlerpfad ohne JavaScript (3.8) steht UEBER dem Bogen, nicht im
        Abschluss-Block wie die Meldung mit JavaScript: nach der Umleitung steht
        die Seite am Anfang, und eine Meldung 1,5 Bildschirme weiter unten waere
        genauso unsichtbar wie gar keine. `?fehler=geschlossen` erscheint hier
        absichtlich nicht — dieser Zweig rendert einen OFFENEN Bogen, und ein
        "beendet" darueber waere ein Widerspruch. (Er kommt nur zustande, wenn in
        derselben Sekunde ein neuer Abend freigegeben wurde.)
      */}
      {satz === null ? null : <Fehlerpanel text={satz} />}
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
