"use client";

import { useState } from "react";
import { Alert, DatePicker, type TableProps } from "antd";
import {
  Datentabelle,
  nachDatum,
  nachRang,
  nachText,
  trifftWert,
  werteAlsFilter,
} from "@/core/tabelle";
import dayjs from "dayjs";
import { SPACE } from "@/core/theme/tokens";
import { verfallSetzen } from "../../../../_actions/lagerortVerfall";
import type { AmpelTon } from "../../../../_lib/format";
import type { ChargeZeile } from "../../../../_lib/lesepfade/artikel";
import { inDerEinheit, type Einheitenart } from "../../../../_lib/konstanten";
import { AussondernDialog } from "./AussondernDialog";
import { RuecklaufDialog, type RuecklaufZiel } from "./RuecklaufDialog";
import { Chip } from "../../../../_ui/Chip";
import { monatAusPicker } from "../../../../_ui/monat";
import { useVerfallStand } from "./useVerfallStand";

const VERFALL_FEHLER = "Verfall konnte nicht gespeichert werden.";

/** Rot vor gelb vor ok: was Aufmerksamkeit verlangt, gehoert nach oben. */
const AMPEL_RANG = ["rot", "gelb", "grau", "ok"] as const;

export type VerfallAnzeigeZeile = {
  artikelId: string;
  artikelName: string;
  fachText: string;
  verfall: string | null;
  statusTon: AmpelTon | null;
  statusText: string | null;
  /** Bestand des Artikels AN DIESEM Lagerort — die Obergrenze des Aussonderns. */
  bestand: number;
  einheit: string;
  /** Chargen mit Rest AN DIESEM Lagerort, FEFO sortiert. Leer ist zulässig:
   *  am Fahrzeug ist die Charge oft geraten (§5.3.3), die Auswahl daher optional. */
  chargen: ChargeZeile[];
};

export function VerfallEditor({
  lagerortId,
  eintraege,
  einheitenart,
  ruecklaufZiele,
}: {
  lagerortId: string;
  eintraege: VerfallAnzeigeZeile[];
  /** DRK-366 — wohin der Rücklauf bucht: Handlager-Wurzel plus aktive Schränke. */
  ruecklaufZiele: RuecklaufZiel[];
  /**
   * DRK-309 — die Tabelle heisst nach der Art der Einheit, deren Verfall sie
   * zeigt. ⚠️ Fuer ein Fahrzeug bleibt der Name WORTGLEICH („Verfall im
   * Fahrzeug"); art-bewusst heisst hier nicht „anders", sondern „richtig,
   * sobald es keins ist".
   */
  einheitenart: Einheitenart | null;
}) {
  /**
   * ⚠️ DER EINE STAND (DRK-345). Beide Schreibwege dieser Tabelle laufen durch
   * `schreibe`, und nur dort faellt ein Wert in den Stand — naemlich der, den
   * die Antwort meldet. Die Entscheidung dahinter steht in
   * `_lib/verfallStand.ts`, die Mechanik in `useVerfallStand.ts`; hier gibt es
   * bewusst keinen Setzer mehr, den eine zweite Stelle bedienen koennte.
   */
  const { verfallVon, schreibe, laeuft } = useVerfallStand();
  const [fehler, setFehler] = useState<string | null>(null);

  async function monatSetzen(
    eintrag: VerfallAnzeigeZeile,
    wert: Parameters<typeof monatAusPicker>[0],
  ) {
    const monat = monatAusPicker(wert) ?? "";
    // DER GEWAEHLTE MONAT BLEIBT AUCH IM FEHLERFALL STEHEN — absichtlich, und
    // `VerfallEditor.test.tsx` haelt es fest. Die Eingabe einer Person zu
    // verwerfen, weil das Speichern scheiterte, ist schlimmer als die
    // Statusspalte, die bis zum naechsten Laden den alten Stand nennt. Den
    // Widerspruch aufloest der Fehlersatz, nicht das Zuruecksetzen. Getragen
    // wird die Zusage von `standNachAntwort`, das nur bei `ok` schreibt.
    try {
      const ergebnis = await schreibe(
        eintrag.artikelId,
        // Die Vorwegnahme — ohne sie spraenge das Feld bis zur Antwort zurueck.
        monat || null,
        () => verfallSetzen({
          lagerortId,
          artikelId: eintrag.artikelId,
          verfall: monat,
        }),
      );
      // Der Satz aus der Action statt der Modulkonstante: nur er
      // unterscheidet „Artikel steht an diesem Lagerort nicht im Soll." von
      // einem Schreibfehler. Im `catch` bleibt die Konstante — dort ist
      // `e.message` in Produktion Framework-Englisch.
      setFehler(ergebnis.ok ? null : ergebnis.fehler);
    } catch {
      setFehler(VERFALL_FEHLER);
    }
  }

  const spalten: TableProps<VerfallAnzeigeZeile>["columns"] = [
    {
      title: "Artikel",
      dataIndex: "artikelName",
      key: "artikel",
      sorter: nachText<VerfallAnzeigeZeile>((eintrag) => eintrag.artikelName),
      render: (name: string) => <strong>{name}</strong>,
    },
    {
      title: "Fach",
      dataIndex: "fachText",
      key: "fach",
      sorter: nachText<VerfallAnzeigeZeile>((eintrag) => eintrag.fachText),
      filters: werteAlsFilter(eintraege, (eintrag) => eintrag.fachText),
      onFilter: trifftWert<VerfallAnzeigeZeile>((eintrag) => eintrag.fachText),
    },
    {
      title: "Verfall",
      dataIndex: "verfall",
      key: "verfall",
      // ⚠️ SORTIERT WIRD UEBER DAS FELD, NICHT UEBER DEN MONATSWAEHLER.
      // `verfall` ist „YYYY-MM" und ordnet als Zeichenkette bereits richtig;
      // der `DatePicker` in der Zelle traegt gar keinen vergleichbaren Wert.
      // Der Spiegel bleibt aussen vor: sortiert wird der gespeicherte Stand,
      // sonst sprang die Zeile waehrend des Tippens weg.
      sorter: nachDatum<VerfallAnzeigeZeile>((eintrag) => eintrag.verfall),
      render: (_verfall: string | null, eintrag) => {
        const monat = verfallVon(eintrag);
        return (
          // KEIN size="small": die alte Zeilenaktions-Ausnahme (Falle 4,
          // docs/design/README.md) ist mit der Arbeitsdichte gefallen -- 44px
          // ist hier bereits die volle wie die halbe Bediendichte, "small"
          // unterbietet die Mindesttapflaeche (WCAG 2.5.5).
          <DatePicker
            picker="month"
            format="YYYY-MM"
            allowClear
            disabled={laeuft}
            value={monat ? dayjs(`${monat}-01`) : null}
            onChange={(wert) => monatSetzen(eintrag, wert)}
            aria-label={`Verfall ${eintrag.artikelName}`}
          />
        );
      },
    },
    {
      title: "Status",
      dataIndex: "statusText",
      key: "status",
      sorter: nachRang<VerfallAnzeigeZeile, AmpelTon>(
        (eintrag) => eintrag.statusTon ?? "grau",
        AMPEL_RANG,
      ),
      filters: werteAlsFilter(
        eintraege,
        (eintrag) => eintrag.statusText ?? "nicht erfasst",
      ),
      onFilter: trifftWert<VerfallAnzeigeZeile>(
        (eintrag) => eintrag.statusText ?? "nicht erfasst",
      ),
      render: (statusText: string | null, eintrag) => statusText && eintrag.statusTon ? (
        <Chip ton={eintrag.statusTon}>{statusText}</Chip>
      ) : (
        <Chip ton="grau">nicht erfasst</Chip>
      ),
    },
    {
      // ⚠️ DIE FUENFTE SPALTE MACHT DIE TABELLE BREITER ALS JEDEN TELEFONSCHIRM
      // — gemessen 891px Inhalt in einem 308px breiten Kasten bei 390px
      // Fensterbreite. Das ist in Ordnung und war es nicht immer: solange die
      // Tabelle in einer impliziten `auto`-Spalte hing, verbreiterte diese Zahl
      // die SEITE (DRK-322, 357px Ueberlauf bei 390px). Seit dem `minmax(0, 1fr)`
      // unten scrollt sie in sich, und die Spalte kostet nichts mehr.
      //
      // Sie steht hier und nicht anderswo: „das ist abgelaufen" und „das kommt
      // raus" sind derselbe Handgriff, und eine Aktion zwei Flaechen entfernt vom
      // Befund wird nicht benutzt. Eine zu breite Tabelle ist an der Breite zu
      // loesen, nicht durch Weglassen der Aktion.
      title: "Aktion",
      key: "aussondern",
      render: (_wert: unknown, eintrag) => (
        // DRK-366: der Rücklauf steht daneben, weil er dieselbe Frage
        // beantwortet — was verlässt die Einheit? — nur ohne zu vernichten.
        <div style={{ display: "flex", flexWrap: "wrap", gap: SPACE.sm }}>
        <AussondernDialog
          lagerortId={lagerortId}
          artikelId={eintrag.artikelId}
          artikelName={eintrag.artikelName}
          einheit={eintrag.einheit}
          bestand={eintrag.bestand}
          chargen={eintrag.chargen}
          // ⚠️ `verfallVon` UND NICHT `eintrag.verfall` — derselbe Zugriff, den
          // der Waehler daneben nutzt, aus derselben Funktion. `monatSetzen`
          // traegt einen gewaehlten Monat SOFORT in den Stand und schickt ihn
          // erst danach zum Server; bis die Auffrischung zurueck ist, ist die
          // Prop der AELTERE Stand. Mit ihr stuende im Dialog der alte Monat,
          // und eine Teilaussonderung schriebe ihn ueber den gerade
          // gespeicherten zurueck.
          verfall={verfallVon(eintrag)}
          // DRK-309: dieselbe Art wie die Kopfzeile und die Überschrift
          // darüber — der Hinweis im Dialog sagt, wo die verbleibenden
          // Packungen liegen.
          einheitenart={einheitenart}
          // Dieselbe Sperre wie am Monatswähler oben, und jetzt aus derselben
          // Quelle: `laeuft` ist wahr, solange EINER der beiden Wege schreibt.
          gesperrt={laeuft}
          /*
           * Der zweite Schreibweg auf demselben Wert — und er bekommt keinen
           * eigenen Rueckkanal, sondern denselben Trichter. KEINE Vorwegnahme
           * (`undefined`): der Dialog kennt sein Ergebnis nicht, ob die Angabe
           * entfaellt, entscheidet die Transaktion am verbleibenden Bestand.
           */
          schreibe={(aktion) => schreibe(eintrag.artikelId, undefined, aktion)}
        />
        <RuecklaufDialog
          fahrzeugId={lagerortId}
          artikelId={eintrag.artikelId}
          artikelName={eintrag.artikelName}
          einheit={eintrag.einheit}
          chargen={eintrag.chargen}
          ziele={ruecklaufZiele}
          einheitenart={einheitenart}
          gesperrt={laeuft}
          // Derselbe Trichter wie beim Aussondern und aus demselben Grund: ob
          // die Verfallsangabe fällt, entscheidet die Transaktion.
          schreibe={(aktion) => schreibe(eintrag.artikelId, undefined, aktion)}
        />
        </div>
      ),
    },
  ];

  return (
    /**
     * ⚠️ `minmax(0, 1fr)` STATT DER IMPLIZITEN `auto`-SPALTE — dieselbe Falle,
     * die `SollEditor` eine Tuer weiter schon kennt (DRK-315), hier nur nie
     * behoben. Eine `auto`-Spalte waechst auf die MINDESTBREITE ihres Inhalts,
     * und die ist bei einer Tabelle die Summe der Spalten-Mindestbreiten; das
     * `scroll.x` der `Datentabelle` kommt dann gar nicht zum Zug, weil nichts
     * zu eng wird. Gemessen auf dem Fahrzeugblatt: bei 375px lief das Dokument
     * um 210px waagerecht ueber, bei 480px um 105px.
     *
     * ⚠️ KEIN GATE SIEHT DAS. `typecheck` prueft eine gueltige CSS-Zeichenkette,
     * `build` serialisiert sie klaglos, und Vitest kann es strukturell nicht
     * sehen — jsdom rechnet keine Layoutboxen (Falle 13). Nur ein echter
     * Browser kennt die Zahl; `e2e/lagerbuch-fahrzeugblatt-mobil.spec.ts` misst
     * sie.
     */
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr)",
      gap: SPACE.md,
    }}>
      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
      <Datentabelle<VerfallAnzeigeZeile>
        rowKey="artikelId"
        aria-label={`Verfall ${inDerEinheit(einheitenart)}`}
        dataSource={eintraege}
        locale={{
          emptyText: "Keine aktive Soll-Position. Verfall wird je Soll-Artikel gepflegt.",
        }}
        columns={spalten}
      />
    </div>
  );
}
