"use client";

import type { TableProps } from "antd";
import Link from "next/link";
import { Datentabelle, nachJaNein, nachText, zustandsFilter } from "@/core/tabelle";
import { Chip } from "../../../../_ui/Chip";

export type VerknuepftesFahrzeugDto = {
  id: string;
  name: string;
  kennung: string | null;
  aktiv: boolean;
};

const STATUS_FILTER = zustandsFilter<VerknuepftesFahrzeugDto>([
  { wert: "aktiv", text: "aktiv", trifft: (zeile) => zeile.aktiv },
  { wert: "inaktiv", text: "inaktiv", trifft: (zeile) => !zeile.aktiv },
]);

const SPALTEN: TableProps<VerknuepftesFahrzeugDto>["columns"] = [
  {
    title: "Fahrzeug",
    dataIndex: "name",
    key: "fahrzeug",
    sorter: nachText<VerknuepftesFahrzeugDto>((zeile) => zeile.name),
    render: (name: string, fahrzeug) => (
      <Link href={`/verwaltung/fahrzeuge/${fahrzeug.id}`}>
        {name}{fahrzeug.kennung ? ` (${fahrzeug.kennung})` : ""}
      </Link>
    ),
  },
  {
    title: "Status",
    dataIndex: "aktiv",
    key: "status",
    // Die Zelle ist leer, solange das Fahrzeug aktiv ist — sortiert und
    // gefiltert wird deshalb ueber das Feld, nicht ueber das Gerenderte.
    sorter: nachJaNein<VerknuepftesFahrzeugDto>((zeile) => zeile.aktiv),
    filters: STATUS_FILTER.filters,
    onFilter: STATUS_FILTER.onFilter,
    render: (aktiv: boolean) => aktiv ? null : <Chip ton="grau">inaktiv</Chip>,
  },
];

export function VerknuepfteFahrzeugeTable({
  zeilen,
}: {
  zeilen: VerknuepftesFahrzeugDto[];
}) {
  return (
    <Datentabelle<VerknuepftesFahrzeugDto>
      rowKey="id"
      aria-label="Verknüpfte Fahrzeuge"
      dataSource={zeilen}
      locale={{ emptyText: "Kein Fahrzeug nutzt diese Vorlage." }}
      columns={SPALTEN}
    />
  );
}
