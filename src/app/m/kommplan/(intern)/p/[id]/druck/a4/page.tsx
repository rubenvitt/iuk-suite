import "./druck.css";
import { headers } from "next/headers";
import { getDb } from "@/app/m/kommplan/_db/client";
import { kopfFuerZeichnung } from "@/app/m/kommplan/_lib/briefkopf";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { teileAuf } from "@/app/m/kommplan/_lib/layout/papier";
import { ladePlanOder404 } from "@/app/m/kommplan/_lib/plaene";
import { rahmenFuer } from "@/app/m/kommplan/_lib/rahmen";
import { symboleFuer } from "@/app/m/kommplan/_lib/zeichen/zeichen";
import { requireKommplanZugang } from "@/app/m/kommplan/_lib/zugang";
import { ARIMO } from "@/app/m/kommplan/_ui/schrift";
import { Druckblaetter } from "@/app/m/kommplan/_ui/zeichnung/Druckblaetter";
import { Drucken } from "./Drucken";

export const dynamic = "force-dynamic";

/**
 * DRUCK A4 QUER (Spec §8.1): jedes Blatt als Vektor-SVG in Originalgröße; „Als PDF sichern" im
 * Druckdialog liefert das PDF. Keine Hülle (sie druckte sonst mit, Abweichung 6); Host, Zugang und
 * das 404 des Plans prüfen `(intern)/layout.tsx`, `(intern)/p/[id]/layout.tsx` UND diese Seite.
 */
export default async function DruckA4({ params }: { params: Promise<{ id: string }> }) {
  requireKommplanHost(await headers());
  await requireKommplanZugang();
  const { id } = await params;
  const plan = ladePlanOder404(getDb(), id);
  if (!plan.inhalt) return <main className="kp-druck"><p>Dieser Plan lässt sich nicht lesen.</p></main>;
  const blaetter = teileAuf(plan.inhalt, "a4-quer");
  const symbole = symboleFuer(plan.inhalt);
  const rahmen = rahmenFuer({
    titel: plan.titel, anlass: plan.anlass, datum: plan.datum, aktualisiertAm: plan.aktualisiertAm,
    aktualisiertVon: plan.aktualisiertVon, vermerkVsNfD: plan.inhalt.optionen.vermerkVsNfD,
    kopf: kopfFuerZeichnung(getDb()),
  });
  return (
    <main className={`kp-druck ${ARIMO.className}`}>
      <Drucken />
      <Druckblaetter blaetter={blaetter} rahmen={rahmen} symbole={symbole} schrift={ARIMO.style.fontFamily} />
    </main>
  );
}
