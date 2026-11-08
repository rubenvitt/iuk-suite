import { notFound } from "next/navigation";
import Link from "next/link";
import { seitText } from "../../../../_lib/unterwegsText";
import s from "../../../../_ui/wartung.module.css";
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
  // Eine Kiste, die ganz unterwegs ist, wird nicht durchgezählt, sondern zurückgelegt.
  if (unterwegs.ganz && !zurueck) {
    return (
      <div className={s.telefon}>
        <section className={s.karte}>
          <p style={{ margin: "0 0 12px" }} role="status">
            Die Kiste ist unterwegs seit {seitText(unterwegs.ganz.seit)} Durchzählen geht, wenn sie zurück ist.
          </p>
          <Link href={`/g/${g.id}/pruefung?rueckgabe=${unterwegs.ganz.id}`}>Zurücklegen</Link>
        </section>
      </div>
    );
  }
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
