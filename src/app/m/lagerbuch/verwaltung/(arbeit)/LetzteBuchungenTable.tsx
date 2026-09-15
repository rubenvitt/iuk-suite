"use client";

import { Empty, type TableProps } from "antd";
import { Datentabelle } from "@/core/tabelle";
import s from "../../_ui/verwaltung.module.css";

export type UebersichtJournalZeile = {
  id: string;
  zeitText: string;
  /** ISO-Zeitstempel — allein fuer die Sortierung, nie angezeigt. */
  zeitIso: string;
  artikelName: string;
  vorgangText: string;
  deltaText: string;
  /** Die Menge als Zahl — allein fuer die Sortierung, angezeigt wird `deltaText`. */
  deltaZahl: number;
  deltaTon: "negativ" | "positiv" | "neutral";
};

/**
 * ⚠️ SORTIERT WIRD UEBER DEN ROHWERT, NIE UEBER DEN ANZEIGETEXT. `zeitText` ist
 * „14.09. 08:12" und `deltaText` „−3 Stk" — beide sortierten als Zeichenkette
 * falsch (der 2. Oktober vor dem 14. September, „−3" neben „−30"). Deshalb
 * traegt die Zeile beide Werte: einen zum Lesen und einen zum Ordnen.
 *
 * Der Spaltenkopf-Kicker kommt von `Datentabelle` — `title` ist hier eine
 * gewoehnliche Zeichenkette (`docs/design/README.md`).
 *
 * ⛔ KEIN SORTIERER — DIESE TABELLE ZEIGT FUENF ZEILEN VON VIELEN.
 *
 * Die Uebersicht ruft `journalEintraege(db, { grenze: 5 })`. Ein Vergleicher im
 * Spaltenkopf ordnete also die neuesten FUENF Buchungen und verspraeche dabei
 * ein Extrem ueber das ganze Journal — „Δ absteigend" hiesse „die groesste
 * Buchung steht oben", und sie steht fast sicher nicht darunter. Die Vorschau
 * bleibt in der Ordnung ihrer Abfrage; wer sortieren will, geht ins Journal.
 * Volle Begruendung: `core/tabelle/sortierer.ts` (DRK-331, sechste Runde).
 */
const SPALTEN: TableProps<UebersichtJournalZeile>["columns"] = [
  {
    title: "Zeit",
    dataIndex: "zeitText",
    key: "zeit",
    render: (zeitText: string) => <span className={s.jts}>{zeitText}</span>,
  },
  {
    title: "Artikel",
    dataIndex: "artikelName",
    key: "artikel",
  },
  {
    title: "Vorgang",
    dataIndex: "vorgangText",
    key: "vorgang",
  },
  {
    title: "Δ",
    dataIndex: "deltaText",
    key: "menge",
    align: "right",
    render: (deltaText: string, zeile) => {
      const zustandKlasse = zeile.deltaTon === "negativ"
        ? s.jminus
        : zeile.deltaTon === "positiv"
          ? s.jplus
          : undefined;
      return (
        <span className={[s.jdelta, zustandKlasse].filter(Boolean).join(" ")}>
          {deltaText}
        </span>
      );
    },
  },
];

export function LetzteBuchungenTable({ zeilen }: {
  zeilen: UebersichtJournalZeile[];
}) {
  if (zeilen.length === 0) {
    // Punkt 5 der Pruefliste: der Leerzustand nennt, woher Buchungen kommen,
    // statt nur "nichts da" zu sagen.
    return (
      <Empty
        description="Noch keine Buchungen. Buchungen entstehen beim Ein- und Auslagern im Artikelbestand."
      />
    );
  }

  return (
    <Datentabelle<UebersichtJournalZeile>
      rowKey="id"
      aria-label="Letzte Buchungen"
      dataSource={zeilen}
      columns={SPALTEN}
    />
  );
}
