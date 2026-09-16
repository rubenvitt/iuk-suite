"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Flex } from "antd";
import type { TableProps } from "antd";
import {
  Datentabelle,
  filterAktiv,
  type Filterwert,
  type FilterZustand,
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
import type { GeraetTyp } from "../../../_lib/domain/geraet";
import type { LagerortOption as Lagerort } from "../../../_lib/lesepfade/bz";
import { SCHRIFT } from "../../../_lib/schrift";
import { falte } from "../../../_lib/suche";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import { Suchfeld } from "../../../_ui/Suchfeld";
import { Trefferanzeige } from "../../../_ui/Trefferanzeige";
import { NeuGeraet } from "./NeuGeraet";

/**
 * Ausschließlich JSON-sichere Anzeige- und Filterwerte überschreiten die
 * RSC-Grenze. Die zeitabhängige Berechnung und der Chip entstehen im Serverteil.
 */
export type GeraetAnzeigeZeile = {
  id: string;
  typ: GeraetTyp;
  name: string;
  barcode: string | null;
  lagerortName: string;
  aktiv: boolean;
  faelligkeitAmpel: "rot" | "gelb" | "gruen";
  keinDatum: boolean;
  chip: { ton: AmpelTon; text: string } | null;
};

/** SUCHFELDMENGE 5 VON 6: Name · Barcode · Lagerort. */
export function sucheTrifft(zeile: GeraetAnzeigeZeile, begriff: string): boolean {
  const suche = falte(begriff.trim());
  return suche === "" || falte(
    `${zeile.name} ${zeile.barcode ?? ""} ${zeile.lagerortName}`,
  ).includes(suche);
}

const KLASSE_TEXT: Record<GeraetTyp, string> = {
  medizin: "Medizin",
  objekt: "Objekt",
};

/**
 * DIE HAKENLEISTE VON FRUEHER IST IN DIE SPALTENKOEPFE GEWANDERT.
 *
 * Ueber der Tabelle standen eine `Checkbox.Group` fuer die Klasse sowie „nur
 * faellige" und „inaktive ausblenden" — drei Praedikate ueber der Zeile, und
 * ein Praedikat ueber der Zeile ist ein Spaltenfilter. Jedes sitzt jetzt im
 * Kopf der Spalte, die es betrifft.
 *
 * ⚠️ MEHRERE HAKEN EINER SPALTE VERODERN SICH (antd-Verhalten, s.
 * `zustandsFilter`); Filter VERSCHIEDENER Spalten schneiden sich weiterhin.
 */
const FAELLIG_FILTER = zustandsFilter<GeraetAnzeigeZeile>([
  {
    wert: "faellig",
    text: "fällig/überfällig",
    trifft: (zeile) => !zeile.keinDatum && zeile.faelligkeitAmpel !== "gruen",
  },
  { wert: "ohneDatum", text: "ohne Datum", trifft: (zeile) => zeile.keinDatum },
]);

const STATUS_FILTER = zustandsFilter<GeraetAnzeigeZeile>([
  { wert: "aktiv", text: "aktiv", trifft: (zeile) => zeile.aktiv },
  { wert: "inaktiv", text: "inaktiv", trifft: (zeile) => !zeile.aktiv },
]);

/** Rot vor gelb vor gruen: was Aufmerksamkeit verlangt, gehoert nach oben. */
const AMPEL_RANG = ["rot", "gelb", "gruen"] as const;

function spalten(
  zeilen: GeraetAnzeigeZeile[],
): NonNullable<TableProps<GeraetAnzeigeZeile>["columns"]> {
  return [
    {
      title: "Gerät",
      dataIndex: "name",
      sorter: nachText<GeraetAnzeigeZeile>((zeile) => zeile.name),
      render: (wert: string, zeile) => (
        <span>
          <Link
            href={`/verwaltung/geraete/${zeile.id}`}
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
      title: "Klasse",
      dataIndex: "typ",
      // Die Liste ist fachlich fest (zwei Klassen) und stammt deshalb
      // ausnahmsweise nicht aus den Daten.
      filters: [
        { text: KLASSE_TEXT.medizin, value: "medizin" },
        { text: KLASSE_TEXT.objekt, value: "objekt" },
      ],
      onFilter: (wert: Filterwert, zeile: GeraetAnzeigeZeile) => zeile.typ === wert,
      render: (wert: GeraetTyp) => (
        <Chip ton="grau" zeichen={wert === "medizin" ? "medizin" : "objekt"}>
          {KLASSE_TEXT[wert]}
        </Chip>
      ),
    },
    {
      title: "Standort",
      dataIndex: "lagerortName",
      sorter: nachText<GeraetAnzeigeZeile>((zeile) => zeile.lagerortName),
      filters: werteAlsFilter(zeilen, (zeile) => zeile.lagerortName),
      onFilter: trifftWert<GeraetAnzeigeZeile>((zeile) => zeile.lagerortName),
    },
    {
      title: "Fälligkeit",
      dataIndex: "chip",
      // Sortiert wird ueber die Ampel, nicht ueber den Chiptext: „in 3 Tagen"
      // und „seit 12 Tagen" ordneten als Zeichenketten beliebig.
      sorter: nachRang<GeraetAnzeigeZeile, GeraetAnzeigeZeile["faelligkeitAmpel"]>(
        (zeile) => zeile.faelligkeitAmpel,
        AMPEL_RANG,
      ),
      filters: FAELLIG_FILTER.filters,
      onFilter: FAELLIG_FILTER.onFilter,
      render: (chip: GeraetAnzeigeZeile["chip"]) => chip === null ? null : (
        <Chip
          ton={chip.ton}
          zeichen={chip.ton === "rot" ? "warnung" : undefined}
        >
          {chip.text}
        </Chip>
      ),
    },
    {
      title: "Status",
      dataIndex: "aktiv",
      sorter: nachJaNein<GeraetAnzeigeZeile>((zeile) => zeile.aktiv),
      filters: STATUS_FILTER.filters,
      onFilter: STATUS_FILTER.onFilter,
      render: (wert: boolean) => wert ? null : <Chip ton="grau">inaktiv</Chip>,
    },
  ];
}

export function GeraeteListe({
  zeilen,
  lagerorte,
}: {
  zeilen: GeraetAnzeigeZeile[];
  lagerorte: Lagerort[];
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
        <Button
          href="/verwaltung/geraete/scan"
          icon={<Ikone name="scannen" groesse={16} />}
        >
          Scannen
        </Button>
        <NeuGeraet lagerorte={lagerorte} />
      </Flex>

      <Datentabelle<GeraetAnzeigeZeile>
        rowKey="id"
        aria-label="Geräte"
        dataSource={gefiltert}
        onChange={(_seite, filter) => setSpaltenFilter(filter)}
        locale={{
          emptyText: hatFilter
            ? "Kein Gerät passt zu Suche und Filter."
            : "Noch keine Geräte. Lege oben das erste an.",
        }}
        columns={spaltenliste}
      />
    </>
  );
}
