"use client";

import { useMemo } from "react";
import { Card, type TableProps } from "antd";
import {
  Datentabelle,
  nachDatum,
  nachRang,
  nachText,
  nachZahl,
  trifftWert,
  werteAlsFilter,
  Zellentext,
  zustandsFilter,
} from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import type { AmpelTon } from "../../../../_lib/format";
import { SCHRIFT } from "../../../../_lib/schrift";
import { Chip } from "../../../../_ui/Chip";
import type { IkonName } from "../../../../_ui/ikonen";

export type DetailChipAnzeige = {
  text: string;
  ton: AmpelTon;
  zeichen: IkonName | null;
};

export type AbgleichAnzeigeZeile = {
  id: string;
  artikel: string;
  sollText: string;
  istText: string;
  korrekturText: string;
  nachgefuelltText: string;
  /**
   * Die vier Zahlen und die Offen-Menge als Zahl — allein fuer die Sortierung.
   * ⚠️ Die `…Text`-Felder sind `String(…)` und ordneten als Zeichenkette „10"
   * vor „2"; die Begruendung steht an der Zeilenquelle (`page.tsx`).
   */
  sollZahl: number;
  istZahl: number;
  korrekturZahl: number;
  nachgefuelltZahl: number;
  offenZahl: number;
  offenChip: DetailChipAnzeige;
};

export type NachfuellAnzeigeZeile = {
  id: string;
  fachText: string;
  artikelText: string;
  einheitText: string;
  sollText: string;
  istText: string;
  /** Rohzahlen fuer die Sortierung, s. `AbgleichAnzeigeZeile`. */
  sollZahl: number;
  istZahl: number;
  lueckeZahl: number;
  lueckeChip: DetailChipAnzeige;
};

export type GeraetAnzeigeZeile = {
  id: string;
  name: string;
  vorhandenChip: DetailChipAnzeige;
  zustandChip: DetailChipAnzeige;
  bemerkungText: string;
};

export type FlascheAnzeigeZeile = {
  id: string;
  name: string;
  druck: {
    darstellung: "chip" | "mono";
    text: string;
    ton: AmpelTon | null;
  };
  /** Der Druck als Zahl — allein fuer die Sortierung, `null` heisst ungemessen. */
  druckZahl: number | null;
  fuellstandChip: DetailChipAnzeige;
};

export type VerfallAnzeigeZeile = {
  id: string;
  artikel: string;
  /** „YYYY-MM" — Anzeige UND Sortierschluessel zugleich, deshalb ohne Rohfeld. */
  verfallText: string;
  statusChip: DetailChipAnzeige;
};

export type CheckDetailTabellenProps = {
  abgleichZeilen: AbgleichAnzeigeZeile[];
  nachfuellZeilen: NachfuellAnzeigeZeile[];
  geraeteZeilen: GeraetAnzeigeZeile[];
  flaschenZeilen: FlascheAnzeigeZeile[];
  verfallZeilen: VerfallAnzeigeZeile[];
  nachfuellLeertext: string;
  /**
   * §11.5 Zustand 27: ist das `ergebnis` unlesbar, ersetzt dieser EINE Satz die
   * Leertexte ALLER fuenf Tabellen — auch `nachfuellLeertext`.
   *
   * ⚠️ WARUM EIN PROP UND NICHT FUENF. Es ist EINE Ursache. Jeder Vorgabetext
   * unten BEHAUPTET etwas („Keine Geraete in diesem Check."); bei zerstoertem
   * Ergebnis hat das niemand geprueft, und die Tabellen widersprechen sonst der
   * Warnung ueber ihnen. Fuenf getrennte Props laden dazu ein, den Satz spaeter
   * an vier Stellen zu pflegen und an einer zu vergessen.
   */
  /**
   * ⛔ EIN ERSATZ FUER ALLE FUENF LEERTEXTE, gespeist von ZWEI Ursachen: einem
   * unlesbaren Ergebnis (§11.5, Zustand 27) und einem laufenden Check (DRK-196).
   * Beide Male ist jeder Vorgabetext eine TATSACHENBEHAUPTUNG („Keine Geraete in
   * diesem Check“), die niemand geprueft hat — und die der Meldung ueber den
   * Tabellen widerspraeche.
   *
   * ⚠️ ER HIESS BIS ZUM CODEX-REVIEW ZU PR #210 `unlesbarLeertext`, also nach
   * EINER der beiden Ursachen. Ein Name, der eine von zwei Ursachen nennt, laedt
   * dazu ein, fuer die zweite einen zweiten Weg zu bauen.
   */
  ersatzLeertext?: string | null;
};

/**
 * Die Ampel ist die fachliche Ordnung dieser Chips — weder alphabetisch noch
 * numerisch. Rot zuerst: was Aufmerksamkeit verlangt, gehoert nach oben.
 */
const AMPEL_RANG = ["rot", "gelb", "grau", "ok"] as const;

function AnzeigeChip({ chip }: { chip: DetailChipAnzeige }) {
  return (
    <Chip ton={chip.ton} zeichen={chip.zeichen ?? undefined}>
      {chip.text}
    </Chip>
  );
}

const OFFEN_FILTER = zustandsFilter<AbgleichAnzeigeZeile>([
  { wert: "offen", text: "fehlt weiterhin", trifft: (zeile) => zeile.offenZahl > 0 },
  { wert: "vollstaendig", text: "vollständig", trifft: (zeile) => zeile.offenZahl === 0 },
]);

const LUECKE_FILTER = zustandsFilter<NachfuellAnzeigeZeile>([
  { wert: "luecke", text: "Lücke", trifft: (zeile) => zeile.lueckeZahl > 0 },
  { wert: "vollstaendig", text: "vollständig", trifft: (zeile) => zeile.lueckeZahl === 0 },
]);

const ABGLEICH_SPALTEN: TableProps<AbgleichAnzeigeZeile>["columns"] = [
  {
    title: "Artikel",
    dataIndex: "artikel",
    key: "artikel",
    sorter: nachText<AbgleichAnzeigeZeile>((zeile) => zeile.artikel),
  },
  {
    title: "Soll",
    dataIndex: "sollText",
    key: "soll",
    align: "right",
    sorter: nachZahl<AbgleichAnzeigeZeile>((zeile) => zeile.sollZahl),
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
  {
    title: "Gezählt",
    dataIndex: "istText",
    key: "ist",
    align: "right",
    sorter: nachZahl<AbgleichAnzeigeZeile>((zeile) => zeile.istZahl),
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
  {
    title: "Korrigiert",
    dataIndex: "korrekturText",
    key: "korrektur",
    align: "right",
    sorter: nachZahl<AbgleichAnzeigeZeile>((zeile) => zeile.korrekturZahl),
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
  {
    title: "Nachgefüllt",
    dataIndex: "nachgefuelltText",
    key: "nachgefuellt",
    align: "right",
    sorter: nachZahl<AbgleichAnzeigeZeile>((zeile) => zeile.nachgefuelltZahl),
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
  {
    title: "Offen",
    dataIndex: "offenChip",
    key: "offen",
    sorter: nachZahl<AbgleichAnzeigeZeile>((zeile) => zeile.offenZahl),
    filters: OFFEN_FILTER.filters,
    onFilter: OFFEN_FILTER.onFilter,
    render: (offenChip: DetailChipAnzeige) => <AnzeigeChip chip={offenChip} />,
  },
];

const NACHFUELL_SPALTEN: TableProps<NachfuellAnzeigeZeile>["columns"] = [
  {
    title: "Fach",
    dataIndex: "fachText",
    key: "fach",
    sorter: nachText<NachfuellAnzeigeZeile>((zeile) => zeile.fachText),
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
  {
    title: "Artikel",
    dataIndex: "artikelText",
    key: "artikel",
    sorter: nachText<NachfuellAnzeigeZeile>((zeile) => zeile.artikelText),
    render: (text: string, zeile: NachfuellAnzeigeZeile) => (
      <>
        {text}{" "}
        <span style={SCHRIFT.neben}>{zeile.einheitText}</span>
      </>
    ),
  },
  {
    title: "Soll",
    dataIndex: "sollText",
    key: "soll",
    align: "right",
    sorter: nachZahl<NachfuellAnzeigeZeile>((zeile) => zeile.sollZahl),
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
  {
    title: "Gezählt",
    dataIndex: "istText",
    key: "ist",
    align: "right",
    sorter: nachZahl<NachfuellAnzeigeZeile>((zeile) => zeile.istZahl),
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
  {
    title: "Lücke im Fach",
    dataIndex: "lueckeChip",
    key: "luecke",
    sorter: nachZahl<NachfuellAnzeigeZeile>((zeile) => zeile.lueckeZahl),
    filters: LUECKE_FILTER.filters,
    onFilter: LUECKE_FILTER.onFilter,
    render: (lueckeChip: DetailChipAnzeige) => <AnzeigeChip chip={lueckeChip} />,
  },
];

function geraeteSpalten(
  zeilen: GeraetAnzeigeZeile[],
): TableProps<GeraetAnzeigeZeile>["columns"] {
  return [
    {
      title: "Gerät",
      dataIndex: "name",
      key: "name",
      sorter: nachText<GeraetAnzeigeZeile>((zeile) => zeile.name),
    },
    {
      title: "Vorhanden",
      dataIndex: "vorhandenChip",
      key: "vorhanden",
      sorter: nachRang<GeraetAnzeigeZeile, AmpelTon>(
        (zeile) => zeile.vorhandenChip.ton,
        AMPEL_RANG,
      ),
      filters: werteAlsFilter(zeilen, (zeile) => zeile.vorhandenChip.text),
      onFilter: trifftWert<GeraetAnzeigeZeile>((zeile) => zeile.vorhandenChip.text),
      render: (vorhandenChip: DetailChipAnzeige) => <AnzeigeChip chip={vorhandenChip} />,
    },
    {
      title: "Zustand",
      dataIndex: "zustandChip",
      key: "zustand",
      sorter: nachRang<GeraetAnzeigeZeile, AmpelTon>(
        (zeile) => zeile.zustandChip.ton,
        AMPEL_RANG,
      ),
      filters: werteAlsFilter(zeilen, (zeile) => zeile.zustandChip.text),
      onFilter: trifftWert<GeraetAnzeigeZeile>((zeile) => zeile.zustandChip.text),
      render: (zustandChip: DetailChipAnzeige) => <AnzeigeChip chip={zustandChip} />,
    },
    {
      /*
       * ⚠️ EINE BREITE (DRK-372). Die Bemerkung einer Geraetepruefung ist
       * Freitext ohne Laengengrenze, die Tabelle faehrt `scroll.x:
       * "max-content"` — EIN langer Satz macht sie beliebig breit, und das
       * Symptom fuehrt in die Irre: die Zeile sieht richtig aus, sie steht nur
       * sehr weit rechts. Ohne `zeilen`, weil dieses Blatt der Nachweis ist.
       */
      title: "Bemerkung",
      dataIndex: "bemerkungText",
      key: "bemerkung",
      render: (text: string) => (
        <Zellentext text={text} style={SCHRIFT.neben} />
      ),
    },
  ];
}

const FLASCHEN_SPALTEN: TableProps<FlascheAnzeigeZeile>["columns"] = [
  {
    title: "Flasche",
    dataIndex: "name",
    key: "name",
    sorter: nachText<FlascheAnzeigeZeile>((zeile) => zeile.name),
  },
  {
    title: "Druck",
    dataIndex: "druck",
    key: "druck",
    align: "right",
    sorter: nachZahl<FlascheAnzeigeZeile>((zeile) => zeile.druckZahl),
    render: (druck: FlascheAnzeigeZeile["druck"]) => druck.darstellung === "chip"
      ? <Chip ton={druck.ton ?? "grau"}>{druck.text}</Chip>
      : <span style={SCHRIFT.mono}>{druck.text}</span>,
  },
  {
    title: "Füllstand",
    dataIndex: "fuellstandChip",
    key: "fuellstand",
    sorter: nachRang<FlascheAnzeigeZeile, AmpelTon>(
      (zeile) => zeile.fuellstandChip.ton,
      AMPEL_RANG,
    ),
    render: (fuellstandChip: DetailChipAnzeige) => (
      <AnzeigeChip chip={fuellstandChip} />
    ),
  },
];

function verfallSpalten(
  zeilen: VerfallAnzeigeZeile[],
): TableProps<VerfallAnzeigeZeile>["columns"] {
  return [
    {
      title: "Artikel",
      dataIndex: "artikel",
      key: "artikel",
      sorter: nachText<VerfallAnzeigeZeile>((zeile) => zeile.artikel),
    },
    {
      title: "Verfall",
      dataIndex: "verfallText",
      key: "verfall",
      // „YYYY-MM" ordnet als Zeichenkette bereits richtig — deshalb hier
      // ausnahmsweise dasselbe Feld fuer Anzeige und Sortierung.
      sorter: nachDatum<VerfallAnzeigeZeile>((zeile) => zeile.verfallText),
      defaultSortOrder: "ascend",
      render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
    },
    {
      title: "Status",
      dataIndex: "statusChip",
      key: "status",
      sorter: nachRang<VerfallAnzeigeZeile, AmpelTon>(
        (zeile) => zeile.statusChip.ton,
        AMPEL_RANG,
      ),
      filters: werteAlsFilter(zeilen, (zeile) => zeile.statusChip.text),
      onFilter: trifftWert<VerfallAnzeigeZeile>((zeile) => zeile.statusChip.text),
      render: (statusChip: DetailChipAnzeige) => <AnzeigeChip chip={statusChip} />,
    },
  ];
}

export function CheckDetailTabellen({
  abgleichZeilen,
  nachfuellZeilen,
  geraeteZeilen,
  flaschenZeilen,
  verfallZeilen,
  nachfuellLeertext,
  ersatzLeertext,
}: CheckDetailTabellenProps) {
  // ZWEI Ursachen speisen ihn (unlesbar, laufend), deshalb heisst er nach seiner
  // ROLLE und nicht nach einer von beiden: er schlaegt JEDEN Vorgabetext.
  const leertext = (vorgabe: string) => ersatzLeertext ?? vorgabe;
  // Zwei Spaltenlisten entstehen aus den Daten (die Filterwerte); ohne `useMemo`
  // baute jedes Rendern eine neue und zwaenge die Tabelle zur Neuberechnung.
  const geraeteListe = useMemo(() => geraeteSpalten(geraeteZeilen), [geraeteZeilen]);
  const verfallListe = useMemo(() => verfallSpalten(verfallZeilen), [verfallZeilen]);

  return (
    <>
      <Card title="Abgleich" style={{ marginBlockEnd: SPACE.lg }}>
        <Datentabelle<AbgleichAnzeigeZeile>
          rowKey="id"
          aria-label="Abgleich"
          locale={{ emptyText: leertext("Keine Positionen erfasst.") }}
          dataSource={abgleichZeilen}
          columns={ABGLEICH_SPALTEN}
        />
      </Card>
      <Card title="Nachfüllung (je Fach)" style={{ marginBlockEnd: SPACE.lg }}>
        <Datentabelle<NachfuellAnzeigeZeile>
          rowKey="id"
          aria-label="Nachfüllung je Fach"
          locale={{ emptyText: leertext(nachfuellLeertext) }}
          dataSource={nachfuellZeilen}
          columns={NACHFUELL_SPALTEN}
        />
      </Card>
      <Card title="Geräte" style={{ marginBlockEnd: SPACE.lg }}>
        <Datentabelle<GeraetAnzeigeZeile>
          rowKey="id"
          aria-label="Geräte im Check"
          locale={{ emptyText: leertext("Keine Geräte in diesem Check.") }}
          dataSource={geraeteZeilen}
          columns={geraeteListe}
        />
      </Card>
      <Card title="Sauerstoff" style={{ marginBlockEnd: SPACE.lg }}>
        <Datentabelle<FlascheAnzeigeZeile>
          rowKey="id"
          aria-label="Sauerstoff im Check"
          locale={{ emptyText: leertext("Keine Flaschen in diesem Check.") }}
          dataSource={flaschenZeilen}
          columns={FLASCHEN_SPALTEN}
        />
      </Card>
      <Card title="Verfall (gegen heute gerechnet)">
        <Datentabelle<VerfallAnzeigeZeile>
          rowKey="id"
          aria-label="Verfallsmeldungen des Checks"
          locale={{ emptyText: leertext("Keine Verfallsangabe in diesem Check.") }}
          dataSource={verfallZeilen}
          columns={verfallListe}
        />
      </Card>
    </>
  );
}
