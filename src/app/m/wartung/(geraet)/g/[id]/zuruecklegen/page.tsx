import { notFound, redirect } from "next/navigation";
import { ZuruecklegenAmGeraet } from "../../../../_ui/telefon/ZuruecklegenAmGeraet";
import { geraetOder404 } from "../laden";

export const dynamic = "force-dynamic";

export default async function ZuruecklegenSeite({ params }: { params: Promise<{ id: string }> }) {
  const { g, unterwegs } = await geraetOder404(params, "zuruecklegen");
  // Nur Kisten (IDA-369). Die ganze Kiste kommt übers Durchzählen zurück; ohne offene Entnahme gibt es nichts zurückzulegen.
  if (!g.kiste) notFound();
  if (unterwegs.ganz) redirect(`/g/${g.id}/pruefung?rueckgabe=${unterwegs.ganz.id}`);
  if (unterwegs.entnahmen.length === 0) redirect(`/g/${g.id}`);
  return <ZuruecklegenAmGeraet geraetId={g.id} geraetName={g.name} anleitung={g.pruefanleitung} entnahmen={unterwegs.entnahmen.map(({ id, wer, zweck, ganz, seit, positionen }) => ({ id, wer, zweck, ganz, seit, positionen }))} />;
}

export const metadata = { title: "Zurücklegen" };
