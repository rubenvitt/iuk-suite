"use client";

import { useMemo } from "react";
import { Flex } from "antd";
import type { TableProps } from "antd";
import Link from "next/link";
import {
  Datentabelle,
  nachDatum,
  nachText,
  trifftWert,
  werteAlsFilter,
} from "@/core/tabelle";
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
  /** ISO-Zeitstempel — allein fuer die Sortierung, nie angezeigt. */
  abgeschlossenIso: string | null;
  ergebnisChips: CheckErgebnisChip[];
  positionenText: string;
};

export type ChecksTabelleProps = {
  zeilen: CheckAnzeigeZeile[];
  leertext: string;
};

/**
 * ⚠️ SORTIERT WIRD UEBER `abgeschlossenIso`, NIE UEBER `abgeschlossenText` — die
 * Begruendung steht an der Zeilenquelle (`checks/page.tsx`).
 *
 * Die Fahrzeugliste im Spaltenfilter entsteht aus den GELADENEN Zeilen. Der
 * Fahrzeugfilter ueber der Tabelle (`ChecksFilter`) bleibt daneben stehen und
 * ist nicht dasselbe: er greift VOR der auf `CHECK_GRENZE` begrenzten Abfrage
 * und findet damit auch Checks, die hier gar nicht liegen.
 */
function spalten(zeilen: CheckAnzeigeZeile[]): TableProps<CheckAnzeigeZeile>["columns"] {
  return [
    {
      title: "Fahrzeug",
      dataIndex: "fahrzeugName",
      key: "fahrzeug",
      sorter: nachText<CheckAnzeigeZeile>((zeile) => zeile.fahrzeugName),
      filters: werteAlsFilter(zeilen, (zeile) => zeile.fahrzeugName),
      onFilter: trifftWert<CheckAnzeigeZeile>((zeile) => zeile.fahrzeugName),
      render: (name: string, zeile: CheckAnzeigeZeile) => (
        <Link href={zeile.detailHref} style={{ fontWeight: 600 }}>
          {name}
        </Link>
      ),
    },
    {
      title: "Abgeschlossen",
      dataIndex: "abgeschlossenText",
      key: "abgeschlossen",
      sorter: nachDatum<CheckAnzeigeZeile>((zeile) => zeile.abgeschlossenIso),
      // Die Abfrage liefert „juengste zuerst" (`orderBy(desc(completedAt))`).
      defaultSortOrder: "descend",
      render: (text: string) => <span className={s.jts}>{text}</span>,
    },
    {
      title: "Ergebnis",
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
      title: "Positionen",
      dataIndex: "positionenText",
      key: "positionen",
      align: "right",
      render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
    },
  ];
}

export function ChecksTabelle({ zeilen, leertext }: ChecksTabelleProps) {
  // Die Filterliste entsteht aus den Daten; ohne `useMemo` baute jedes Rendern
  // eine neue Spaltenliste und zwaenge die Tabelle zur Neuberechnung.
  const spaltenliste = useMemo(() => spalten(zeilen), [zeilen]);

  return (
    <Datentabelle<CheckAnzeigeZeile>
      rowKey="id"
      aria-label="Fahrzeug-Checks"
      dataSource={zeilen}
      locale={{ emptyText: leertext }}
      columns={spaltenliste}
    />
  );
}
