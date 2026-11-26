import { ladeAuswertung } from "@/app/m/feedback/_lib/quiz/zugriff";

/** Zugriffsschutz über jeder möglichen Ladegrenze (Falle 23, `CLAUDE.md`); die Seite prüft selbst nochmals. */
export default async function QuizAuswertungSchutz({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ groupId: string; eveningId: string; rundeId: string }>;
}) {
  await ladeAuswertung(params);
  return children;
}
