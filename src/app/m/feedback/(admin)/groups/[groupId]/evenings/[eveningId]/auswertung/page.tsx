import { notFound } from "next/navigation";
import Link from "next/link";
import { Breadcrumb, Button, Card, Col, Result, Row } from "antd";
import { getDb } from "@/app/m/feedback/_db/client";
import { getEvening, getGroup, getSurveyByEvening, listResponses } from "@/app/m/feedback/_db/queries";
import { guardPage } from "@/app/m/feedback/_lib/guardPage";
import { computeDAStats, shuffleStable, verteilungJeFrage } from "@/app/m/feedback/_lib/aggregation";
import { buildAnalysisPrompt } from "@/app/m/feedback/_lib/prompt";
import { nextStatusOnAccess, type SurveyStatus } from "@/app/m/feedback/_lib/lifecycle";
import { SEKTIONEN, sektionVon, type Question } from "@/app/m/feedback/_lib/questions";
import { T, ZIFFERN } from "@/app/m/feedback/_ui/typo";
import { formatAbendtag, formatDatumLang } from "@/app/m/feedback/_ui/datum";
import {
  Altbestandsfussnote,
  Notenlegende,
  Notenplakette,
  Notenspur,
} from "@/app/m/feedback/_ui/Noten";
import { PromptBlock } from "@/app/m/feedback/_ui/PromptBlock";

/**
 * DIE AUSWERTUNG EINES DIENSTABENDS (Entwurf §3.2, Kopfzone §4.2, Breadcrumb
 * §4.1, Leerzustände §4.3).
 *
 * VIER ENTSCHEIDUNGEN, DIE HIER UND NUR HIER LIEGEN:
 *
 * 1. DIE NOTENSPUR ERSETZT DEN `BarChart` VOLLSTÄNDIG (§3.2 Punkt 2). Acht
 *    Verteilungen übereinander zeigen, ob der Abend gleichmäßig gut war oder eine
 *    Frage die Gruppe gespalten hat. Ein Balken mit dem Mittelwert 3,0 aus 6×1 und
 *    6×5 zeigt „befriedigend" — die einzige Note, die niemand gegeben hat. Das
 *    Diagramm aus `core/charts` fehlt hier nicht aus Bequemlichkeit: es färbt mit
 *    `colorPrimary` (DRK-Rot, Farb-Klausel §4.9) und kennt keine invertierte
 *    Skala.
 * 2. DIE AMPEL LIEST `avgSchulnote`, NIE `overallAvg` (§4.12) — der gemischte Wert
 *    schiebt Alt-Sterne (1–5) auf die Schulnotenrampe (1–6). `overallAvg` bleibt
 *    unverändert im CSV- und Prompt-Pfad.
 * 3. DER KI-PROMPT IST EIN ABSCHNITT DIESER SEITE (§3.2 Punkt 4), keine eigene
 *    Route mehr: die alte Seite lud dieselben Antworten ein zweites Mal und war
 *    nur über einen Textlink erreichbar.
 * 4. EIN NENNER WIRD NIE ERFUNDEN (§2.3, hier für den Rücklauf): ohne
 *    `participantCount` steht „3 Rückmeldungen", kein „von", kein Prozentwert.
 *
 * SERVER COMPONENT: kein Compound-Zugriff auf antd (§4.13) — `Breadcrumb` über
 * `items`, Überschriften nativ mit `T.*`, `Collapse` + `Input.TextArea` des
 * Prompts liegen in der Client-Insel `PromptBlock`.
 */
export default async function AuswertungPage({
  params,
}: {
  params: Promise<{ groupId: string; eveningId: string }>;
}) {
  const { groupId, eveningId } = await params;
  const urlGroupId = Number(groupId);
  const id = Number(eveningId);

  const evening = getEvening(getDb(), id);
  if (!evening) notFound();
  if (evening.groupId !== urlGroupId) notFound(); // URL-Hygiene, nicht der Guard selbst.

  // Guard gegen die ECHTE group_id des Dienstabends, nicht den URL-Parameter
  // (IDOR-Schutz, siehe guardPage.ts).
  const { db } = await guardPage(evening.groupId);
  const group = getGroup(db, evening.groupId);
  if (!group) notFound();

  const survey = getSurveyByEvening(db, id);
  if (!survey) notFound(); // ohne Umfrage nichts auszuwerten

  const questions: Question[] = JSON.parse(survey.questions);
  const answers = listResponses(db, survey.id).map(
    (r) => JSON.parse(r.answers) as Record<string, unknown>,
  );
  const stats = computeDAStats(questions, answers);
  /**
   * DIESELBE Funktion, die der Zwischenstand der Lagekarte liest (§2.3) — acht
   * Verteilungen, sechs Zellen je Frage. `stars` fehlt darin absichtlich (§4.12):
   * vier von fünf Sternen wären Zelle 4 („ausreichend"), also eine gute Bewertung
   * in der Farbe einer schwachen.
   */
  const verteilungen = verteilungJeFrage(questions, answers);

  /*
   * Wie in der alten Prompt-Route: rein gelesen, nicht persistiert — ein
   * Auto-Close hier wäre ein Seiteneffekt eines GETs (auch per Link-Prefetch
   * auslösbar). Die Sperre gilt für den EFFEKTIVEN Status, damit eine abgelaufene,
   * aber noch nicht geschlossene Umfrage nicht fälschlich gesperrt bleibt.
   */
  const effektiv = nextStatusOnAccess(survey.status as SurveyStatus, survey.closesAt, new Date());
  const prompt =
    effektiv === "active"
      ? null
      : buildAnalysisPrompt({
          groupName: group.name,
          eveningDate: formatDatumLang(evening.date),
          topic: evening.topic ?? undefined,
          participantCount: evening.participantCount ?? undefined,
          stats,
          /*
           * DURCHMISCHT, wie im CSV-Pfad (§3.9 Wortlaut A). `listResponses`
           * liefert Datenbankordnung und sagt selbst zu, dass der LESER
           * durchmischen muss. `buildAnalysisPrompt` bildet unter „Einzelne
           * Rueckmeldungen (Rohdaten)" je Person EINEN Block mit allen Noten und
           * allen Freitexten — in ungemischter Ordnung waere „Rueckmeldung 1" die
           * Person, die als erste abgegeben hat, und der Zettel hat ihr vorher
           * zugesagt, dass es diesen Kanal nicht gibt. `stats.texts` ist bereits
           * gemischt (`computeDAStats`), diese Liste war die letzte Ausnahme.
           */
          rawAnswers: shuffleStable(answers, (a) => JSON.stringify(a)),
        });

  const csv = `/m/feedback/groups/${group.id}/evenings/${id}/export.csv`;
  const teilnehmer = evening.participantCount;
  const nenner = teilnehmer !== null && teilnehmer > 0 ? teilnehmer : null;
  const quote = nenner === null ? null : Math.round((stats.responseCount / nenner) * 100);
  const freitexte = stats.texts.reduce((summe, frage) => summe + frage.values.length, 0);
  /**
   * „Ø aus 8 Fragen" muss den Nenner nennen, den `avgSchulnote` WIRKLICH benutzt
   * hat: `computeDAStats` mittelt nur Schulnotenfragen MIT mindestens einer
   * Antwort. `verteilungen.length` wäre die Zahl der Fragen IM BOGEN — bei drei
   * beantworteten von acht stünde dort „Ø aus 8 Fragen" über einem Mittelwert aus
   * drei. Das ist derselbe stille Rechenfehler, den §4.12 gerade beseitigt hat,
   * nur eine Zeile weiter.
   */
  const gemitteltAus = stats.perQuestion.filter((q) => q.type === "schulnote" && q.avg !== null)
    .length;

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      {/*
       * KOPFZONE (§4.2): drei Zeilen, flach, keine Karte. Die Breadcrumb IST der
       * Zurück-Weg (§4.1) — ein zusätzlicher „← Zurück"-Knopf entfällt, zwei
       * Rückwege sind ein Rückweg zu viel.
       */}
      <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Breadcrumb
          style={T.meta}
          items={[
            { title: <Link href="/m/feedback">Gruppen</Link> },
            { title: <Link href={`/m/feedback/groups/${group.id}`}>{group.name}</Link> },
            { title: "Auswertung" },
          ]}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <h1 style={{ ...T.h1, margin: 0, textWrap: "balance" }}>
            Auswertung — {formatAbendtag(evening.date)}
          </h1>
          {/* Textknöpfe der Seite, in derselben Zeile wie die Überschrift; auf
              390px rutschen sie darunter (`flexWrap`). */}
          <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Button type="text" href={csv}>
              CSV
            </Button>
            <Button type="text" href={`/m/feedback/groups/${group.id}/trend`}>
              Trend
            </Button>
          </span>
        </div>
        <p style={{ ...T.body, margin: 0, color: "var(--fb-muted)" }}>
          {group.name}
          {evening.topic ? ` · ${evening.topic}` : ""}
        </p>
      </header>

      {stats.responseCount === 0 ? (
        /* §4.3: der Satz statt leerer Spuren — der CSV-Link bleibt in der Kopfzone. */
        <Result status="info" title="Zu diesem Abend ist keine Rückmeldung eingegangen." />
      ) : (
        <>
          <Card variant="outlined" data-testid="kennzahlen" styles={KARTE}>
            {stats.responseCount < 3 && (
              /*
               * Kein Rot, kein Amber, kein Icon (§3.2 Punkt 1) — eine 3px linke
               * Kante in `--fb-line`. Ein `Alert type="error"` sähe hier aus wie
               * eine Primäraktion: `colorError === colorPrimary === #c8000f`.
               */
              <p
                style={{
                  ...T.body,
                  margin: "0 0 16px",
                  paddingLeft: 12,
                  borderLeft: "3px solid var(--fb-line)",
                }}
              >
                Nur {stats.responseCount} {stats.responseCount === 1 ? "Rückmeldung" : "Rückmeldungen"}{" "}
                — bitte nicht als Urteil über den Abend lesen.
              </p>
            )}
            <Row gutter={[24, 16]}>
              <Col xs={24} sm={8}>
                <p style={{ ...T.kicker, margin: 0 }}>RÜCKLAUF</p>
                <p style={{ ...T.zahl, margin: "4px 0 0" }}>
                  {nenner === null
                    ? `${stats.responseCount} ${stats.responseCount === 1 ? "Rückmeldung" : "Rückmeldungen"}`
                    : `${stats.responseCount} von ${nenner}`}
                </p>
                {quote !== null && <p style={{ ...T.meta, margin: 0 }}>{quote} %</p>}
              </Col>
              <Col xs={24} sm={8}>
                <p style={{ ...T.kicker, margin: 0 }}>GESAMTNOTE</p>
                <div style={{ marginTop: 4 }}>
                  <Notenplakette note={stats.avgSchulnote} fragen={gemitteltAus} />
                </div>
                {stats.hasLegacyScale && (
                  <p style={{ margin: "4px 0 0" }}>
                    <Altbestandsfussnote />
                  </p>
                )}
              </Col>
              <Col xs={24} sm={8}>
                <p style={{ ...T.kicker, margin: 0 }}>FREITEXTE</p>
                <p style={{ ...T.zahl, margin: "4px 0 0" }}>{freitexte}</p>
              </Col>
            </Row>
          </Card>

          {verteilungen.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h2 style={{ ...T.lead, margin: 0 }}>Bewertungsfragen</h2>
              {/*
               * Die Legende EINMAL, im identischen Sechs-Spalten-Raster der Spuren
               * darunter — dasselbe Raster, das der Teilnehmer im Fragebogen sieht.
               * Sie steht eingerückt wie die Spuren, damit Farbfeld und Zelle in
               * derselben Spalte sitzen.
               */}
              <div className="fb-spurzeile" style={{ borderBottom: "none" }}>
                <span />
                <span />
                <div className="fb-spur">
                  <Notenlegende groesse="gross" />
                </div>
                <span className="fb-anzahl" />
              </div>
              {verteilungen.map((frage, i) => (
                <div key={frage.id}>
                  {/* Sektions-Kicker aus `_lib/questions.ts` — dieselben drei
                      Namen, unter denen der Teilnehmer geantwortet hat (§3.2). */}
                  {(i === 0 || sektionVon(i) !== sektionVon(i - 1)) && (
                    <p style={{ ...T.kicker, margin: "12px 0 4px" }}>{SEKTIONEN[sektionVon(i)]}</p>
                  )}
                  <div className="fb-spurzeile">
                    <span style={{ ...T.meta, textAlign: "right" }}>{i + 1}</span>
                    <span style={T.body}>{frage.text}</span>
                    <div className="fb-spur">
                      <Notenspur verteilung={frage.verteilung} groesse="gross" />
                    </div>
                    <span className="fb-anzahl" style={{ ...T.meta, whiteSpace: "nowrap" }}>
                      n={frage.count}
                    </span>
                  </div>
                </div>
              ))}
            </section>
          )}

          {freitexte > 0 && (
            /*
             * Einspaltig und auf 68ch begrenzt (§3.2 Punkt 3): Zitate liest man
             * nicht über die volle Fensterbreite. Ab vier Antworten steht der Rest
             * hinter „alle 7 anzeigen" — als natives `<details>`, damit dafür keine
             * Client-Insel und kein JavaScript nötig ist.
             */
            <section style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: "68ch" }}>
              <h2 style={{ ...T.lead, margin: 0 }}>Freitexte</h2>
              {stats.texts
                .filter((frage) => frage.values.length > 0)
                .map((frage) => (
                  <div key={frage.questionId}>
                    <h3 style={{ ...T.body, fontWeight: 600, margin: "0 0 8px" }}>{frage.text}</h3>
                    {frage.values.slice(0, SICHTBARE_ZITATE).map((wert, i) => (
                      <Zitat key={i} text={wert} />
                    ))}
                    {frage.values.length > SICHTBARE_ZITATE && (
                      <details>
                        <summary style={{ ...T.meta, cursor: "pointer" }}>
                          alle {frage.values.length} anzeigen
                        </summary>
                        {frage.values.slice(SICHTBARE_ZITATE).map((wert, i) => (
                          <Zitat key={i} text={wert} />
                        ))}
                      </details>
                    )}
                  </div>
                ))}
            </section>
          )}

          <PromptBlock prompt={prompt} />
        </>
      )}
    </div>
  );
}

/** Kartenpolster wie in jeder Zone des Moduls (§4.8, `--fb-kartenpolster`). */
const KARTE = { body: { padding: "var(--fb-kartenpolster)" } };

/** Ab der vierten Antwort verschwindet der Rest hinter „alle … anzeigen" (§3.2). */
const SICHTBARE_ZITATE = 3;

/** Ein Zitatblock: 15/1,6 wäre eine achte Schriftgröße — die Leiter gilt (§4.7). */
function Zitat({ text }: { text: string }) {
  return (
    <p
      style={{
        ...ZIFFERN,
        fontSize: 14,
        lineHeight: 1.6,
        margin: "0 0 8px",
        paddingLeft: 12,
        borderLeft: "2px solid var(--fb-split)",
      }}
    >
      {text}
    </p>
  );
}
