import { notFound } from "next/navigation";
import { PruefungAmGeraet } from "../../../../_ui/telefon/PruefungAmGeraet";
import { geraetOder404 } from "../laden";

export const dynamic = "force-dynamic";

export default async function PruefungSeite({ params }: { params: Promise<{ id: string }> }) {
  const { g, checkliste } = await geraetOder404(params);
  const frist = g.staende.find((f) => f.vorlage.wer === "intern");
  if (!frist || checkliste.length === 0) notFound();
  return (
    <PruefungAmGeraet
      geraetId={g.id}
      geraetName={g.name}
      titel={frist.vorlage.name}
      checkliste={checkliste}
      stundenPflicht={g.stundenPflicht}
      stundenZuletzt={g.stunden}
    />
  );
}
