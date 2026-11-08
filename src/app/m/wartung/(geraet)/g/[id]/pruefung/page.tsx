import { notFound } from "next/navigation";
import Link from "next/link";
import { pruefungModus } from "../../../../_lib/unterwegs";
import { seitText } from "../../../../_lib/unterwegsText";
import s from "../../../../_ui/wartung.module.css";
import { PruefungAmGeraet } from "../../../../_ui/telefon/PruefungAmGeraet";
import { geraetOder404 } from "../laden";

export const dynamic = "force-dynamic";

export default async function PruefungSeite({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ rueckgabe?: string }> }) {
  const { g, checkliste, unterwegs } = await geraetOder404(params, "pruefung");
  const frist = g.staende.find((f) => f.vorlage.wer === "intern");
  if (!frist || checkliste.length === 0) notFound();
  const { rueckgabe } = await searchParams;
  const modus = pruefungModus(g.kiste, unterwegs, rueckgabe);
  // Eine Kiste, die ganz unterwegs ist, wird nicht durchgezählt, sondern zurückgelegt; ein Gerät über seine Zurücklegen-Seite.
  if (modus.art === "unterwegs") {
    return (
      <div className={s.telefon}>
        <section className={s.karte}>
          <p style={{ margin: "0 0 12px" }} role="status">
            {g.kiste ? `Die Kiste ist unterwegs seit ${seitText(modus.seit)} Durchzählen geht, wenn sie zurück ist.` : `Das Gerät ist unterwegs seit ${seitText(modus.seit)}`}
          </p>
          <Link href={g.kiste ? `/g/${g.id}/pruefung?rueckgabe=${modus.id}` : `/g/${g.id}/zuruecklegen`}>Zurücklegen</Link>
        </section>
      </div>
    );
  }
  const zurueck = modus.art === "rueckgabe" ? modus.id : undefined;
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
