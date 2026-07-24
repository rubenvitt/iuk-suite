import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { Newsreader } from "next/font/google";
import { getDb } from "../../_db/client";
import { getGroupBySlug, activeSurveyForGroup, setSurveyStatus } from "../../_db/queries";
import { parseToken } from "../../_lib/token";
import { nextStatusOnAccess } from "../../_lib/lifecycle";
import { isRatingType, ratingScale, type Question } from "../../_lib/questions";
import { submitResponseAction } from "../../actions";
import { Zettel } from "./Zettel";
import s from "./zettel.module.css";

/**
 * Der EINE zusaetzliche Webfont dieser Route (Entwurf §3.3/§3.11), nur fuer H1,
 * "Danke." und die t4-Serifsaetze. Hier statt im Root-Layout, damit ihn
 * ausschliesslich diese Route laedt. Faellt er aus, greift die im Entwurf
 * benannte Ruecklinie: Geist Sans 600 (`--serif` in `zettel.module.css`) — der
 * Entwurf verliert Ton, nicht Funktion.
 */
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
  preload: true,
});

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

export default async function ParticipatePage({
  params,
}: {
  params: Promise<{ slugSecret: string }>;
}) {
  const { slugSecret } = await params;
  const parsed = parseToken(slugSecret);
  if (!parsed) notFound();
  const db = getDb();
  const group = getGroupBySlug(db, parsed.slug);
  if (!group || group.secret !== parsed.secret) notFound();

  const active = activeSurveyForGroup(db, group.id);
  if (!active) {
    return <p>Zurzeit ist keine Umfrage aktiv. Vielen Dank für dein Interesse!</p>;
  }
  const survey = active.survey;
  // Lazy Auto-Close: abgelaufene aktive Umfrage sofort schließen.
  if (nextStatusOnAccess("active", survey.closesAt, new Date()) !== "active") {
    setSurveyStatus(db, survey.id, "closed", { closedAt: new Date() });
    return <p>Diese Umfrage ist inzwischen geschlossen.</p>;
  }
  // Bereits abgegeben? (Cookie) — die submit-Action SETZT den Cookie nur; das
  // Enforcement (Redirect zu /thanks statt erneutem Formular) liegt hier.
  const already = (await cookies()).get(`feedback-${survey.id}`);
  if (already) redirect(`/f/${slugSecret}/thanks`);

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
    <div className={`${s.seite} ${newsreader.variable}`}>
      {/* Fahne: 3px DRK-Rot, randlos am Oberrand. Reine Marke, kein Inhalt —
          deshalb `aria-hidden`. Eine der genau ZWEI Stellen mit #c8000f. */}
      <div className={s.fahne} aria-hidden="true" />
      <div className={s.blatt}>
        <header className={`${s.kopf} ${s.aufbau}`}>
          <p className={s.kicker}>
            Rückmeldung zum Dienstabend
            <span className={s.wortzeichen}>DRK</span>
          </p>
          <h1 className={s.titel}>
            {active.evening.topic ?? `Dienstabend am ${tagUndMonat(active.evening.date)}`}
          </h1>
          {/* Ohne Uhrzeit, anders als im Entwurfsbeispiel "… · 19:30": `evenings`
              traegt nur ein Kalenderdatum (Mitternacht UTC), eine Startzeit gibt
              es im Schema nicht. Eine erfundene Uhrzeit waere schlimmer als
              keine — der Zettel muss zum Abend passen, den der Nutzer erlebt hat. */}
          <p className={s.meta}>
            {group.name} · <span className={s.datum}>{langesDatum(active.evening.date)}</span>
          </p>
          <p className={s.vertrag}>{vertragszeile(questions)}</p>
        </header>
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
        />
      </div>
    </div>
  );
}
