import { notFound } from "next/navigation";
import Link from "next/link";
import { idSchema } from "../../../../_lib/eingabe";
import { pruefungAmGeraet } from "../../../../_lib/pruefplan";
import { pruefungModus } from "../../../../_lib/unterwegs";
import { seitText } from "../../../../_lib/unterwegsText";
import s from "../../../../_ui/wartung.module.css";
import { PruefungAmGeraet } from "../../../../_ui/telefon/PruefungAmGeraet";
import { geraetOder404 } from "../laden";

export const dynamic = "force-dynamic";

/**
 * `?art=<Prüfart>` wählt unter mehreren Prüfungen am Gerät (IDA-369); ohne die fällige. `?rueckgabe=` legt eine ganz
 * entnommene Kiste zurück (IDA-372) und zählt als ihre Prüfung nach Frist, nie als eine auf Anlass.
 */
export default async function PruefungSeite({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ art?: string | string[]; rueckgabe?: string }> }) {
  const { art, rueckgabe } = await searchParams;
  const gewuenscht = typeof art === "string" && idSchema.safeParse(art).success ? art : null;
  const { g, pruefung, checkliste, unterwegs } = await geraetOder404(params, gewuenscht ? `pruefung?art=${gewuenscht}` : "pruefung", gewuenscht);
  const modus = pruefungModus(unterwegs, rueckgabe);
  const zurueck = modus.art === "rueckgabe" ? modus.id : undefined;
  const lauf = zurueck ? pruefungAmGeraet(g.staende.filter((f) => !f.vorlage.anlass)) : pruefung;
  if (!lauf || checkliste.length === 0) notFound();
  // Eine Kiste, die ganz unterwegs ist, wird nicht durchgezählt, sondern zurückgelegt.
  if (modus.art === "unterwegs") {
    return (
      <div className={s.telefon}>
        <section className={s.karte}>
          <p style={{ margin: "0 0 12px" }} role="status">
            {`Die Kiste ist unterwegs seit ${seitText(modus.seit)} Durchzählen geht, wenn sie zurück ist.`}
          </p>
          <Link href={`/g/${g.id}/pruefung?rueckgabe=${modus.id}`}>Zurücklegen</Link>
        </section>
      </div>
    );
  }
  return (
    <PruefungAmGeraet
      // Nach der Rückgabe geht es auf derselben Seite zur Prüfung „nach Benutzung“: neu aufbauen statt „gespeichert“ stehen lassen.
      key={`${lauf.vorlage.id}:${zurueck ?? ""}`}
      geraetId={g.id}
      geraetName={g.name}
      pruefartId={lauf.vorlage.id}
      anlass={lauf.vorlage.anlass !== null}
      titel={zurueck ? "Kiste zurücklegen" : lauf.vorlage.name}
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
