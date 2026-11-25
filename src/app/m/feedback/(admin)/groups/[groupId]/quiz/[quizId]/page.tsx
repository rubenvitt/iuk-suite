import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Seite } from "@/core/seite/Seite";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "@/app/m/feedback/_db/client";
import { getGroup } from "@/app/m/feedback/_db/queries";
import { quizPerId } from "@/app/m/feedback/_db/quiz";
import { guardPage } from "@/app/m/feedback/_lib/guardPage";
import type { QuizFrage } from "@/app/m/feedback/_lib/quiz/fragen";
import { beamerUrlAus } from "@/app/m/feedback/_lib/quiz/adresse";
import { QuizEditor } from "@/app/m/feedback/_ui/QuizEditor";

/**
 * EIN QUIZ BEARBEITEN (Live-Quiz, Spec §5.2, §5.5, §5.6).
 *
 * IDOR: geprüft wird die Gruppe AUS DER QUIZZEILE, nicht `groupId` aus der URL. Passt die URL
 * nicht zur Zeile, ist es ein 404 wie ein unbekanntes Quiz — ein fremdes Quiz unter der eigenen
 * Gruppe aufzurufen verrät so nichts. Keine `loading.tsx` darüber (Falle 23).
 */
export default async function QuizBearbeiten({
  params,
}: {
  params: Promise<{ groupId: string; quizId: string }>;
}) {
  const p = await params;
  const groupId = Number(p.groupId);
  const quiz = quizPerId(getDb(), Number(p.quizId));
  if (!quiz) notFound();
  // Unbekannt und fremd enden beide im 404 (`guardPage` wirft dort `notFound()`).
  const { db } = await guardPage(quiz.groupId);
  if (quiz.groupId !== groupId) notFound();
  const group = getGroup(db, quiz.groupId);
  if (!group) notFound();

  return (
    <Seite typ="formular">
      <div>
        <Seitenkopf
          titel={quiz.titel}
          beschreibung="Fragen, Modus und die Adresse für Beamer und Slidev."
          zurueck={{ titel: "Quiz", href: `/m/feedback/groups/${group.id}/quiz` }}
        />
      </div>
      <QuizEditor
        quizId={quiz.id}
        titel={quiz.titel}
        modus={quiz.modus}
        fragen={JSON.parse(quiz.fragen) as QuizFrage[]}
        beamerUrl={beamerUrlAus(await headers(), quiz.moderationSecret)}
      />
    </Seite>
  );
}

export const metadata = { title: "Quiz bearbeiten" };
