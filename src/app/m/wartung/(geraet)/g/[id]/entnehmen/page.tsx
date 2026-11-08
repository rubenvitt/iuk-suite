import { redirect } from "next/navigation";
import { EntnehmenAmGeraet } from "../../../../_ui/telefon/EntnehmenAmGeraet";
import { geraetOder404 } from "../laden";

export const dynamic = "force-dynamic";

export default async function EntnehmenSeite({ params }: { params: Promise<{ id: string }> }) {
  const { g, checkliste, unterwegs } = await geraetOder404(params, "entnehmen");
  // Ist die ganze Kiste draußen, gibt es nichts mehr zu entnehmen.
  if (unterwegs.ganz) redirect(`/g/${g.id}`);
  return (
    <EntnehmenAmGeraet
      geraetId={g.id}
      geraetName={g.name}
      kiste={g.kiste}
      positionen={checkliste.map((c) => ({ id: c.id, text: c.text, soll: c.soll ?? 0, frei: Math.max(0, (c.soll ?? 0) - (unterwegs.jePosition.get(c.id) ?? 0)) }))}
      etwasUnterwegs={unterwegs.entnahmen.length > 0}
    />
  );
}

export const metadata = { title: "Entnehmen" };
