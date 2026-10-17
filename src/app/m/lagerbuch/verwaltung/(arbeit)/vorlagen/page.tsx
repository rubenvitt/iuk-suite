import type { ReactNode } from "react";
import { getDb, type DB } from "../../../_db/client";
import { templateUebersicht } from "../../../_lib/lesepfade/fahrzeuge";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { NeuTemplate } from "./NeuTemplate";
import { TemplateTable, type TemplateAnzeigeZeile } from "./TemplateTable";
import { verwaltungDetailPfad } from "../../../_lib/verwaltungPfad";
import { qrSvg } from "@/core/qr";
import { moduleUrl } from "@/core/shell/moduleUrl";
import { DEMO_PFAD } from "../../../_lib/demoCheck";
import { demoCheckDaten, demoEinstellungLesen } from "../../../_lib/lesepfade/demo";
import { templateListeAktiv } from "../../../_lib/lesepfade/fahrzeuge";
import { DemoCheckKarte } from "./DemoCheckKarte";

export const dynamic = "force-dynamic";

function anzahlText(anzahl: number, singular: string, plural: string): string {
  return `${anzahl} ${anzahl === 1 ? singular : plural}`;
}

function templateAnzeigeZeilen(db: DB): TemplateAnzeigeZeile[] {
  return templateUebersicht(db).map((zeile) => ({
    id: zeile.id,
    name: zeile.name,
    detailHref: verwaltungDetailPfad("vorlagen", zeile.id),
    inaktiv: !zeile.aktiv,
    bestueckungText: `${anzahlText(zeile.positionen, "Position", "Positionen")}${
      zeile.faecher > 0
        ? ` · ${anzahlText(zeile.faecher, "Fach", "Fächer")}`
        : ""
    }`,
    // Die Rohzahlen reisen mit, weil die Spalten danach sortieren: der
    // Anzeigetext beginnt mit der Zahl und ordnete als Zeichenkette „12" vor „2".
    positionenZahl: zeile.positionen,
    fahrzeugeText: anzahlText(zeile.fahrzeuge, "Einheit", "Einheiten"),
    fahrzeugeZahl: zeile.fahrzeuge,
  }));
}

/** IDA-224: die oeffentliche Adresse des Demo-Checks, aus derselben Quelle wie die Etiketten (`moduleUrl`). */
function demoAdresse(): { url: string; absolut: boolean } {
  const basis = moduleUrl("lagerbuch");
  return basis ? { url: `${basis.replace(/\/$/, "")}${DEMO_PFAD}`, absolut: true } : { url: DEMO_PFAD, absolut: false };
}

export function vorlagenInhalt(db: DB, demoQr: string | null = null): ReactNode {
  const demo = demoEinstellungLesen(db);
  return (
    <>
      <SeitenKopf
        titel="Vorlagen"
        beschreibung="Bestückung einmal definieren und auf mehrere identisch gepackte Einheiten übertragen. Pro Einheit bleiben manuelle Abweichungen möglich."
        aktionen={<NeuTemplate />}
      />
      <TemplateTable zeilen={templateAnzeigeZeilen(db)} />
      <DemoCheckKarte
        // „Eingeschaltet" nur, wenn /demo auch wirklich antwortet — eine danach
        // deaktivierte oder geleerte Vorlage schaltet die Demo still ab.
        aktiv={demoCheckDaten(db) !== null}
        templateId={demo.templateId}
        vorlagen={templateListeAktiv(db)}
        adresse={demoAdresse().url}
        qr={demoQr}
      />
    </>
  );
}

export default async function VorlagenSeite() {
  const adresse = demoAdresse();
  return vorlagenInhalt(getDb(), adresse.absolut ? await qrSvg(adresse.url) : null);
}
