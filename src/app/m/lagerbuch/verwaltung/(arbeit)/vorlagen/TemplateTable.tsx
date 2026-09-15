"use client";

import Link from "next/link";
import type { TableProps } from "antd";
import {
  Datentabelle,
  nachText,
  nachZahl,
  zustandsFilter,
} from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";

export type TemplateAnzeigeZeile = {
  id: string;
  name: string;
  detailHref: string;
  inaktiv: boolean;
  bestueckungText: string;
  /**
   * Die Positionszahl als Zahl — allein fuer die Sortierung, angezeigt wird
   * `bestueckungText`. ⚠️ Ueber „12 Positionen · 3 Faecher" zu sortieren, ordnete
   * als Zeichenkette „12" vor „2"; die Spalte laege dann still falsch.
   */
  positionenZahl: number;
  fahrzeugeText: string;
  /** Dieselbe Trennung wie `positionenZahl`, fuer „3 Fahrzeuge". */
  fahrzeugeZahl: number;
};

/** Der Zustand steckt im Chip der Namensspalte, nicht in einem eigenen Feld. */
const STATUS_FILTER = zustandsFilter<TemplateAnzeigeZeile>([
  { wert: "aktiv", text: "aktiv", trifft: (zeile) => !zeile.inaktiv },
  { wert: "inaktiv", text: "inaktiv", trifft: (zeile) => zeile.inaktiv },
]);

const SPALTEN: TableProps<TemplateAnzeigeZeile>["columns"] = [
  {
    title: "Vorlage",
    dataIndex: "name",
    sorter: nachText<TemplateAnzeigeZeile>((zeile) => zeile.name),
    filters: STATUS_FILTER.filters,
    onFilter: STATUS_FILTER.onFilter,
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
    title: "Bestückung",
    dataIndex: "bestueckungText",
    sorter: nachZahl<TemplateAnzeigeZeile>((zeile) => zeile.positionenZahl),
    render: (text: string) => <span style={SCHRIFT.neben}>{text}</span>,
  },
  {
    title: "Fahrzeuge",
    dataIndex: "fahrzeugeText",
    sorter: nachZahl<TemplateAnzeigeZeile>((zeile) => zeile.fahrzeugeZahl),
    render: (text: string) => (
      <Chip ton="grau" zeichen="fahrzeug">{text}</Chip>
    ),
  },
];

export function TemplateTable({ zeilen }: { zeilen: TemplateAnzeigeZeile[] }) {
  return (
    <Datentabelle<TemplateAnzeigeZeile>
      rowKey="id"
      aria-label="Vorlagen"
      dataSource={zeilen}
      locale={{
        emptyText: "Noch keine Vorlagen. Lege oben die erste an — oder erstelle eine Vorlage direkt aus einem gepackten Fahrzeug.",
      }}
      columns={SPALTEN}
    />
  );
}
