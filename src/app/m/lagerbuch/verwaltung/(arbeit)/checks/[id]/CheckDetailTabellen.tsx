"use client";

import { Card, Table, type TableProps } from "antd";
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
  offenChip: DetailChipAnzeige;
};

export type NachfuellAnzeigeZeile = {
  id: string;
  fachText: string;
  artikelText: string;
  einheitText: string;
  sollText: string;
  istText: string;
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
  fuellstandChip: DetailChipAnzeige;
};

export type VerfallAnzeigeZeile = {
  id: string;
  artikel: string;
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
  unlesbarLeertext?: string | null;
};

function AnzeigeChip({ chip }: { chip: DetailChipAnzeige }) {
  return (
    <Chip ton={chip.ton} zeichen={chip.zeichen ?? undefined}>
      {chip.text}
    </Chip>
  );
}

const ABGLEICH_SPALTEN = [
  { title: <span style={SCHRIFT.feldname}>Artikel</span>, dataIndex: "artikel", key: "artikel" },
  {
    title: <span style={SCHRIFT.feldname}>Soll</span>,
    dataIndex: "sollText",
    key: "soll",
    align: "right" as const,
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
  {
    title: <span style={SCHRIFT.feldname}>Gezählt</span>,
    dataIndex: "istText",
    key: "ist",
    align: "right" as const,
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
  {
    title: <span style={SCHRIFT.feldname}>Korrigiert</span>,
    dataIndex: "korrekturText",
    key: "korrektur",
    align: "right" as const,
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
  {
    title: <span style={SCHRIFT.feldname}>Nachgefüllt</span>,
    dataIndex: "nachgefuelltText",
    key: "nachgefuellt",
    align: "right" as const,
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
  {
    title: <span style={SCHRIFT.feldname}>Offen</span>,
    dataIndex: "offenChip",
    key: "offen",
    render: (offenChip: DetailChipAnzeige) => <AnzeigeChip chip={offenChip} />,
  },
] satisfies TableProps<AbgleichAnzeigeZeile>["columns"];

const NACHFUELL_SPALTEN = [
  {
    title: <span style={SCHRIFT.feldname}>Fach</span>,
    dataIndex: "fachText",
    key: "fach",
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
  {
    title: <span style={SCHRIFT.feldname}>Artikel</span>,
    dataIndex: "artikelText",
    key: "artikel",
    render: (text: string, zeile: NachfuellAnzeigeZeile) => (
      <>
        {text}{" "}
        <span style={SCHRIFT.neben}>{zeile.einheitText}</span>
      </>
    ),
  },
  {
    title: <span style={SCHRIFT.feldname}>Soll</span>,
    dataIndex: "sollText",
    key: "soll",
    align: "right" as const,
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
  {
    title: <span style={SCHRIFT.feldname}>Gezählt</span>,
    dataIndex: "istText",
    key: "ist",
    align: "right" as const,
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
  {
    title: <span style={SCHRIFT.feldname}>Lücke im Fach</span>,
    dataIndex: "lueckeChip",
    key: "luecke",
    render: (lueckeChip: DetailChipAnzeige) => <AnzeigeChip chip={lueckeChip} />,
  },
] satisfies TableProps<NachfuellAnzeigeZeile>["columns"];

const GERAETE_SPALTEN = [
  { title: <span style={SCHRIFT.feldname}>Gerät</span>, dataIndex: "name", key: "name" },
  {
    title: <span style={SCHRIFT.feldname}>Vorhanden</span>,
    dataIndex: "vorhandenChip",
    key: "vorhanden",
    render: (vorhandenChip: DetailChipAnzeige) => <AnzeigeChip chip={vorhandenChip} />,
  },
  {
    title: <span style={SCHRIFT.feldname}>Zustand</span>,
    dataIndex: "zustandChip",
    key: "zustand",
    render: (zustandChip: DetailChipAnzeige) => <AnzeigeChip chip={zustandChip} />,
  },
  {
    title: <span style={SCHRIFT.feldname}>Bemerkung</span>,
    dataIndex: "bemerkungText",
    key: "bemerkung",
    render: (text: string) => <span style={SCHRIFT.neben}>{text}</span>,
  },
] satisfies TableProps<GeraetAnzeigeZeile>["columns"];

const FLASCHEN_SPALTEN = [
  { title: <span style={SCHRIFT.feldname}>Flasche</span>, dataIndex: "name", key: "name" },
  {
    title: <span style={SCHRIFT.feldname}>Druck</span>,
    dataIndex: "druck",
    key: "druck",
    align: "right" as const,
    render: (druck: FlascheAnzeigeZeile["druck"]) => druck.darstellung === "chip"
      ? <Chip ton={druck.ton ?? "grau"}>{druck.text}</Chip>
      : <span style={SCHRIFT.mono}>{druck.text}</span>,
  },
  {
    title: <span style={SCHRIFT.feldname}>Füllstand</span>,
    dataIndex: "fuellstandChip",
    key: "fuellstand",
    render: (fuellstandChip: DetailChipAnzeige) => (
      <AnzeigeChip chip={fuellstandChip} />
    ),
  },
] satisfies TableProps<FlascheAnzeigeZeile>["columns"];

const VERFALL_SPALTEN = [
  { title: <span style={SCHRIFT.feldname}>Artikel</span>, dataIndex: "artikel", key: "artikel" },
  {
    title: <span style={SCHRIFT.feldname}>Verfall</span>,
    dataIndex: "verfallText",
    key: "verfall",
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
  {
    title: <span style={SCHRIFT.feldname}>Status</span>,
    dataIndex: "statusChip",
    key: "status",
    render: (statusChip: DetailChipAnzeige) => <AnzeigeChip chip={statusChip} />,
  },
] satisfies TableProps<VerfallAnzeigeZeile>["columns"];

export function CheckDetailTabellen({
  abgleichZeilen,
  nachfuellZeilen,
  geraeteZeilen,
  flaschenZeilen,
  verfallZeilen,
  nachfuellLeertext,
  unlesbarLeertext,
}: CheckDetailTabellenProps) {
  // Ein unlesbares Ergebnis schlaegt JEDEN Vorgabetext — siehe `unlesbarLeertext`.
  const leertext = (vorgabe: string) => unlesbarLeertext ?? vorgabe;
  return (
    <>
      <Card title="Abgleich" style={{ marginBlockEnd: SPACE.lg }}>
        <Table<AbgleichAnzeigeZeile>
          rowKey="id"
          pagination={false}
          scroll={{ x: "max-content" }}
          aria-label="Abgleich"
          locale={{ emptyText: leertext("Keine Positionen erfasst.") }}
          dataSource={abgleichZeilen}
          columns={ABGLEICH_SPALTEN}
        />
      </Card>
      <Card title="Nachfüllung (je Fach)" style={{ marginBlockEnd: SPACE.lg }}>
        <Table<NachfuellAnzeigeZeile>
          rowKey="id"
          pagination={false}
          scroll={{ x: "max-content" }}
          aria-label="Nachfüllung je Fach"
          locale={{ emptyText: leertext(nachfuellLeertext) }}
          dataSource={nachfuellZeilen}
          columns={NACHFUELL_SPALTEN}
        />
      </Card>
      <Card title="Geräte" style={{ marginBlockEnd: SPACE.lg }}>
        <Table<GeraetAnzeigeZeile>
          rowKey="id"
          pagination={false}
          scroll={{ x: "max-content" }}
          aria-label="Geräte im Check"
          locale={{ emptyText: leertext("Keine Geräte in diesem Check.") }}
          dataSource={geraeteZeilen}
          columns={GERAETE_SPALTEN}
        />
      </Card>
      <Card title="Sauerstoff" style={{ marginBlockEnd: SPACE.lg }}>
        <Table<FlascheAnzeigeZeile>
          rowKey="id"
          pagination={false}
          scroll={{ x: "max-content" }}
          aria-label="Sauerstoff im Check"
          locale={{ emptyText: leertext("Keine Flaschen in diesem Check.") }}
          dataSource={flaschenZeilen}
          columns={FLASCHEN_SPALTEN}
        />
      </Card>
      <Card title="Verfall (gegen heute gerechnet)">
        <Table<VerfallAnzeigeZeile>
          rowKey="id"
          pagination={false}
          scroll={{ x: "max-content" }}
          aria-label="Verfallsmeldungen des Checks"
          locale={{ emptyText: leertext("Keine Verfallsangabe in diesem Check.") }}
          dataSource={verfallZeilen}
          columns={VERFALL_SPALTEN}
        />
      </Card>
    </>
  );
}
