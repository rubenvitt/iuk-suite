"use client";

import { Table, type TableProps } from "antd";
import { SCHRIFT } from "../../../../_lib/schrift";
import { Chip } from "../../../../_ui/Chip";
import s from "../../../../_ui/verwaltung.module.css";

export type VerlaufAnzeigeZeile = {
  id: string;
  zeitpunktText: string;
  druckBar: number;
  herkunft: "check" | "manuell";
  werText: string;
  kommentarText: string | null;
};

const VERLAUF_SPALTEN = [
  {
    title: <span style={SCHRIFT.feldname}>Zeitpunkt</span>,
    dataIndex: "zeitpunktText",
    key: "zeitpunkt",
    render: (text: string) => <span className={s.jts}>{text}</span>,
  },
  {
    title: <span style={SCHRIFT.feldname}>Druck</span>,
    dataIndex: "druckBar",
    key: "druck",
    align: "right",
    render: (wert: number) => <span style={SCHRIFT.mono}>{wert} bar</span>,
  },
  {
    title: <span style={SCHRIFT.feldname}>Herkunft</span>,
    dataIndex: "herkunft",
    key: "herkunft",
    render: (wert: VerlaufAnzeigeZeile["herkunft"]) => (
      <Chip ton="grau">{wert === "check" ? "aus Check" : "manuell"}</Chip>
    ),
  },
  {
    title: <span style={SCHRIFT.feldname}>Wer</span>,
    dataIndex: "werText",
    key: "wer",
    render: (text: string) => <Chip ton="grau">{text}</Chip>,
  },
  {
    title: <span style={SCHRIFT.feldname}>Kommentar</span>,
    dataIndex: "kommentarText",
    key: "kommentar",
    render: (text: string | null) => (
      text ?? <span style={SCHRIFT.neben}>—</span>
    ),
  },
] satisfies TableProps<VerlaufAnzeigeZeile>["columns"];

export function VerlaufTabelle({ zeilen }: { zeilen: VerlaufAnzeigeZeile[] }) {
  return (
    <Table<VerlaufAnzeigeZeile>
      rowKey="id"
      pagination={false}
      scroll={{ x: "max-content" }}
      aria-label="Messungsverlauf"
      locale={{ emptyText: "Für diese Flasche wurde noch keine Messung erfasst." }}
      dataSource={zeilen}
      columns={VERLAUF_SPALTEN}
    />
  );
}
