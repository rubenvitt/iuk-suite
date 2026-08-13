"use client";

import { Table, type TableProps } from "antd";
import { SCHRIFT } from "../../../_lib/schrift";
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
  /** Der rohe Code/die rohe Kennung, NUR fuer den `title` des Chips (Ruling
   *  A15) — die Alt-Anwendung fuehrte das als `title={j.quelleId}`
   *  (`lagerbuch/src/app/verwaltung/(admin)/journal/page.tsx:62`). */
  quelleId: string;
};

const SPALTEN: TableProps<JournalAnzeigeZeile>["columns"] = [
  {
    title: <span style={SCHRIFT.feldname}>Zeit</span>,
    dataIndex: "zeitText",
    key: "zeit",
    render: (zeitText: string) => <span className={s.jts}>{zeitText}</span>,
  },
  {
    title: <span style={SCHRIFT.feldname}>Artikel</span>,
    dataIndex: "artikelName",
    key: "artikel",
    render: (artikelName: string) => (
      <span style={{ fontWeight: 600 }}>{artikelName}</span>
    ),
  },
  { title: <span style={SCHRIFT.feldname}>Vorgang</span>, dataIndex: "vorgangText", key: "vorgang" },
  {
    title: <span style={SCHRIFT.feldname}>Δ</span>,
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
    title: <span style={SCHRIFT.feldname}>Quelle</span>,
    dataIndex: "quelleName",
    key: "quelle",
    render: (quelleName: string, zeile) => (
      <Chip ton="grau" title={zeile.quelleId}>
        {quelleName}
      </Chip>
    ),
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
