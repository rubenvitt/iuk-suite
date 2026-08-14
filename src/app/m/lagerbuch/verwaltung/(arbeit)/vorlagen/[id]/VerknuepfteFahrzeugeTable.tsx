"use client";

import { Table, type TableProps } from "antd";
import Link from "next/link";
import { SCHRIFT } from "../../../../_lib/schrift";
import { Chip } from "../../../../_ui/Chip";

export type VerknuepftesFahrzeugDto = {
  id: string;
  name: string;
  kennung: string | null;
  aktiv: boolean;
};

const SPALTEN: TableProps<VerknuepftesFahrzeugDto>["columns"] = [
  {
    title: <span style={SCHRIFT.feldname}>Fahrzeug</span>,
    dataIndex: "name",
    key: "fahrzeug",
    render: (name: string, fahrzeug) => (
      <Link href={`/verwaltung/fahrzeuge/${fahrzeug.id}`}>
        {name}{fahrzeug.kennung ? ` (${fahrzeug.kennung})` : ""}
      </Link>
    ),
  },
  {
    title: <span style={SCHRIFT.feldname}>Status</span>,
    dataIndex: "aktiv",
    key: "status",
    render: (aktiv: boolean) => aktiv ? null : <Chip ton="grau">inaktiv</Chip>,
  },
];

export function VerknuepfteFahrzeugeTable({
  zeilen,
}: {
  zeilen: VerknuepftesFahrzeugDto[];
}) {
  return (
    <Table<VerknuepftesFahrzeugDto>
      rowKey="id"
      pagination={false}
      scroll={{ x: "max-content" }}
      aria-label="Verknüpfte Fahrzeuge"
      dataSource={zeilen}
      locale={{ emptyText: "Kein Fahrzeug nutzt diese Vorlage." }}
      columns={SPALTEN}
    />
  );
}
