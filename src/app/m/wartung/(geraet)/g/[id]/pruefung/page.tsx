import { notFound } from "next/navigation";
import { PruefungAmGeraet } from "../../../../_ui/telefon/PruefungAmGeraet";
import { geraetOder404 } from "../laden";

export const dynamic = "force-dynamic";

export default async function PruefungSeite({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ rueckgabe?: string }> }) {
  const { g, checkliste, unterwegs } = await geraetOder404(params, "pruefung");
  const frist = g.staende.find((f) => f.vorlage.wer === "intern");
  if (!frist || checkliste.length === 0) notFound();
  // Nur die offene ganze Entnahme dieses Geräts zählt als Rückgabe; alles andere ignorieren.
  const { rueckgabe } = await searchParams;
  const zurueck = rueckgabe && unterwegs.ganz?.id === rueckgabe ? rueckgabe : undefined;
  return (
    <PruefungAmGeraet
      geraetId={g.id}
      geraetName={g.name}
      titel={zurueck ? "Kiste zurücklegen" : frist.vorlage.name}
      checkliste={checkliste}
      kiste={g.kiste}
      stundenPflicht={g.stundenPflicht}
      stundenZuletzt={g.stunden}
      unterwegs={zurueck ? {} : Object.fromEntries(unterwegs.jePosition)}
      anleitung={g.pruefanleitung}
      rueckgabe={zurueck}
    />
  );
}

export const metadata = { title: "Prüfung" };
