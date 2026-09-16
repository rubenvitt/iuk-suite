import type { ReactNode } from "react";
import { Card, Empty } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { getDb, type DB } from "../../../_db/client";
import { ampelTon, fmtVerfall } from "../../../_lib/format";
import { lagerortVerfallListe, verfallListe } from "../../../_lib/lesepfade/verfall";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { AussondernRow } from "./AussondernRow";
import {
  FahrzeugVerfallTabelle,
  type FahrzeugVerfallZeile,
} from "./FahrzeugVerfallTabelle";
import { VerfallItem } from "./VerfallItem";

export const dynamic = "force-dynamic";

const GEMELDET_FORMAT = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * DIE BEIDEN HAELFTEN DIESER SEITE SIND VERSCHIEDEN GEBAUT, UND DAS IST DER
 * PUNKT — nicht ein liegengebliebener Umbau.
 *
 * OBEN, HANDLAGER: eine Kartenliste mit eigenem `ul`/`li`. Jede Zeile traegt
 * eine Plakette, ihre LIEGEPLAETZE im Handlager (DRK-339) und, wenn die Charge
 * abgelaufen ist, einen Aussondern-Knopf. Das ist eine ARBEITSLISTE: man geht
 * sie am Regal Zeile fuer Zeile durch und bucht. Eine Tabelle mit Filtern und
 * Sortierung waere hier nicht besser, sondern im Weg.
 *
 * ⚠️ UND SIE BLEIBT NACH DRINGLICHKEIT SORTIERT, NICHT NACH SCHRANK
 * (DRK-339, offene Frage „nach Schrank filterbar?"). Ein Schrankfilter waere
 * ein zweiter Zustand neben einer Liste, die ohnehin nur die auffaelligen
 * Chargen fuehrt — und er tauschte die Frage „was ist am dringendsten?" gegen
 * „was ist hier?". Solange jede Zeile ihren Ort NENNT und ihr Knopf genau
 * diesen Ort aussondern kann, ist „einen Schrank leerraeumen" ein Durchgang
 * durch dieselbe Liste. Wird sie einmal laenger als ein Schirm, ist das ein
 * eigenes Ticket, keine Ergaenzung hier.
 *
 * UNTEN, FAHRZEUGE: eine Tabelle (DRK-298). Hier gibt es NICHTS ZU BUCHEN — ein
 * Fahrzeugverfall ist eine Meldung, keine Charge, und `aussondern` bucht
 * ausschliesslich den Handlager-Rest. Was hier gebraucht wird, ist die Antwort
 * auf „was ist an DIESEM Fahrzeug faellig?", und dafuer braucht es einen
 * Fahrzeugfilter. Als flache Aufzaehlung standen die Meldungen eines Fahrzeugs
 * ueber die ganze Liste verstreut.
 *
 * ⚠️ WER DIE BEIDEN ANGLEICHT, VERLIERT EINE DER BEIDEN EIGENSCHAFTEN: oben
 * die Bedienbarkeit am Regal, unten die Antwort je Fahrzeug.
 *
 * ⚠️ „Liegt fuer dieses Fahrzeug nichts vor?" BEANTWORTET DIESE SEITE NICHT,
 * und zwar bewusst: `lagerortVerfallListe` liefert nur vorhandene Meldungen,
 * ein Fahrzeug ohne Meldung fehlt hier also einfach. Die Antwort steht in der
 * FAHRZEUGLISTE, wo jedes Fahrzeug eine Zeile hat und die Verfallsspalte
 * „im gruenen Bereich" von „nichts erfasst" unterscheidet. Eine zweite Liste
 * derselben Aussage hier waere die naheliegende Ergaenzung — und die beiden
 * liefen auseinander.
 */
export function verfallSeitenInhalt(db: DB, jetzt: Date): ReactNode {
  const chargen = verfallListe(db, jetzt);
  const gemeldet = lagerortVerfallListe(db, { nurWarnend: true }, jetzt);
  /**
   * ⚠️ DIE AMPEL WIRD HIER AUFGELOEST, NICHT IN DER INSEL. `ampelTon` liegt in
   * einem Modul ohne "use client" und entscheidet den Ton serverseitig; die
   * Client-Insel bekommt nur JSON-sichere Skalare. Ein `Ampel`-Wert ueber die
   * Grenze waere eine Client-Referenz statt eines Wertes (Falle 6).
   */
  const verfallZeilen: FahrzeugVerfallZeile[] = gemeldet.map((meldung) => ({
    schluessel: `${meldung.lagerortId}:${meldung.artikelId}`,
    fahrzeugId: meldung.lagerortId,
    fahrzeugName: meldung.lagerortName,
    fahrzeugKennung: meldung.lagerortKennung,
    fahrzeugEinheitenart: meldung.lagerortEinheitenart,
    artikelName: meldung.artikelName,
    verfall: meldung.verfall,
    verfallText: fmtVerfall(meldung.verfall),
    statusTon: ampelTon(meldung.ampel),
    statusText: meldung.text,
    abgelaufen: meldung.abgelaufen,
    gemeldetText: GEMELDET_FORMAT.format(meldung.erfasstAt),
  }));

  return (
    <>
      <SeitenKopf
        titel="Verfall"
        beschreibung="Chargen im Handlager nach Verfallsampel — und die an Fahrzeugen und Taschen gemeldeten Angaben."
      />

      <Card title="Chargen im Handlager" style={{ marginBlockEnd: SPACE.xl }}>
        {chargen.length === 0 ? (
          <Empty description="Keine auffällige Charge im Handlager." />
        ) : (
          <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {chargen.map((charge) => (
              <VerfallItem
                key={charge.chargeId}
                artikelName={charge.artikelName}
                chargenNr={charge.chargenNr}
                verfall={charge.verfall}
                ampel={charge.ampel}
                text={charge.text}
                rest={charge.rest}
                einheit={charge.einheit}
                orte={charge.orte}
                aktion={charge.abgelaufen ? (
                  <AussondernRow
                    chargeId={charge.chargeId}
                    bezeichnung={`${charge.chargenNr} · ${charge.artikelName}`}
                    orte={charge.orte}
                    einheit={charge.einheit}
                  />
                ) : undefined}
              />
            ))}
          </ul>
        )}
      </Card>

      {/* DRK-309: NEUTRAL — die Tabelle darunter führt Fahrzeuge UND Taschen. */}
      <Card title="An Fahrzeugen und Taschen gemeldet">
        {verfallZeilen.length === 0 ? (
          <Empty description="Keine auffällige Verfallsmeldung aus einer Einheit." />
        ) : (
          <FahrzeugVerfallTabelle zeilen={verfallZeilen} />
        )}
      </Card>
    </>
  );
}

export default function VerfallSeite() {
  return verfallSeitenInhalt(getDb(), new Date());
}
