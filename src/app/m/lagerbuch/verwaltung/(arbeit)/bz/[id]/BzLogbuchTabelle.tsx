"use client";

import { Table, type TableProps } from "antd";
import type { AmpelTon } from "../../../../_lib/format";
import { SCHRIFT } from "../../../../_lib/schrift";
import { Chip } from "../../../../_ui/Chip";
import s from "../../../../_ui/verwaltung.module.css";

/** Vollständig serialisierbarer Vertrag zwischen BZ-Serverseite und Client-Tabelle. */
export type BzLogbuchAnzeigeZeile = {
  id: string;
  zeitpunktText: string;
  ergebnisText: string;
  ergebnisTon: "ok" | "rot";
  level1Wert: number | null;
  level1Ton: AmpelTon | null;
  level1MinDamals: number | "?";
  level1MaxDamals: number | "?";
  level2Wert: number | null;
  level2Ton: AmpelTon | null;
  level2MinDamals: number | "?";
  level2MaxDamals: number | "?";
  verbrauchText: string;
  akkuText: "gewechselt" | "—";
  akkuTon: "gelb" | null;
  werText: string;
  kommentarText: string | null;
};

function levelZelle({
  bezeichnung,
  wert,
  ton,
  min,
  max,
}: {
  bezeichnung: "L1" | "L2";
  wert: number | null;
  ton: AmpelTon | null;
  min: number | "?";
  max: number | "?";
}) {
  if (wert === null) return <span style={SCHRIFT.neben}>—</span>;
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      <Chip ton={ton ?? "gelb"}>{bezeichnung} {wert}</Chip>
      <span style={{ ...SCHRIFT.neben, marginInlineStart: 6 }}>
        (damals {min}–{max})
      </span>
    </span>
  );
}

const LOGBUCH_SPALTEN = [
  {
    title: "Zeitpunkt",
    dataIndex: "zeitpunktText",
    key: "zeitpunkt",
    render: (text: string) => <span className={s.jts}>{text}</span>,
  },
  {
    title: "Ergebnis",
    dataIndex: "ergebnisText",
    key: "ergebnis",
    render: (text: string, zeile) => <Chip ton={zeile.ergebnisTon}>{text}</Chip>,
  },
  {
    title: "Level 1",
    dataIndex: "level1Wert",
    key: "level1",
    render: (_wert: number | null, zeile) => levelZelle({
      bezeichnung: "L1",
      wert: zeile.level1Wert,
      ton: zeile.level1Ton,
      min: zeile.level1MinDamals,
      max: zeile.level1MaxDamals,
    }),
  },
  {
    title: "Level 2",
    dataIndex: "level2Wert",
    key: "level2",
    render: (_wert: number | null, zeile) => levelZelle({
      bezeichnung: "L2",
      wert: zeile.level2Wert,
      ton: zeile.level2Ton,
      min: zeile.level2MinDamals,
      max: zeile.level2MaxDamals,
    }),
  },
  {
    title: "Verbrauch",
    dataIndex: "verbrauchText",
    key: "verbrauch",
    render: (text: string) => <span style={SCHRIFT.neben}>{text}</span>,
  },
  {
    title: "Akku",
    dataIndex: "akkuText",
    key: "akku",
    render: (text: BzLogbuchAnzeigeZeile["akkuText"], zeile) => (
      zeile.akkuTon
        ? <Chip ton={zeile.akkuTon} zeichen="akku">{text}</Chip>
        : <span style={SCHRIFT.neben}>{text}</span>
    ),
  },
  {
    title: "Wer",
    dataIndex: "werText",
    key: "wer",
    render: (text: string) => <Chip ton="grau">{text}</Chip>,
  },
  {
    title: "Kommentar",
    dataIndex: "kommentarText",
    key: "kommentar",
    render: (text: string | null) => text ?? <span style={SCHRIFT.neben}>—</span>,
  },
] satisfies TableProps<BzLogbuchAnzeigeZeile>["columns"];

export function BzLogbuchTabelle({ zeilen }: { zeilen: BzLogbuchAnzeigeZeile[] }) {
  return (
    <Table<BzLogbuchAnzeigeZeile>
      rowKey="id"
      pagination={false}
      scroll={{ x: "max-content" }}
      aria-label="Logbuch der Kontrollen"
      locale={{ emptyText: "Für dieses Gerät wurde noch keine Kontrolle erfasst." }}
      dataSource={zeilen}
      columns={LOGBUCH_SPALTEN}
    />
  );
}
