import { headers } from "next/headers";
import Link from "next/link";
import { Card } from "antd";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "@/app/m/kommplan/_db/client";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { beschreibungFuer, ladePlanOder404 } from "@/app/m/kommplan/_lib/plaene";
import { symboleFuer, zeichenIndex } from "@/app/m/kommplan/_lib/zeichen/zeichen";
import { darfKommplanBearbeiten, requireKommplanZugang } from "@/app/m/kommplan/_lib/zugang";
import { Betrachter } from "@/app/m/kommplan/_ui/betrachter/Betrachter";
import { Editor } from "@/app/m/kommplan/_ui/editor/Editor";
import { Huelle } from "@/app/m/kommplan/_ui/Huelle";
import { ARIMO } from "@/app/m/kommplan/_ui/schrift";

export const dynamic = "force-dynamic";

/**
 * Editor für Bearbeitende (`isModuleAdmin`), Betrachter für die Zugangsgruppe (Spec §6.1) —
 * dasselbe Prädikat, das jede Server Action des Editors prüft. `key={plan.id}`: der Editor sät
 * seinen Zustand einmal aus den Props und prüft beim Montieren den Serverstand (Umsetzungsplan
 * Phase 2, Entscheidung 21 — Browser-Zurück zeigt diese Seite aus dem Client-Cache).
 */
export default async function PlanAnsicht({ params }: { params: Promise<{ id: string }> }) {
  requireKommplanHost(await headers());
  const viewer = await requireKommplanZugang();
  const { id } = await params;
  const plan = ladePlanOder404(getDb(), id);
  if (plan.inhalt && darfKommplanBearbeiten(viewer.groups)) {
    return (
      <Huelle>
        <div className={ARIMO.className}>
          <Editor key={plan.id} symbole={symboleFuer(plan.inhalt)} zeichenIndex={zeichenIndex()} schrift={ARIMO.style.fontFamily}
            plan={{ id: plan.id, version: plan.version, angaben: plan.angaben, inhalt: plan.inhalt, aktualisiertAm: plan.aktualisiertAm, aktualisiertVon: plan.aktualisiertVon }} />
        </div>
      </Huelle>
    );
  }
  return (
    <Huelle>
      <Seitenkopf
        titel={plan.titel}
        zurueck={{ titel: "Alle Pläne", href: "/" }}
        beschreibung={beschreibungFuer(plan)}
        aktionen={plan.inhalt ? <Link href={`/p/${plan.id}/druck/a4`} target="_blank">Drucken (A4 quer)</Link> : undefined}
      />
      {plan.inhalt ? (
        <div className={ARIMO.className}>
          <Betrachter inhalt={plan.inhalt} symbole={symboleFuer(plan.inhalt)} titel={plan.titel} schrift={ARIMO.style.fontFamily} />
        </div>
      ) : (
        <Card>Dieser Plan lässt sich nicht lesen: der gespeicherte Inhalt ist beschädigt. Ansehen, Bearbeiten und Drucken gehen erst wieder, wenn die Daten repariert sind.</Card>
      )}
    </Huelle>
  );
}
