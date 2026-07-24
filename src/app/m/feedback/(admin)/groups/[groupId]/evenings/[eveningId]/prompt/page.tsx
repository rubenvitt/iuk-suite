import { notFound } from "next/navigation";
import { getDb } from "@/app/m/feedback/_db/client";
import { getEvening, getGroup, getSurveyByEvening, listResponses } from "@/app/m/feedback/_db/queries";
import { guardPage } from "@/app/m/feedback/_lib/guardPage";
import { computeDAStats } from "@/app/m/feedback/_lib/aggregation";
import { buildAnalysisPrompt } from "@/app/m/feedback/_lib/prompt";
import { nextStatusOnAccess, type SurveyStatus } from "@/app/m/feedback/_lib/lifecycle";
import type { Question } from "@/app/m/feedback/_lib/questions";
import { SPACE } from "@/core/theme/tokens";

function formatDate(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
}

// Server-Komponente: kein antd-Compound-Zugriff — das Kopierfeld ist ein
// schlichtes `<textarea readOnly>`, kein antd `Input.TextArea`.
export default async function PromptPage({
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

  const { db } = await guardPage(evening.groupId);
  const group = getGroup(db, evening.groupId);
  if (!group) notFound();

  const survey = getSurveyByEvening(db, id);
  if (!survey) notFound(); // ohne Umfrage kein Prompt

  // Wie in EveningDetail (Task 12): rein gelesen, nicht persistiert — ein
  // Auto-Close hier wäre ein Seiteneffekt eines GETs (auch per Link-Prefetch
  // auslösbar). Die Sperre gilt für den EFFEKTIVEN Status, damit eine
  // abgelaufene, aber noch nicht geschlossene Umfrage nicht fälschlich
  // gesperrt bleibt bzw. eine wirklich aktive Umfrage nicht fälschlich
  // freigegeben wird.
  const effectiveStatus = nextStatusOnAccess(survey.status as SurveyStatus, survey.closesAt, new Date());

  let prompt: string | null = null;
  if (effectiveStatus !== "active") {
    const questions: Question[] = JSON.parse(survey.questions);
    const answers = listResponses(db, survey.id).map(
      (r) => JSON.parse(r.answers) as Record<string, unknown>,
    );
    const stats = computeDAStats(questions, answers);
    prompt = buildAnalysisPrompt({
      groupName: group.name,
      eveningDate: formatDate(new Date(evening.date)),
      topic: evening.topic ?? undefined,
      participantCount: evening.participantCount ?? undefined,
      stats,
      rawAnswers: answers,
    });
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: SPACE.xxl, padding: SPACE.lg }}>
      <section style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>KI-Prompt</h1>
        <p style={{ margin: 0 }}>
          {group.name} — {new Date(evening.date).toISOString().slice(0, 10)}
        </p>
      </section>

      {prompt === null ? (
        <p style={{ margin: 0 }}>
          Die Umfrage ist noch aktiv. Der KI-Prompt steht erst zur Verfügung, sobald sie geschlossen wurde.
        </p>
      ) : (
        <textarea
          readOnly
          value={prompt}
          rows={24}
          style={{ width: "100%", fontFamily: "monospace", fontSize: 13, padding: SPACE.sm }}
        />
      )}
    </section>
  );
}
