"use client";

import { Empty, Table, type TableProps } from "antd";
import s from "../../_ui/verwaltung.module.css";

export type UebersichtJournalZeile = {
  id: string;
  zeitText: string;
  artikelName: string;
  vorgangText: string;
  deltaText: string;
  deltaTon: "negativ" | "positiv" | "neutral";
};

const SPALTEN: TableProps<UebersichtJournalZeile>["columns"] = [
  {
    title: "Zeit",
    dataIndex: "zeitText",
    key: "zeit",
    render: (zeitText: string) => <span className={s.jts}>{zeitText}</span>,
  },
  { title: "Artikel", dataIndex: "artikelName", key: "artikel" },
  { title: "Vorgang", dataIndex: "vorgangText", key: "vorgang" },
  {
    title: "Δ",
    dataIndex: "deltaText",
    key: "menge",
    align: "right",
    render: (deltaText: string, zeile) => {
      const zustandKlasse = zeile.deltaTon === "negativ"
        ? s.jminus
        : zeile.deltaTon === "positiv"
          ? s.jplus
          : undefined;
      return (
        <span className={[s.jdelta, zustandKlasse].filter(Boolean).join(" ")}>
          {deltaText}
        </span>
      );
    },
  },
];

export function LetzteBuchungenTable({ zeilen }: {
  zeilen: UebersichtJournalZeile[];
}) {
  if (zeilen.length === 0) {
    return <Empty description="Noch keine Buchungen." />;
  }

  return (
    <Table<UebersichtJournalZeile>
      rowKey="id"
      pagination={false}
      scroll={{ x: "max-content" }}
      aria-label="Letzte Buchungen"
      dataSource={zeilen}
      columns={SPALTEN}
    />
  );
}
