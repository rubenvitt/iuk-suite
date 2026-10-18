import type { ReactNode } from "react";
import { Card, Empty } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { getDb, type DB } from "../../../_db/client";
import { ampelTon, fmtVerfall } from "../../../_lib/format";
import { lagerortVerfallListe, verfallListe } from "../../../_lib/lesepfade/verfall";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import {
  HandlagerVerfallTabelle,
  type HandlagerVerfallZeile,
} from "./HandlagerVerfallTabelle";
import {
  OrtVerfallTabelle,
  type OrtVerfallZeile,
} from "./OrtVerfallTabelle";
import { zeitFormat } from "@/core/zeit";

export const dynamic = "force-dynamic";

const GEMELDET_FORMAT = zeitFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * DIE BEIDEN HAELFTEN DIESER SEITE SIND VERSCHIEDEN GEBAUT, UND DAS IST DER
 * PUNKT — nicht ein liegengebliebener Umbau.
 *
 * OBEN, HANDLAGER: eine ARBEITSLISTE, an der gebucht wird. Seit IDA-238 eine
 * Tabelle (vorher `ul`/`li`) mit Suche, Statusfilter und Auswahl: abgelaufene
 * Chargen lassen sich gemeinsam aussondern, mit EINER Rueckfrage, die alle
 * nennt. Jede Zeile nennt weiter ihre LIEGEPLAETZE (DRK-339), und bei mehreren
 * Liegeplaetzen kann ihr Einzelknopf genau einen Schrank ausraeumen. Begruendung des
 * Wechsels im Kopf von `HandlagerVerfallTabelle.tsx`.
 *
 * ⚠️ UND SIE BLEIBT NACH DRINGLICHKEIT SORTIERT, NICHT NACH SCHRANK
 * (DRK-339, offene Frage „nach Schrank filterbar?"). Ein Schrankfilter
 * tauschte die Frage „was ist am dringendsten?" gegen „was ist hier?"; die
 * Suche findet einen Schrank trotzdem, weil sie die Liegeplaetze mitliest.
 *
 * UNTEN, FAHRZEUGE: eine Tabelle (DRK-298). Hier gibt es NICHTS ZU BUCHEN — ein
 * Fahrzeugverfall ist eine Meldung, keine Charge, und `aussondern` bucht
 * ausschliesslich den Handlager-Rest. Was hier gebraucht wird, ist die Antwort
 * auf „was ist an DIESEM Fahrzeug faellig?", und dafuer braucht es einen
 * Fahrzeugfilter. Als flache Aufzaehlung standen die Meldungen eines Fahrzeugs
 * ueber die ganze Liste verstreut.
 *
 * ⚠️ ES BLEIBEN ZWEI TABELLEN, NICHT EINE: oben wird gebucht, unten nur
 * gemeldet. Wer sie zusammenlegt, setzt Aussondern-Knoepfe an Meldungen, die
 * `aussondern` reproduzierbar abweist.
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
  const verfallZeilen: OrtVerfallZeile[] = gemeldet.map((meldung) => ({
    schluessel: `${meldung.lagerortId}:${meldung.artikelId}`,
    ortId: meldung.lagerortId,
    ortName: meldung.lagerortName,
    ortKennung: meldung.lagerortKennung,
    ortTyp: meldung.lagerortTyp,
    ortEinheitenart: meldung.lagerortEinheitenart,
    artikelName: meldung.artikelName,
    verfall: meldung.verfall,
    verfallText: fmtVerfall(meldung.verfall),
    statusTon: ampelTon(meldung.ampel),
    statusText: meldung.text,
    abgelaufen: meldung.abgelaufen,
    gemeldetText: GEMELDET_FORMAT.format(meldung.erfasstAt),
  }));

  const chargenZeilen: HandlagerVerfallZeile[] = chargen.map((charge) => ({
    chargeId: charge.chargeId,
    chargenNr: charge.chargenNr,
    artikelName: charge.artikelName,
    verfall: charge.verfall,
    verfallText: fmtVerfall(charge.verfall),
    statusTon: ampelTon(charge.ampel),
    statusText: charge.text,
    abgelaufen: charge.abgelaufen,
    rest: charge.rest,
    einheit: charge.einheit,
    orte: charge.orte,
  }));

  return (
    <>
      <SeitenKopf
        titel="Verfall"
        beschreibung="Chargen im Handlager nach Verfallsampel — und die an Einheiten und in der Entnahmebox gemeldeten Angaben."
      />

      <Card title="Chargen im Handlager" style={{ marginBlockEnd: SPACE.lg }}>
        {chargen.length === 0 ? (
          <Empty description="Keine auffällige Charge im Handlager." />
        ) : (
          <HandlagerVerfallTabelle zeilen={chargenZeilen} />
        )}
      </Card>

      {/*
        DRK-309: NEUTRAL — die Tabelle darunter führt Fahrzeuge UND Taschen.
        DRK-377: und seit die Kompensationszeile nicht mehr ans Soll gebunden
        ist, auch die Entnahmebox. Ein Verfall, der mit dem Material aus einer
        Einheit in die Kiste gewandert ist, stand bis dahin nirgends auf dieser
        Seite — abgelaufenes Material in der Kiste ist aber genau das, was
        jemand wegräumen muss.
      */}
      <Card title="An Einheiten und in der Entnahmebox gemeldet">
        {verfallZeilen.length === 0 ? (
          <Empty description="Keine auffällige Verfallsmeldung." />
        ) : (
          <OrtVerfallTabelle zeilen={verfallZeilen} />
        )}
      </Card>
    </>
  );
}

export default function VerfallSeite() {
  return verfallSeitenInhalt(getDb(), new Date());
}
