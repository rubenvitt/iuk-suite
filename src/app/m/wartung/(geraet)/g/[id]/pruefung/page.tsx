import { notFound } from "next/navigation";
import Link from "next/link";
import { idSchema } from "../../../../_lib/eingabe";
import { pruefungModus } from "../../../../_lib/unterwegs";
import { seitText } from "../../../../_lib/unterwegsText";
import s from "../../../../_ui/wartung.module.css";
import { PruefungAmGeraet } from "../../../../_ui/telefon/PruefungAmGeraet";
import { geraetOder404 } from "../laden";

export const dynamic = "force-dynamic";

/** `?art=<Prüfart>` wählt unter mehreren Prüfungen am Gerät (IDA-369); ohne die fällige. `?rueckgabe=` legt eine ganz entnommene Kiste zurück (IDA-372). */
export default async function PruefungSeite({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ art?: string | string[]; rueckgabe?: string }> }) {
  const { art, rueckgabe } = await searchParams;
  const gewuenscht = typeof art === "string" && idSchema.safeParse(art).success ? art : null;
  const { g, pruefung, checkliste, unterwegs } = await geraetOder404(params, gewuenscht ? `pruefung?art=${gewuenscht}` : "pruefung", gewuenscht);
  if (!pruefung || checkliste.length === 0) notFound();
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
      pruefartId={pruefung.vorlage.id}
      anlass={pruefung.vorlage.anlass !== null}
      titel={zurueck ? "Kiste zurücklegen" : pruefung.vorlage.name}
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
