"use client";

import { Table, type TableProps } from "antd";
import { SCHRIFT } from "../../../../../_lib/schrift";
import { Chip } from "../../../../../_ui/Chip";

/**
 * DRK-299 — die Positionen EINES Inventurlaufs. Eigene Client-Insel wegen
 * `columns[].render` (Falle 9); die Seite reicht nur Primitive herein.
 *
 * `artikelText` ist ab der zweiten Chargenzeile desselben Artikels LEER — die
 * Gruppierung entsteht serverseitig, ohne zweites Tabellenkonstrukt.
 */
export type LaufZeile = {
  id: string;
  artikelText: string;
  chargeText: string;
  erwartetText: string;
  gezaehltText: string;
  /** `gezaehlt − erwartet`, abgeleitet, nicht gespeichert. */
  differenz: number;
};

export type LaufTabelleProps = { zeilen: LaufZeile[] };

const SPALTEN = [
  {
    title: <span style={SCHRIFT.feldname}>Artikel</span>,
    dataIndex: "artikelText",
    key: "artikel",
    render: (text: string) => <span style={{ fontWeight: 600 }}>{text}</span>,
  },
  {
    title: <span style={SCHRIFT.feldname}>Charge</span>,
    dataIndex: "chargeText",
    key: "charge",
  },
  {
    title: <span style={SCHRIFT.feldname}>Erwartet</span>,
    dataIndex: "erwartetText",
    key: "erwartet",
    align: "right" as const,
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
  {
    title: <span style={SCHRIFT.feldname}>Gezählt</span>,
    dataIndex: "gezaehltText",
    key: "gezaehlt",
    align: "right" as const,
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
  {
    title: <span style={SCHRIFT.feldname}>Differenz</span>,
    dataIndex: "differenz",
    key: "differenz",
    // ⚠️ NIE rot (Falle 3) — auch nicht bei Fehlmenge. Die Differenz ist gebucht.
    render: (differenz: number) => (differenz === 0
      ? <Chip ton="ok">stimmt</Chip>
      : <Chip ton="gelb">{differenz > 0 ? `+${differenz}` : `${differenz}`}</Chip>),
  },
] satisfies TableProps<LaufZeile>["columns"];

export function LaufTabelle({ zeilen }: LaufTabelleProps) {
  return (
    <Table<LaufZeile>
      rowKey="id"
      pagination={false}
      scroll={{ x: "max-content" }}
      aria-label="Gezählte Positionen"
      dataSource={zeilen}
      locale={{ emptyText: "Dieser Lauf enthält keine Position." }}
      columns={SPALTEN}
    />
  );
}
