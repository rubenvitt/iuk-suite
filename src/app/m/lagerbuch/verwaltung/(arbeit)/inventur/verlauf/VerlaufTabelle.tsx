"use client";

import { Table, type TableProps } from "antd";
import Link from "next/link";
import { Zellentext } from "@/core/tabelle";
import { SCHRIFT } from "../../../../_lib/schrift";
import { Chip } from "../../../../_ui/Chip";
import s from "../../../../_ui/verwaltung.module.css";

/**
 * DRK-299 — die Liste abgeschlossener Inventuren. Eigene Client-Insel, weil
 * `columns[].render` eine Funktion ist und nicht ueber die RSC-Grenze darf
 * (Falle 9). Die Seite reicht NUR Primitive herein; die Zeile ist ein TYP,
 * kein Wert (Falle 6).
 */
export type VerlaufZeile = {
  id: string;
  zeitText: string;
  person: string;
  kommentar: string;
  umfangText: string;
  positionen: number;
  abweichungen: number;
  detailHref: string;
};

export type VerlaufTabelleProps = { zeilen: VerlaufZeile[] };

const SPALTEN = [
  {
    title: <span style={SCHRIFT.feldname}>Zeit</span>,
    dataIndex: "zeitText",
    key: "zeit",
    render: (text: string, zeile: VerlaufZeile) => (
      <Link href={zeile.detailHref} className={s.jts} style={{ fontWeight: 600 }}>
        {text}
      </Link>
    ),
  },
  {
    title: <span style={SCHRIFT.feldname}>Person</span>,
    dataIndex: "person",
    key: "person",
  },
  {
    /*
     * ⚠️ EINE BREITE (DRK-372). `inventuren.kommentar` ist Freitext ohne
     * Laengengrenze, die Tabelle faehrt `scroll={{ x: "max-content" }}` — EIN
     * langer Satz schoebe Umfang, Positionen und Abweichungen aus dem Bild,
     * und das Symptom fuehrt in die Irre: die Zeile sieht richtig aus, sie
     * steht nur sehr weit rechts.
     *
     * Ohne `zeilen`: der Kommentar steht auf der Detailseite zwar noch einmal,
     * dort aber in EINER Kopfzeile neben Person und Umfang — waere er hier
     * gekuerzt, saesse der volle Text an keiner Stelle, an der er sich lesen
     * laesst.
     */
    title: <span style={SCHRIFT.feldname}>Kommentar</span>,
    dataIndex: "kommentar",
    key: "kommentar",
    render: (text: string) => <Zellentext text={text} />,
  },
  {
    title: <span style={SCHRIFT.feldname}>Umfang</span>,
    dataIndex: "umfangText",
    key: "umfang",
  },
  {
    title: <span style={SCHRIFT.feldname}>Positionen</span>,
    dataIndex: "positionen",
    key: "positionen",
    align: "right" as const,
    render: (zahl: number) => <span style={SCHRIFT.mono}>{zahl}</span>,
  },
  {
    title: <span style={SCHRIFT.feldname}>Abweichungen</span>,
    dataIndex: "abweichungen",
    key: "abweichungen",
    // ⚠️ NIE rot (Falle 3): eine Abweichung ist gebucht und damit erledigt,
    // kein Alarm. Gelb markiert, ok sagt „keine".
    render: (zahl: number) => (zahl > 0
      ? <Chip ton="gelb">{zahl}</Chip>
      : <Chip ton="ok">keine</Chip>),
  },
] satisfies TableProps<VerlaufZeile>["columns"];

export function VerlaufTabelle({ zeilen }: VerlaufTabelleProps) {
  return (
    <Table<VerlaufZeile>
      rowKey="id"
      pagination={false}
      scroll={{ x: "max-content" }}
      aria-label="Inventur-Verlauf"
      dataSource={zeilen}
      locale={{ emptyText: "Noch keine Inventur abgeschlossen. Starte eine unter Inventur." }}
      columns={SPALTEN}
    />
  );
}
