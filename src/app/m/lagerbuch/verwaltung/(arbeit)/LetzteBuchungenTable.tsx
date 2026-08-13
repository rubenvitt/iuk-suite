"use client";

import { Empty, Table, type TableProps } from "antd";
import { SCHRIFT } from "../../_lib/schrift";
import s from "../../_ui/verwaltung.module.css";

export type UebersichtJournalZeile = {
  id: string;
  zeitText: string;
  artikelName: string;
  vorgangText: string;
  deltaText: string;
  deltaTon: "negativ" | "positiv" | "neutral";
};

// Spaltenkoepfe tragen die Kicker-Rolle ueber `title`, nie ueber CSS gegen
// `.ant-table-thead` (docs/design/README.md, „Spaltenkoepfe einer antd-Table").
const SPALTEN: TableProps<UebersichtJournalZeile>["columns"] = [
  {
    title: <span style={SCHRIFT.feldname}>Zeit</span>,
    dataIndex: "zeitText",
    key: "zeit",
    render: (zeitText: string) => <span className={s.jts}>{zeitText}</span>,
  },
  { title: <span style={SCHRIFT.feldname}>Artikel</span>, dataIndex: "artikelName", key: "artikel" },
  { title: <span style={SCHRIFT.feldname}>Vorgang</span>, dataIndex: "vorgangText", key: "vorgang" },
  {
    title: <span style={SCHRIFT.feldname}>Δ</span>,
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
    // Punkt 5 der Pruefliste: der Leerzustand nennt, woher Buchungen kommen,
    // statt nur "nichts da" zu sagen.
    return (
      <Empty
        description="Noch keine Buchungen. Buchungen entstehen beim Ein- und Auslagern im Artikelbestand."
      />
    );
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
