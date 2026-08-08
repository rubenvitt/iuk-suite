import type { ReactNode } from "react";
import { getDb, type DB } from "../../../_db/client";
import { templateUebersicht } from "../../../_lib/lesepfade/fahrzeuge";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { NeuTemplate } from "./NeuTemplate";
import { TemplateTable, type TemplateAnzeigeZeile } from "./TemplateTable";

export const dynamic = "force-dynamic";

function anzahlText(anzahl: number, singular: string, plural: string): string {
  return `${anzahl} ${anzahl === 1 ? singular : plural}`;
}

function templateAnzeigeZeilen(db: DB): TemplateAnzeigeZeile[] {
  return templateUebersicht(db).map((zeile) => ({
    id: zeile.id,
    name: zeile.name,
    detailHref: `/verwaltung/vorlagen/${zeile.id}`,
    inaktiv: !zeile.aktiv,
    bestueckungText: `${anzahlText(zeile.positionen, "Position", "Positionen")}${
      zeile.faecher > 0
        ? ` · ${anzahlText(zeile.faecher, "Fach", "Fächer")}`
        : ""
    }`,
    fahrzeugeText: anzahlText(zeile.fahrzeuge, "Fahrzeug", "Fahrzeuge"),
  }));
}

export function vorlagenInhalt(db: DB): ReactNode {
  return (
    <>
      <SeitenKopf
        titel="Vorlagen"
        beschreibung="Bestückung einmal definieren und auf mehrere identisch gepackte Fahrzeuge übertragen. Pro Fahrzeug bleiben manuelle Abweichungen möglich."
        aktionen={<NeuTemplate />}
      />
      <TemplateTable zeilen={templateAnzeigeZeilen(db)} />
    </>
  );
}

export default function VorlagenSeite() {
  return vorlagenInhalt(getDb());
}
