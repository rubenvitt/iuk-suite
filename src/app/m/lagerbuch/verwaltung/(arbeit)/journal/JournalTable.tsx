"use client";

import { Table, type TableProps } from "antd";
import { Chip } from "../../../_ui/Chip";
import s from "../../../_ui/verwaltung.module.css";

export type JournalAnzeigeZeile = {
  id: string;
  zeitText: string;
  artikelName: string;
  vorgangText: string;
  deltaText: string;
  deltaTon: "negativ" | "positiv";
  quelleName: string;
};

const SPALTEN: TableProps<JournalAnzeigeZeile>["columns"] = [
  {
    title: "Zeit",
    dataIndex: "zeitText",
    key: "zeit",
    render: (zeitText: string) => <span className={s.jts}>{zeitText}</span>,
  },
  {
    title: "Artikel",
    dataIndex: "artikelName",
    key: "artikel",
    render: (artikelName: string) => (
      <span style={{ fontWeight: 600 }}>{artikelName}</span>
    ),
  },
  { title: "Vorgang", dataIndex: "vorgangText", key: "vorgang" },
  {
    title: "Δ",
    dataIndex: "deltaText",
    key: "delta",
    align: "right",
    render: (deltaText: string, zeile) => (
      <span
        className={`${s.jdelta} ${
          zeile.deltaTon === "negativ" ? s.jminus : s.jplus
        }`}
      >
        {deltaText}
      </span>
    ),
  },
  {
    title: "Quelle",
    dataIndex: "quelleName",
    key: "quelle",
    render: (quelleName: string) => <Chip ton="grau">{quelleName}</Chip>,
  },
];

export function JournalTable({ zeilen, leertext }: {
  zeilen: JournalAnzeigeZeile[];
  leertext: string;
}) {
  return (
    <Table<JournalAnzeigeZeile>
      rowKey="id"
      pagination={false}
      scroll={{ x: "max-content" }}
      aria-label="Buchungsjournal"
      dataSource={zeilen}
      locale={{ emptyText: leertext }}
      columns={SPALTEN}
    />
  );
}
