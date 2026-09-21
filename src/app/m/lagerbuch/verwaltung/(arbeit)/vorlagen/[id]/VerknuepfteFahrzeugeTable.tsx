"use client";

import type { TableProps } from "antd";
import Link from "next/link";
import { Kartentabelle, nachJaNein, nachText, zustandsFilter } from "@/core/tabelle";
import {
  einheitenartLabel,
  type Einheitenart,
} from "../../../../_lib/konstanten";
import { Chip } from "../../../../_ui/Chip";

export type VerknuepftesFahrzeugDto = {
  id: string;
  name: string;
  kennung: string | null;
  aktiv: boolean;
  einheitenart: Einheitenart | null;
};

/**
 * DRK-309 — dieselbe Spalte wie in der Einheitenliste, aus demselben Grund.
 *
 * ⚠️ HIER WIEGT SIE SOGAR MEHR ALS DORT. Die Einheitenliste steht unter der
 * Ueberschrift „Fahrzeuge und Taschen" und laesst gar nichts anderes erwarten;
 * diese Tabelle heisst „Verknuepfte Einheiten" und beantwortet die Frage „wer
 * nutzt diese Vorlage?". Steht dort eine Zeile ohne Art, liest man sie als
 * Fahrzeug — weil Vorlagen bis zu dieser Aenderung nur Fahrzeuge kannten. Eine
 * Vorlage, die an einem RTW UND an drei Sanitaetstaschen haengt, ist genau der
 * Fall, den das Ticket sichtbar machen wollte, und er faellt nur hier auf.
 */
const ART_FILTER = zustandsFilter<VerknuepftesFahrzeugDto>([
  { wert: "fahrzeug", text: "Fahrzeug",
    trifft: (zeile) => zeile.einheitenart === "fahrzeug" },
  { wert: "tasche", text: "Tasche",
    trifft: (zeile) => zeile.einheitenart === "tasche" },
  { wert: "offen", text: "nicht zugeordnet",
    trifft: (zeile) => zeile.einheitenart === null },
]);

const STATUS_FILTER = zustandsFilter<VerknuepftesFahrzeugDto>([
  { wert: "aktiv", text: "aktiv", trifft: (zeile) => zeile.aktiv },
  { wert: "inaktiv", text: "inaktiv", trifft: (zeile) => !zeile.aktiv },
]);

const SPALTEN: TableProps<VerknuepftesFahrzeugDto>["columns"] = [
  {
    title: "Einheit",
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
    // Neben dem Namen, nicht hinten: „was ist das?" kommt vor „wie steht es?".
    title: "Art",
    dataIndex: "einheitenart",
    key: "art",
    sorter: nachText<VerknuepftesFahrzeugDto>(
      (zeile) => einheitenartLabel(zeile.einheitenart)),
    filters: ART_FILTER.filters,
    onFilter: ART_FILTER.onFilter,
    // Grau auch fuer den Zwischenstand — Begruendung in `FahrzeugeListe`.
    render: (wert: Einheitenart | null) => wert === null
      ? <Chip ton="grau">{einheitenartLabel(null)}</Chip>
      : <Chip ton="grau" zeichen={wert}>{einheitenartLabel(wert)}</Chip>,
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
    <Kartentabelle<VerknuepftesFahrzeugDto>
      rowKey="id"
      aria-label="Verknüpfte Einheiten"
      dataSource={zeilen}
      leer={{
        nichts: "Keine Einheit nutzt diese Vorlage.",
        gefiltert: "Keine Einheit passt zum Filter.",
      }}
      columns={SPALTEN}
    />
  );
}
