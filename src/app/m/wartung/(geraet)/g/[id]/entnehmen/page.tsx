import { notFound, redirect } from "next/navigation";
import { EntnehmenAmGeraet } from "../../../../_ui/telefon/EntnehmenAmGeraet";
import { geraetOder404 } from "../laden";

export const dynamic = "force-dynamic";

export default async function EntnehmenSeite({ params }: { params: Promise<{ id: string }> }) {
  const { g, checkliste, unterwegs } = await geraetOder404(params, "entnehmen");
  // Nur Kisten; ein Gerät meldet sich mit „Wird eingesetzt“ (IDA-369). Ist die ganze Kiste draußen, gibt es nichts mehr zu entnehmen.
  if (!g.kiste) notFound();
  if (unterwegs.ganz) redirect(`/g/${g.id}`);
  return (
    <EntnehmenAmGeraet
      geraetId={g.id}
      geraetName={g.name}
      positionen={checkliste.map((c) => ({ id: c.id, text: c.text, soll: c.soll ?? 0, frei: Math.max(0, (c.soll ?? 0) - (unterwegs.jePosition.get(c.id) ?? 0)) }))}
      etwasUnterwegs={unterwegs.entnahmen.length > 0}
      ganzMoeglich={g.staende.some((f) => f.vorlage.wer === "intern" && !f.vorlage.anlass)}
    />
  );
}

export const metadata = { title: "Entnehmen" };
