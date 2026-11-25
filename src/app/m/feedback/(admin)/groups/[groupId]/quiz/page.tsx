import { notFound } from "next/navigation";
import { Seite } from "@/core/seite/Seite";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getGroup } from "@/app/m/feedback/_db/queries";
import { heutigeRunde, listeQuizze } from "@/app/m/feedback/_db/quiz";
import { guardPage } from "@/app/m/feedback/_lib/guardPage";
import { QuizListe, type QuizZeile } from "@/app/m/feedback/_ui/QuizListe";

/**
 * DIE QUIZZE EINER GRUPPE (Live-Quiz, Spec §5.2). Server Component: kein Compound-Zugriff auf
 * antd (Falle 1), die Tabelle liegt in der Client-Insel `QuizListe` und bekommt nur Werte
 * (Falle 9). Keine `loading.tsx` über diesem Segment, `notFound()` ist also ein echter 404
 * (Falle 23).
 *
 * Reiner Lesezugriff: „Heute" zeigt die jüngste Runde von heute, das Auto-Ende holen die
 * Quizwege und die Actions nach.
 */
export default async function QuizSeite({ params }: { params: Promise<{ groupId: string }> }) {
  const id = Number((await params).groupId);
  const { db } = await guardPage(id);
  const group = getGroup(db, id);
  if (!group) notFound();

  const jetzt = new Date();
  const zeilen: QuizZeile[] = listeQuizze(db, id).map((q) => {
    const runde = heutigeRunde(db, q.id, jetzt);
    return {
      id: q.id,
      titel: q.titel,
      modus: q.modus,
      fragen: (JSON.parse(q.fragen) as unknown[]).length,
      heute: runde ? (runde.beendetAt === null ? "laeuft" : "beendet") : null,
    };
  });

  return (
    <Seite typ="liste">
      <div>
        <Seitenkopf
          titel={`Quiz — ${group.name}`}
          beschreibung="Live-Quiz für den Dienstabend: auf dem Beamer oder in Slidev, beantwortet am Handy."
          zurueck={{ titel: group.name, href: `/m/feedback/groups/${group.id}` }}
        />
      </div>
      <QuizListe groupId={group.id} zeilen={zeilen} />
    </Seite>
  );
}

export const metadata = { title: "Quiz" };
