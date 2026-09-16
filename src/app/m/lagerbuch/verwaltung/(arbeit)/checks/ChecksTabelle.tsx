"use client";

import { useMemo } from "react";
import { Flex } from "antd";
import type { TableProps } from "antd";
import Link from "next/link";
import {
  Datentabelle,
  trifftWert,
  werteAlsFilter,
} from "@/core/tabelle";
import type { AmpelTon } from "../../../_lib/format";
import { einheitLabels, type Einheitenart } from "../../../_lib/konstanten";
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
  /** ⚠️ DRK-309, Reviewrunde 16: der Filter gruppiert ueber die ID, nicht ueber
   *  den Namen — zwei gleichnamige Taschen ohne Kennung waeren sonst EIN
   *  Filterwert (`einheitLabels`). */
  fahrzeugId: string;
  fahrzeugName: string;
  fahrzeugKennung: string | null;
  fahrzeugEinheitenart: Einheitenart | null;
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
 * ⛔ KEIN SORTIERER IN DIESER TABELLE — SIE HAELT EINEN AUSSCHNITT.
 *
 * Die Abfrage ist auf `CHECK_GRENZE` begrenzt (`checks/page.tsx`) und liefert
 * die juengsten Checks zuerst. Ein Vergleicher im Spaltenkopf verspricht
 * dagegen ein EXTREM — „Abgeschlossen aufsteigend" heisst „der aelteste Check
 * steht oben" —, und das kann eine gedeckelte Liste genau dann nicht halten,
 * wenn der Deckel greift: oben stuende der aelteste UNTER DEN NEUESTEN
 * FUENFZIG. Niemand meldet das; die Zeile sieht richtig aus.
 *
 * Dass darueber „Neueste 50 von mehr Treffern" steht, hilft nicht — der Satz
 * erklaert die MENGE, der Spaltenkopf behauptet etwas ueber die ORDNUNG, und
 * beides liest niemand zusammen. Volle Begruendung: `core/tabelle/sortierer.ts`
 * (DRK-331, fuenfte Reviewrunde).
 *
 * Die Einheitenliste im SPALTENFILTER entsteht aus den GELADENEN Zeilen. Der
 * Einheitenfilter ueber der Tabelle (`ChecksFilter`) bleibt daneben stehen und
 * ist nicht dasselbe: er greift VOR dem Deckel und findet damit auch Checks,
 * die hier gar nicht liegen.
 */
/**
 * Die Zeile, wie sie in der Spalte steht UND wie der Filter gruppiert —
 * dieselbe Zeichenkette, damit beide dasselbe meinen. Waeren es zwei, zeigte
 * die Liste etwas anderes an, als der Haken daneben auswaehlt.
 */
/**
 * ⚠️ AUS DER GANZEN LISTE, NICHT AUS DER EINZELNEN ZEILE (DRK-309,
 * Reviewrunde 16). Zwei Taschen duerfen gleich heissen und beide ohne Kennung
 * sein — dann ergibt `einheitMeta` fuer beide dieselbe Zeichenkette, und der
 * Spaltenfilter zoege sie in EINEN Wert zusammen. Welche Einheit gemeint ist,
 * waere ueber diese Spalte dann gar nicht mehr zu isolieren. `einheitLabels`
 * haengt die ID an, aber nur wo es kollidiert; dafuer braucht es alle Zeilen
 * auf einmal.
 */
function zeilenTitel(
  zeilen: readonly CheckAnzeigeZeile[],
): Map<string, { label: string; meta: string }> {
  return einheitLabels(zeilen.map((z) => ({
    id: z.fahrzeugId,
    name: z.fahrzeugName,
    kennung: z.fahrzeugKennung,
    einheitenart: z.fahrzeugEinheitenart,
  })));
}

function spalten(zeilen: CheckAnzeigeZeile[]): TableProps<CheckAnzeigeZeile>["columns"] {
  const beschriftung = zeilenTitel(zeilen);
  // Dieselbe Zeichenkette fuer Anzeige UND Filter — waeren es zwei,
  // zeigte die Liste etwas anderes an, als der Haken daneben auswaehlt.
  const titel = (zeile: CheckAnzeigeZeile) =>
    beschriftung.get(zeile.fahrzeugId)?.label ?? zeile.fahrzeugName;
  return [
    {
      // DRK-309: NEUTRAL — die Spalte listet Fahrzeuge UND Taschen
      // untereinander, und die Zeile nennt die Einheit beim Namen.
      title: "Einheit",
      dataIndex: "fahrzeugName",
      key: "fahrzeug",
      /*
       * ⚠️ DER FILTER GRUPPIERT UEBER NAME · ART · KENNUNG, NICHT UEBER DEN
       * NAMEN (DRK-309, Reviewrunde 7). `lagerorte.name` traegt keinen
       * Eindeutigkeitsschluessel: ein Fahrzeug und eine Tasche duerfen gleich
       * heissen, und ein Filter ueber den blossen Namen faenge dann BEIDE —
       * eine Auswahl, die sich wie eine Einschraenkung liest und keine ist.
       */
      filters: werteAlsFilter(zeilen, titel),
      onFilter: trifftWert<CheckAnzeigeZeile>(titel),
      render: (name: string, zeile: CheckAnzeigeZeile) => (
        <Link href={zeile.detailHref} style={{ fontWeight: 600 }}>
          {titel(zeile)}
        </Link>
      ),
    },
    {
      title: "Abgeschlossen",
      dataIndex: "abgeschlossenText",
      key: "abgeschlossen",
      // Die Abfrage liefert „juengste zuerst" (`orderBy(desc(completedAt))`).
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
      aria-label="Checks"
      dataSource={zeilen}
      locale={{ emptyText: leertext }}
      columns={spaltenliste}
    />
  );
}
