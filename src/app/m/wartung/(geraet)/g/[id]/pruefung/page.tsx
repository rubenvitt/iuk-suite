import { notFound } from "next/navigation";
import { idSchema } from "../../../../_lib/eingabe";
import { PruefungAmGeraet } from "../../../../_ui/telefon/PruefungAmGeraet";
import { geraetOder404 } from "../laden";

export const dynamic = "force-dynamic";

/** `?art=<Prüfart>` wählt unter mehreren Prüfungen am Gerät (IDA-369); ohne die fällige. */
export default async function PruefungSeite({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ art?: string | string[] }> }) {
  const { art } = await searchParams;
  const gewuenscht = typeof art === "string" && idSchema.safeParse(art).success ? art : null;
  const { g, pruefung, checkliste } = await geraetOder404(params, gewuenscht ? `pruefung?art=${gewuenscht}` : "pruefung", gewuenscht);
  if (!pruefung || checkliste.length === 0) notFound();
  return (
    <PruefungAmGeraet
      geraetId={g.id}
      geraetName={g.name}
      pruefartId={pruefung.vorlage.id}
      anlass={pruefung.vorlage.anlass !== null}
      titel={pruefung.vorlage.name}
      checkliste={checkliste}
      kiste={g.kiste}
      stundenPflicht={g.stundenPflicht}
      stundenZuletzt={g.stunden}
    />
  );
}

export const metadata = { title: "Prüfung" };
