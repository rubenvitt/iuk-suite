import { headers } from "next/headers";
import { moduleUrl } from "@/core/shell/moduleUrl";
import { Card } from "antd";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "@/app/m/kommplan/_db/client";
import { ladeBibliothek } from "@/app/m/kommplan/_lib/bibliothekDb";
import { freigabenFuer } from "@/app/m/kommplan/_lib/freigaben";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { leseEditorAnsicht } from "@/app/m/kommplan/_lib/editorAnsicht";
import { mitgliederVon } from "@/app/m/kommplan/_lib/mitglieder";
import { archivTag, beschreibungFuer, ladePlanFuerOder404 } from "@/app/m/kommplan/_lib/plaene";
import { kalendertag } from "@/app/m/kommplan/_lib/rahmen";
import { kopieHinweis } from "@/app/m/kommplan/_lib/tagesfassung";
import { symboleFuer, zeichenIndex } from "@/app/m/kommplan/_lib/zeichen/zeichen";
import { darfKommplanBearbeiten, personAus, requireKommplanZugang } from "@/app/m/kommplan/_lib/zugang";
import { ExportKnopf } from "@/app/m/kommplan/_ui/austausch/ExportKnopf";
import { Betrachter } from "@/app/m/kommplan/_ui/betrachter/Betrachter";
import { DruckMenue } from "@/app/m/kommplan/_ui/druck/DruckMenue";
import { Editor } from "@/app/m/kommplan/_ui/editor/Editor";
import { Huelle } from "@/app/m/kommplan/_ui/Huelle";
import { ARIMO } from "@/app/m/kommplan/_ui/schrift";
import { Wiederherstellen } from "./Wiederherstellen";

export const dynamic = "force-dynamic";

/**
 * Editor für wer den Plan bearbeiten darf, Betrachter für alle anderen, die ihn sehen (`_lib/rechte.ts`) —
 * dasselbe Prädikat, das jede Server Action des Editors prüft. Teilen nur für wer ihn verwaltet. `key={plan.id}`: der Editor sät
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
  const { plan, rechte } = ladePlanFuerOder404(getDb(), id, personAus(viewer));
  // Archiviert ist nur lesbar (Phase 4, Entscheidung 10): Betrachter mit Hinweis, auch für Bearbeitende.
  if (plan.archiviertAm === null && plan.inhalt && rechte.bearbeiten) {
    const suche = await searchParams;
    const ansicht = leseEditorAnsicht(suche.ansicht);
    const kopie = kopieHinweis(typeof suche.kopie === "string" ? suche.kopie : undefined, kalendertag(plan.datum) ?? "heute");
    return (
      <Huelle>
        {/* Kein Arimo-Container um den Editor: Kopfleiste, Status und Hinweise stehen in der Suite-Schrift
            wie im Betrachter-Zweig; die Zeichnung setzt ihre Familie selbst, die Legende bekommt die Klasse. */}
        <Editor key={plan.id} symbole={symboleFuer(plan.inhalt)} zeichenIndex={zeichenIndex()} schrift={ARIMO.style.fontFamily} schriftKlasse={ARIMO.className} ansicht={ansicht} kopieHinweis={kopie} bibliothek={ladeBibliothek(getDb())}
          bibliothekPflegen={darfKommplanBearbeiten(viewer.groups)}
          teilen={rechte.verwalten ? {
            freigaben: freigabenFuer(getDb(), plan.id, new Date().getTime()), basis: moduleUrl("kommplan"),
            sichtbarkeit: plan.sichtbarkeit, mitglieder: mitgliederVon(getDb(), plan.id),
          } : undefined}
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
        aktionen={plan.inhalt ? <div className="kp-kopfaktionen"><DruckMenue basis={`/p/${plan.id}`} mitSvg /><ExportKnopf planId={plan.id} /></div> : undefined}
      />
      {plan.archiviertAm !== null ? (
        <Card className="kp-archivhinweis" role="status" style={{ marginBlockEnd: 12 }} styles={{ body: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" } }}>
          {`Archiviert am ${archivTag(plan.archiviertAm)} — nur lesbar.`}
          {rechte.verwalten ? <Wiederherstellen id={plan.id} /> : null}
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
