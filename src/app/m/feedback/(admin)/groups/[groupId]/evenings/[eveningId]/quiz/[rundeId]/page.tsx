import { Seite } from "@/core/seite/Seite";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { auswertung } from "@/app/m/feedback/_lib/quiz/auswertung";
import { ladeAuswertung } from "@/app/m/feedback/_lib/quiz/zugriff";
import { QuizAuswertung } from "@/app/m/feedback/_ui/QuizAuswertung";
import { formatAbendtag } from "@/app/m/feedback/_ui/datum";

/** Die Quiz-Auswertung einer Runde am Dienstabend (Spec §5.5). Ohne `loading.tsx`; Guard in `layout.tsx`. */
export default async function QuizAuswertungPage({
  params,
}: {
  params: Promise<{ groupId: string; eveningId: string; rundeId: string }>;
}) {
  const { group, evening, stand } = await ladeAuswertung(params);
  const daten = auswertung(stand.daten, stand.titel);
  return (
    <Seite typ="uebersicht">
      <Seitenkopf
        titel={`Quiz-Auswertung — ${stand.titel}`}
        beschreibung={`${group.name}${evening.topic ? ` · ${evening.topic}` : ""}`}
        zurueck={{ titel: group.name, href: `/m/feedback/groups/${group.id}` }}
      />
      <QuizAuswertung daten={daten} datum={formatAbendtag(evening.date)} />
    </Seite>
  );
}

export const metadata = { title: "Quiz-Auswertung" };
