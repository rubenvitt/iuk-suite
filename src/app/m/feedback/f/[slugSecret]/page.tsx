import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getDb } from "../../_db/client";
import { getGroupBySlug, activeSurveyForGroup, setSurveyStatus } from "../../_db/queries";
import { parseToken } from "../../_lib/token";
import { nextStatusOnAccess } from "../../_lib/lifecycle";
import type { Question } from "../../_lib/questions";
import { SurveyForm } from "./SurveyForm";

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
  return (
    <SurveyForm
      slugSecret={slugSecret}
      groupName={group.name}
      eveningTopic={active.evening.topic}
      questions={questions}
    />
  );
}
