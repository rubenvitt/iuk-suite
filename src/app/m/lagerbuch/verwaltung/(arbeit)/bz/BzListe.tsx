"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Flex } from "antd";
import type { TableProps } from "antd";
import {
  Datentabelle,
  filterAktiv,
  type FilterZustand,
  nachDatum,
  nachJaNein,
  nachRang,
  nachText,
  trifftWert,
  useEntprellt,
  wendeFilterAn,
  werteAlsFilter,
  zustandsFilter,
} from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import type { AmpelTon } from "../../../_lib/format";
import { falte } from "../../../_lib/suche";
import { SCHRIFT } from "../../../_lib/schrift";
import type { LagerortOption } from "../../../_lib/lesepfade/bz";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import { Suchfeld } from "../../../_ui/Suchfeld";
import { Trefferanzeige } from "../../../_ui/Trefferanzeige";
import type { BzAnzeigeZeile } from "./bzAnzeige";
import { NeuBzGeraet } from "./NeuBzGeraet";

function sucheTrifft(zeile: BzAnzeigeZeile, begriff: string): boolean {
  const suche = falte(begriff.trim());
  return suche === "" || falte(
    `${zeile.name} ${zeile.barcode ?? ""} ${zeile.standortText}`,
  ).includes(suche);
}

/**
 * DIE BEIDEN HAKEN VON FRUEHER SIND SPALTENFILTER GEWORDEN.
 *
 * Ueber der Tabelle standen „faellig/ueberfaellig" und „inaktive ausblenden" —
 * beides Praedikate ueber der Zeile, und ein Praedikat ueber der Zeile ist ein
 * Spaltenfilter. Sie sitzen jetzt im Kopf der Spalte, deren Chip sie meinen.
 */
const FAELLIG_FILTER = zustandsFilter<BzAnzeigeZeile>([
  { wert: "faellig", text: "fällig/überfällig", trifft: (zeile) => zeile.faellig },
  { wert: "imBereich", text: "nicht fällig", trifft: (zeile) => !zeile.faellig },
]);

const STATUS_FILTER = zustandsFilter<BzAnzeigeZeile>([
  { wert: "aktiv", text: "aktiv", trifft: (zeile) => zeile.aktiv },
  { wert: "inaktiv", text: "inaktiv", trifft: (zeile) => !zeile.aktiv },
]);

/** Rot vor gelb vor ok: was Aufmerksamkeit verlangt, gehoert nach oben. */
const AMPEL_RANG = ["rot", "gelb", "grau", "ok"] as const;

function spalten(zeilen: BzAnzeigeZeile[]): NonNullable<TableProps<BzAnzeigeZeile>["columns"]> {
  return [
    {
      title: "Gerät",
      dataIndex: "name",
      sorter: nachText<BzAnzeigeZeile>((zeile) => zeile.name),
      render: (wert: string, zeile) => (
        <span>
          <Link
            href={`/verwaltung/bz/${zeile.id}`}
            style={{ fontWeight: 600 }}
          >
            {wert}
          </Link>
          {zeile.barcode ? (
            <span style={{ ...SCHRIFT.mono, marginInlineStart: SPACE.sm }}>
              {zeile.barcode}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      title: "Standort",
      dataIndex: "standortText",
      sorter: nachText<BzAnzeigeZeile>((zeile) => zeile.standortText),
      filters: werteAlsFilter(zeilen, (zeile) => zeile.standortText),
      onFilter: trifftWert<BzAnzeigeZeile>((zeile) => zeile.standortText),
    },
    {
      title: "Fälligkeit",
      dataIndex: "faelligkeitText",
      // Sortiert wird ueber die Ampel, nicht ueber den Text: „fällig in 8
      // Tagen" und „überfällig (seit 3 Tagen)" ordneten als Zeichenketten
      // beliebig.
      sorter: nachRang<BzAnzeigeZeile, AmpelTon>(
        (zeile) => zeile.faelligkeitTon,
        AMPEL_RANG,
      ),
      filters: FAELLIG_FILTER.filters,
      onFilter: FAELLIG_FILTER.onFilter,
      render: (wert: string, zeile) => (
        <Chip
          ton={zeile.faelligkeitTon}
          zeichen={zeile.faelligkeitTon === "rot" ? "warnung" : undefined}
        >
          {wert}
        </Chip>
      ),
    },
    {
      title: "Letzte Kontrolle",
      dataIndex: "letzteKontrolleText",
      // ⚠️ Ueber `letzteKontrolleIso`, nie ueber den Anzeigetext — Begruendung
      // an der Zeilenquelle (`bz/bzAnzeige.ts`).
      sorter: nachDatum<BzAnzeigeZeile>((zeile) => zeile.letzteKontrolleIso),
      render: (wert: string | null) => (
        <span style={SCHRIFT.mono}>{wert ?? "–"}</span>
      ),
    },
    {
      title: "Status",
      dataIndex: "aktiv",
      sorter: nachJaNein<BzAnzeigeZeile>((zeile) => zeile.aktiv),
      filters: STATUS_FILTER.filters,
      onFilter: STATUS_FILTER.onFilter,
      render: (wert: boolean) => wert ? null : <Chip ton="grau">inaktiv</Chip>,
    },
  ];
}

export function BzListe({
  zeilen,
  lagerorte,
}: {
  zeilen: BzAnzeigeZeile[];
  lagerorte: LagerortOption[];
}) {
  const [suche, setSuche] = useState("");
  // Das FELD bleibt unentprellt, entprellt wird die Ableitung.
  const sucheNachlauf = useEntprellt(suche);
  /**
   * ⚠️ DER ZUSTAND WIRD GEMERKT, NICHT DIE LISTE (Falle 15). `onChange` feuert
   * nur bei Bedienung DER TABELLE — tippt jemand daneben in die Suche, filtert
   * antd zwar neu, meldet es aber nicht. Die angezeigte Menge folgt deshalb aus
   * dem Zustand, bei jeder Aenderung neu.
   */
  const [spaltenFilter, setSpaltenFilter] = useState<FilterZustand>({});

  const gefiltert = useMemo(
    () => zeilen.filter((zeile) => sucheTrifft(zeile, sucheNachlauf)),
    [zeilen, sucheNachlauf],
  );

  const spaltenliste = useMemo(() => spalten(zeilen), [zeilen]);
  // Was WIRKLICH in der Tabelle steht: Suche UND Spaltenfilter. antd wendet
  // dieselben Praedikate danach noch einmal an — beide Schritte sind idempotent.
  const angezeigt = wendeFilterAn(gefiltert, spaltenliste, spaltenFilter);
  const hatFilter = sucheNachlauf.trim() !== "" || filterAktiv(spaltenFilter);

  return (
    <>
      <Flex gap={SPACE.md} wrap align="center" style={{ marginBlockEnd: SPACE.md }}>
        <Suchfeld
          wert={suche}
          onWert={setSuche}
          platzhalter="Gerät, Barcode oder Lagerort suchen…"
        />
        <Trefferanzeige gezeigt={angezeigt.length} gesamt={zeilen.length} />
        <Button href="/verwaltung/bz/scan" icon={<Ikone name="scannen" groesse={16} />}>
          Scannen
        </Button>
        <NeuBzGeraet lagerorte={lagerorte} />
      </Flex>

      <Datentabelle<BzAnzeigeZeile>
        rowKey="id"
        aria-label="BZ-Geräte"
        dataSource={gefiltert}
        onChange={(_seite, filter) => setSpaltenFilter(filter)}
        locale={{
          emptyText: hatFilter
            ? "Kein Gerät passt zu Suche und Filter."
            : "Noch keine BZ-Geräte. Lege oben das erste an.",
        }}
        columns={spaltenliste}
      />
    </>
  );
}
