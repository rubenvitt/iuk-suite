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
import { einheitMeta, type Einheitenart } from "../../../_lib/konstanten";
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
  fahrzeugKennung: string | null;
  fahrzeugEinheitenart: Einheitenart | null;
  abgeschlossenText: string;
  /** ISO-Zeitstempel — allein fuer die Sortierung, nie angezeigt. */
  abgeschlossenIso: string | null;
  /** DRK-311 — der aufgeloeste Verfasser. Nie leer; der Aufloeser faellt
   *  notfalls auf die rohe Kennung zurueck (`_db/quelle.ts`). */
  werText: string;
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
function zeileTitel(zeile: CheckAnzeigeZeile): string {
  return `${zeile.fahrzeugName} · ${einheitMeta({
    kennung: zeile.fahrzeugKennung,
    einheitenart: zeile.fahrzeugEinheitenart,
  })}`;
}

function spalten(zeilen: CheckAnzeigeZeile[]): TableProps<CheckAnzeigeZeile>["columns"] {
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
      filters: werteAlsFilter(zeilen, zeileTitel),
      onFilter: trifftWert<CheckAnzeigeZeile>(zeileTitel),
      render: (name: string, zeile: CheckAnzeigeZeile) => (
        <Link href={zeile.detailHref} style={{ fontWeight: 600 }}>
          {zeileTitel(zeile)}
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
      /*
       * DRK-311 — WER DEN CHECK ERFASST HAT. „Wer" wie im BZ-Logbuch daneben:
       * dieselbe Frage, dasselbe Wort, derselbe graue Chip. Zwei Ueberschriften
       * fuer dieselbe Spalte („Verfasser" hier, „Wer" dort) liessen offen, ob
       * auch dasselbe gemeint ist.
       *
       * ⚠️ DER FILTER GRUPPIERT UEBER DEN ANGEZEIGTEN NAMEN, nicht ueber die
       * Kennung dahinter — dieselbe Zeichenkette, die in der Spalte steht,
       * damit Haken und Anzeige dasselbe meinen (vgl. `zeileTitel` oben). Zwei
       * Konten mit demselben Anzeigenamen faellt der Filter damit zusammen; das
       * ist der Preis dafuer, dass niemand rohe Kennungen ankreuzen muss.
       */
      title: "Wer",
      dataIndex: "werText",
      key: "wer",
      filters: werteAlsFilter(zeilen, (zeile) => zeile.werText),
      onFilter: trifftWert<CheckAnzeigeZeile>((zeile) => zeile.werText),
      render: (text: string) => <Chip ton="grau">{text}</Chip>,
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
