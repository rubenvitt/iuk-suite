"use client";

import { Flex, Table, type TableProps } from "antd";
import Link from "next/link";
import type { AmpelTon } from "../../../_lib/format";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import type { IkonName } from "../../../_ui/ikonen";
import s from "../../../_ui/verwaltung.module.css";

export type CheckErgebnisChip = {
  schluessel: string;
  text: string;
  ton: AmpelTon;
  zeichen: IkonName | null;
};

export type CheckAnzeigeZeile = {
  id: string;
  detailHref: string;
  fahrzeugName: string;
  abgeschlossenText: string;
  ergebnisChips: CheckErgebnisChip[];
  positionenText: string;
};

export type ChecksTabelleProps = {
  zeilen: CheckAnzeigeZeile[];
  leertext: string;
};

const SPALTEN = [
  {
    title: <span style={SCHRIFT.feldname}>Fahrzeug</span>,
    dataIndex: "fahrzeugName",
    key: "fahrzeug",
    render: (name: string, zeile: CheckAnzeigeZeile) => (
      <Link href={zeile.detailHref} style={{ fontWeight: 600 }}>
        {name}
      </Link>
    ),
  },
  {
    title: <span style={SCHRIFT.feldname}>Abgeschlossen</span>,
    dataIndex: "abgeschlossenText",
    key: "abgeschlossen",
    render: (text: string) => <span className={s.jts}>{text}</span>,
  },
  {
    title: <span style={SCHRIFT.feldname}>Ergebnis</span>,
    dataIndex: "ergebnisChips",
    key: "ergebnis",
    render: (chips: CheckErgebnisChip[]) => (
      // 6 liegt nicht auf der SPACE-Skala (4/8/12/16/24/32) -- enger
      // Chip-Zeilenabstand, wie in ArtikelTable.tsx (Aufgabe 8), bleibt
      // Literal statt auf einen sichtbar groeberen Wert gerundet.
      <Flex gap={6} wrap>
        {chips.map((chip) => (
          <Chip
            key={chip.schluessel}
            ton={chip.ton}
            zeichen={chip.zeichen ?? undefined}
          >
            {chip.text}
          </Chip>
        ))}
      </Flex>
    ),
  },
  {
    title: <span style={SCHRIFT.feldname}>Positionen</span>,
    dataIndex: "positionenText",
    key: "positionen",
    align: "right" as const,
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
] satisfies TableProps<CheckAnzeigeZeile>["columns"];

export function ChecksTabelle({ zeilen, leertext }: ChecksTabelleProps) {
  return (
    <Table<CheckAnzeigeZeile>
      rowKey="id"
      pagination={false}
      scroll={{ x: "max-content" }}
      aria-label="Fahrzeug-Checks"
      dataSource={zeilen}
      locale={{ emptyText: leertext }}
      columns={SPALTEN}
    />
  );
}
