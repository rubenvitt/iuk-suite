"use client";

import Link from "next/link";
import { Table, type TableProps } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";

export type TemplateAnzeigeZeile = {
  id: string;
  name: string;
  detailHref: string;
  inaktiv: boolean;
  bestueckungText: string;
  fahrzeugeText: string;
};

const SPALTEN: TableProps<TemplateAnzeigeZeile>["columns"] = [
  {
    title: <span style={SCHRIFT.feldname}>Vorlage</span>,
    dataIndex: "name",
    render: (name: string, zeile) => (
      <span>
        <Link href={zeile.detailHref} style={{ fontWeight: 600 }}>
          {name}
        </Link>
        {zeile.inaktiv ? (
          <span style={{ marginInlineStart: SPACE.sm }}>
            <Chip ton="grau">inaktiv</Chip>
          </span>
        ) : null}
      </span>
    ),
  },
  {
    title: <span style={SCHRIFT.feldname}>Bestückung</span>,
    dataIndex: "bestueckungText",
    render: (text: string) => <span style={SCHRIFT.neben}>{text}</span>,
  },
  {
    title: <span style={SCHRIFT.feldname}>Fahrzeuge</span>,
    dataIndex: "fahrzeugeText",
    render: (text: string) => (
      <Chip ton="grau" zeichen="fahrzeug">{text}</Chip>
    ),
  },
];

export function TemplateTable({ zeilen }: { zeilen: TemplateAnzeigeZeile[] }) {
  return (
    <Table<TemplateAnzeigeZeile>
      rowKey="id"
      pagination={false}
      scroll={{ x: "max-content" }}
      aria-label="Vorlagen"
      dataSource={zeilen}
      locale={{
        emptyText: "Noch keine Vorlagen. Lege oben die erste an — oder erstelle eine Vorlage direkt aus einem gepackten Fahrzeug.",
      }}
      columns={SPALTEN}
    />
  );
}
