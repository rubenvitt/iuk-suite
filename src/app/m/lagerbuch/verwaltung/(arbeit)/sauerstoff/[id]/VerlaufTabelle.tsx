"use client";

import type { TableProps } from "antd";
import { Datentabelle, nachDatum, nachText, nachZahl, Zellentext } from "@/core/tabelle";
import { SCHRIFT } from "../../../../_lib/schrift";
import { Chip } from "../../../../_ui/Chip";
import s from "../../../../_ui/verwaltung.module.css";

export type VerlaufAnzeigeZeile = {
  id: string;
  zeitpunktText: string;
  /** ISO-Zeitstempel — allein fuer die Sortierung, nie angezeigt. */
  zeitpunktIso: string;
  druckBar: number;
  herkunft: "check" | "manuell";
  werText: string;
  kommentarText: string | null;
};

const HERKUNFT_TEXT = { check: "aus Check", manuell: "manuell" } as const;

/**
 * ⚠️ SORTIERT WIRD UEBER DEN ROHWERT, NIE UEBER DEN ANZEIGETEXT — `zeitpunktIso`
 * statt `zeitpunktText`; die Begruendung steht an der Zeilenquelle (`page.tsx`).
 *
 * Die Vorsortierung der Abfrage ist „juengste zuerst" (`o2FlascheDetail`,
 * `orderBy(desc(ts), desc(id))`); `defaultSortOrder` schreibt sie nur auf,
 * damit die Spalte beim ersten Klick nicht scheinbar nichts tut.
 */
const VERLAUF_SPALTEN: TableProps<VerlaufAnzeigeZeile>["columns"] = [
  {
    title: "Zeitpunkt",
    dataIndex: "zeitpunktText",
    key: "zeitpunkt",
    sorter: nachDatum<VerlaufAnzeigeZeile>((zeile) => zeile.zeitpunktIso),
    defaultSortOrder: "descend",
    render: (text: string) => <span className={s.jts}>{text}</span>,
  },
  {
    title: "Druck",
    dataIndex: "druckBar",
    key: "druck",
    align: "right",
    sorter: nachZahl<VerlaufAnzeigeZeile>((zeile) => zeile.druckBar),
    render: (wert: number) => <span style={SCHRIFT.mono}>{wert} bar</span>,
  },
  {
    title: "Herkunft",
    dataIndex: "herkunft",
    key: "herkunft",
    filters: [
      { text: HERKUNFT_TEXT.check, value: "check" },
      { text: HERKUNFT_TEXT.manuell, value: "manuell" },
    ],
    onFilter: (wert, zeile) => zeile.herkunft === wert,
    render: (wert: VerlaufAnzeigeZeile["herkunft"]) => (
      <Chip ton="grau">{HERKUNFT_TEXT[wert]}</Chip>
    ),
  },
  {
    title: "Wer",
    dataIndex: "werText",
    key: "wer",
    sorter: nachText<VerlaufAnzeigeZeile>((zeile) => zeile.werText),
    render: (text: string) => <Chip ton="grau">{text}</Chip>,
  },
  {
    /*
     * ⚠️ EINE BREITE, KEINE HOEHENDECKELUNG (DRK-372). `o2_messungen.kommentar`
     * ist ein Nachweisfeld ohne Laengengrenze, und die Tabelle faehrt
     * `scroll.x: "max-content"` — ohne Deckel schoebe EIN langer Satz die
     * Spalten dahinter aus dem Bild. Dieser Verlauf ist zugleich die Stelle, an
     * der der Kommentar ungekuerzt zu LESEN sein muss; er kuerzt deshalb nur
     * seitlich. Dieselbe Abwaegung wie im BZ-Logbuch, dort ausgeschrieben.
     */
    title: "Kommentar",
    dataIndex: "kommentarText",
    key: "kommentar",
    render: (text: string | null) => (
      text === null
        ? <span style={SCHRIFT.neben}>—</span>
        : <Zellentext text={text} />
    ),
  },
];

export function VerlaufTabelle({ zeilen }: { zeilen: VerlaufAnzeigeZeile[] }) {
  return (
    <Datentabelle<VerlaufAnzeigeZeile>
      rowKey="id"
      aria-label="Messungsverlauf"
      locale={{ emptyText: "Für diese Flasche wurde noch keine Messung erfasst." }}
      dataSource={zeilen}
      columns={VERLAUF_SPALTEN}
    />
  );
}
