import { headers } from "next/headers";
import Link from "next/link";
import { Card } from "antd";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "@/app/m/kommplan/_db/client";
import { ladeBibliothek } from "@/app/m/kommplan/_lib/bibliothekDb";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { leseEditorAnsicht } from "@/app/m/kommplan/_lib/editorAnsicht";
import { archivTag, beschreibungFuer, ladePlanLesendOder404 } from "@/app/m/kommplan/_lib/plaene";
import { kalendertag } from "@/app/m/kommplan/_lib/rahmen";
import { kopieHinweis } from "@/app/m/kommplan/_lib/tagesfassung";
import { symboleFuer, zeichenIndex } from "@/app/m/kommplan/_lib/zeichen/zeichen";
import { darfKommplanBearbeiten, requireKommplanZugang } from "@/app/m/kommplan/_lib/zugang";
import { Betrachter } from "@/app/m/kommplan/_ui/betrachter/Betrachter";
import { Editor } from "@/app/m/kommplan/_ui/editor/Editor";
import { Huelle } from "@/app/m/kommplan/_ui/Huelle";
import { ARIMO } from "@/app/m/kommplan/_ui/schrift";
import { Wiederherstellen } from "./Wiederherstellen";

export const dynamic = "force-dynamic";

/**
 * Editor für Bearbeitende (`isModuleAdmin`), Betrachter für die Zugangsgruppe (Spec §6.1) —
 * dasselbe Prädikat, das jede Server Action des Editors prüft. `key={plan.id}`: der Editor sät
 * seinen Zustand einmal aus den Props und prüft beim Montieren den Serverstand (Umsetzungsplan
 * Phase 2, Entscheidung 21 — Browser-Zurück zeigt diese Seite aus dem Client-Cache).
 * `?ansicht=` wählt die Ansicht des Editors (Phase 3, Entscheidung 1); der Betrachter kennt nur das Diagramm.
 */
export default async function PlanAnsicht({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  requireKommplanHost(await headers());
  const viewer = await requireKommplanZugang();
  const { id } = await params;
  const plan = ladePlanLesendOder404(getDb(), id);
  const darf = darfKommplanBearbeiten(viewer.groups);
  // Archiviert ist nur lesbar (Phase 4, Entscheidung 10): Betrachter mit Hinweis, auch für Bearbeitende.
  if (plan.archiviertAm === null && plan.inhalt && darf) {
    const suche = await searchParams;
    const ansicht = leseEditorAnsicht(suche.ansicht);
    const kopie = kopieHinweis(typeof suche.kopie === "string" ? suche.kopie : undefined, kalendertag(plan.datum) ?? "heute");
    return (
      <Huelle>
        {/* Kein Arimo-Container um den Editor: Kopfleiste, Status und Hinweise stehen in der Suite-Schrift
            wie im Betrachter-Zweig; die Zeichnung setzt ihre Familie selbst, die Legende bekommt die Klasse. */}
        <Editor key={plan.id} symbole={symboleFuer(plan.inhalt)} zeichenIndex={zeichenIndex()} schrift={ARIMO.style.fontFamily} schriftKlasse={ARIMO.className} ansicht={ansicht} kopieHinweis={kopie} bibliothek={ladeBibliothek(getDb())}
          plan={{ id: plan.id, version: plan.version, angaben: plan.angaben, inhalt: plan.inhalt, aktualisiertAm: plan.aktualisiertAm, aktualisiertVon: plan.aktualisiertVon }} />
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
      {plan.archiviertAm !== null ? (
        <Card className="kp-archivhinweis" role="status" style={{ marginBlockEnd: 12 }} styles={{ body: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" } }}>
          {`Archiviert am ${archivTag(plan.archiviertAm)} — nur lesbar.`}
          {darf ? <Wiederherstellen id={plan.id} /> : null}
        </Card>
      ) : null}
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
