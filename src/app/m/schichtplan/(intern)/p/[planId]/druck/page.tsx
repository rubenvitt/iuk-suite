import { headers } from "next/headers";
import { getDb } from "../../../../_db/client";
import { stammHelfer, tempAlsPlanHelfer } from "../../../../_lib/bestand";
import { requireSchichtplanHost } from "../../../../_lib/host";
import { planungOder404, requireSchichtplanZugang } from "../../../../_lib/zugang";
import { Druckansicht } from "../../../../_ui/Druckansicht";

export const dynamic = "force-dynamic";

/**
 * Die Druckblätter einer Planung, ohne Hülle: `?sicht=abschnitt|helfer`, optional `&auswahl=<id|schluessel>`
 * für ein einzelnes Blatt. Öffnet den Druckdialog von selbst.
 */
export default async function PlanungDruck({ params, searchParams }: {
  params: Promise<{ planId: string }>; searchParams: Promise<{ sicht?: string | string[]; auswahl?: string | string[] }>;
}) {
  requireSchichtplanHost(await headers());
  await requireSchichtplanZugang();
  const planung = planungOder404(getDb(), (await params).planId);
  const q = await searchParams;
  const sicht = q.sicht === "helfer" ? "helfer" : "abschnitt";
  const auswahl = typeof q.auswahl === "string" ? q.auswahl : null;
  return (
    <Druckansicht
      planung={planung}
      helfer={[...stammHelfer(), ...tempAlsPlanHelfer(planung.temporaere)]}
      sicht={sicht}
      auswahl={auswahl}
      jetzt={new Date().getTime()}
    />
  );
}
