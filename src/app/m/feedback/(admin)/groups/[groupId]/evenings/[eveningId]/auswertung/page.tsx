import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/app/m/feedback/_db/client";
import { getEvening, getGroup, getSurveyByEvening, listResponses } from "@/app/m/feedback/_db/queries";
import { guardPage } from "@/app/m/feedback/_lib/guardPage";
import { computeDAStats } from "@/app/m/feedback/_lib/aggregation";
import { isRatingType, ratingScale, type Question, type QuestionType } from "@/app/m/feedback/_lib/questions";
import { SPACE } from "@/core/theme/tokens";
import { BarChart } from "@/core/charts/BarChart";
import { Altbestandsfussnote, Notenpille } from "@/app/m/feedback/_ui/Noten";

// Server-Komponente: kein antd-Compound-Zugriff — der Chart-Wrapper ist eine
// eigene Client-Komponente (`@/core/charts/BarChart`). Eine Server-Komponente
// darf eine Client-Komponente direkt rendern (die RSC-Grenze verbietet nur die
// umgekehrte Richtung), deshalb bleibt diese Seite bewusst frei von "use client".
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
  // (IDOR-Schutz, siehe guardPage.ts / EveningDetail aus Task 12).
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

  // Ein Balkendiagramm je Rating-Skala: aktuell erzeugen neue Umfragen nur
  // "schulnote" (Skala 1–6), aber importierte Alt-Umfragen können "stars"
  // (Skala 1–5) enthalten — beide teilen sich kein Diagramm, weil sie sich
  // eine y-Achsen-Domain nicht sinnvoll teilen können.
  const ratingGroups = new Map<QuestionType, { text: string; avg: number | null }[]>();
  for (const q of stats.perQuestion) {
    if (!isRatingType(q.type)) continue;
    const bucket = ratingGroups.get(q.type) ?? [];
    bucket.push({ text: q.text, avg: q.avg });
    ratingGroups.set(q.type, bucket);
  }

  const hasTexts = stats.texts.some((t) => t.values.length > 0);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: SPACE.xxl, padding: SPACE.lg }}>
      <section style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Auswertung</h1>
        <p style={{ margin: 0 }}>
          {group.name} — {new Date(evening.date).toISOString().slice(0, 10)}
          {evening.topic ? ` — ${evening.topic}` : ""}
        </p>
        {/*
         * Der Ø kommt aus `avgSchulnote`, NICHT aus `overallAvg` (§4.12): der
         * gemischte Wert schiebt Alt-Sterne (1–5) auf die Schulnotenrampe (1–6)
         * — „Schulnote 1 und 5 von 5 Sternen" ergäbe dort 3,0, also
         * „befriedigend" für zwei Bestnoten. `overallAvg` bleibt unverändert im
         * CSV-/Prompt-Pfad.
         */}
        <p
          style={{
            margin: 0,
            display: "flex",
            alignItems: "center",
            gap: SPACE.sm,
            flexWrap: "wrap",
          }}
        >
          <span>
            {stats.responseCount} Rückmeldung{stats.responseCount === 1 ? "" : "en"} · Ø Note (1 =
            beste):
          </span>
          <Notenpille note={stats.avgSchulnote} />
        </p>
        {stats.hasLegacyScale && <Altbestandsfussnote />}
        <div style={{ display: "flex", gap: SPACE.lg }}>
          <Link href={`/m/feedback/groups/${group.id}/evenings/${id}/export.csv`}>CSV-Export</Link>
          <Link href={`/m/feedback/groups/${group.id}/evenings/${id}/prompt`}>KI-Prompt</Link>
        </div>
      </section>

      {[...ratingGroups.entries()].map(([type, items]) => (
        <section key={type} style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Bewertungen (1–{ratingScale(type)})</h2>
          <BarChart
            data={items.map((i) => ({ x: i.text, y: i.avg }))}
            xKey="x"
            yKey="y"
            domain={[1, ratingScale(type)]}
          />
        </section>
      ))}

      {hasTexts && (
        <section style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Freitextantworten</h2>
          {stats.texts.map((t) => (
            <div key={t.questionId} style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{t.text}</h3>
              {t.values.length === 0 ? (
                <p style={{ opacity: 0.65, margin: 0 }}>Keine Antworten.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: SPACE.lg }}>
                  {t.values.map((v, i) => (
                    <li key={i}>{v}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}
    </section>
  );
}
