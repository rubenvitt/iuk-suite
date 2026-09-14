"use client";

import type { TableProps } from "antd";
import {
  Datentabelle,
  nachDatum,
  nachText,
  nachZahl,
  type Filterwert,
} from "@/core/tabelle";
import type { AmpelTon } from "../../../../_lib/format";
import { SCHRIFT } from "../../../../_lib/schrift";
import { Chip } from "../../../../_ui/Chip";
import s from "../../../../_ui/verwaltung.module.css";

/** Vollständig serialisierbarer Vertrag zwischen BZ-Serverseite und Client-Tabelle. */
export type BzLogbuchAnzeigeZeile = {
  id: string;
  zeitpunktText: string;
  /** ISO-Zeitstempel — allein fuer die Sortierung, nie angezeigt. */
  zeitpunktIso: string;
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
      {/* 6 liegt nicht auf der SPACE-Skala (4/8/12/16/24/32) -- enger Abstand
          zwischen Chip und Klammerzusatz in derselben Zelle, kein
          Skalenwert ohne sichtbaren Sprung. */}
      <span style={{ ...SCHRIFT.neben, marginInlineStart: 6 }}>
        (damals {min}–{max})
      </span>
    </span>
  );
}

/**
 * ⚠️ SORTIERT WIRD UEBER `zeitpunktIso`, NIE UEBER `zeitpunktText` — die
 * Begruendung steht an der Zeilenquelle (`bz/[id]/page.tsx`). Dasselbe gilt fuer
 * die beiden Level-Spalten: gerendert wird ein Chip mit Klammerzusatz, sortiert
 * wird ueber die nackte Zahl.
 *
 * Die Vorsortierung der Abfrage ist „juengste zuerst"
 * (`orderBy(desc(ts), desc(id))`); `defaultSortOrder` schreibt sie nur auf.
 */
const LOGBUCH_SPALTEN = [
  {
    title: "Zeitpunkt",
    dataIndex: "zeitpunktText",
    key: "zeitpunkt",
    sorter: nachDatum<BzLogbuchAnzeigeZeile>((zeile) => zeile.zeitpunktIso),
    defaultSortOrder: "descend" as const,
    render: (text: string) => <span className={s.jts}>{text}</span>,
  },
  {
    title: "Ergebnis",
    dataIndex: "ergebnisText",
    key: "ergebnis",
    filters: [
      { text: "bestanden", value: "bestanden" },
      { text: "nicht bestanden", value: "nicht bestanden" },
    ],
    onFilter: (wert: Filterwert, zeile: BzLogbuchAnzeigeZeile) =>
      zeile.ergebnisText === wert,
    render: (text: string, zeile) => <Chip ton={zeile.ergebnisTon}>{text}</Chip>,
  },
  {
    title: "Level 1",
    dataIndex: "level1Wert",
    key: "level1",
    sorter: nachZahl<BzLogbuchAnzeigeZeile>((zeile) => zeile.level1Wert),
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
    sorter: nachZahl<BzLogbuchAnzeigeZeile>((zeile) => zeile.level2Wert),
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
    sorter: nachText<BzLogbuchAnzeigeZeile>((zeile) => zeile.werText),
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
    <Datentabelle<BzLogbuchAnzeigeZeile>
      rowKey="id"
      aria-label="Logbuch der Kontrollen"
      locale={{ emptyText: "Für dieses Gerät wurde noch keine Kontrolle erfasst." }}
      dataSource={zeilen}
      columns={LOGBUCH_SPALTEN}
    />
  );
}
