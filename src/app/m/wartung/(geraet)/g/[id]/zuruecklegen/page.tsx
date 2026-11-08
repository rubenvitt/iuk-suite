import { redirect } from "next/navigation";
import { ZuruecklegenAmGeraet } from "../../../../_ui/telefon/ZuruecklegenAmGeraet";
import { geraetOder404 } from "../laden";

export const dynamic = "force-dynamic";

export default async function ZuruecklegenSeite({ params }: { params: Promise<{ id: string }> }) {
  const { g, unterwegs } = await geraetOder404(params, "zuruecklegen");
  // Die ganze Kiste kommt übers Durchzählen zurück; ohne offene Entnahme gibt es nichts zurückzulegen.
  if (g.kiste && unterwegs.ganz) redirect(`/g/${g.id}/pruefung?rueckgabe=${unterwegs.ganz.id}`);
  if (unterwegs.entnahmen.length === 0) redirect(`/g/${g.id}`);
  return <ZuruecklegenAmGeraet geraetId={g.id} geraetName={g.name} kiste={g.kiste} anleitung={g.pruefanleitung} entnahmen={unterwegs.entnahmen} />;
}

export const metadata = { title: "Zurücklegen" };
