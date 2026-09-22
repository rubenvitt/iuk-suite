"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Flex, Progress } from "antd";
import type { TableProps } from "antd";
import {
  Kartentabelle,
  filterAktiv,
  type Filterwert,
  type FilterZustand,
  nachJaNein,
  nachText,
  nachZahl,
  useEntprellt,
  wendeFilterAn,
  zustandsFilter,
} from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import { standortZeile } from "../../../_lib/konstanten";
import type { LagerortOption as Lagerort } from "../../../_lib/lesepfade/bz";
import { ampelTon } from "../../../_lib/format";
import { SCHRIFT } from "../../../_lib/schrift";
import { falte } from "../../../_lib/suche";
import type { O2FlascheZeile } from "../../../_lib/lesepfade/o2";
import { Chip } from "../../../_ui/Chip";
import { Suchfeld } from "../../../_ui/Suchfeld";
import { Trefferanzeige } from "../../../_ui/Trefferanzeige";
import { NeuFlasche } from "./NeuFlasche";

/**
 * Die Client-Grenze bekommt keine Date-Instanz. Der Server formatiert den
 * Zeitpunkt fertig; alle verbleibenden Werte sind JSON-sichere Skalare.
 */
export type SauerstoffAnzeigeZeile = Omit<O2FlascheZeile, "letzteMessung"> & {
  letzteMessungText: string | null;
};

/** SUCHFELDMENGE 4 VON 6: Name · Lagerort. */
export function sucheTrifft(z: SauerstoffAnzeigeZeile, begriff: string): boolean {
  const q = falte(begriff.trim());
  return !q || falte(`${z.name} ${standortZeile(z.lagerortStandort)}`).includes(q);
}

/**
 * DIE BEIDEN HAKEN VON FRUEHER SIND SPALTENFILTER GEWORDEN.
 *
 * Ueber der Tabelle standen „nur niedriger Druck" und „inaktive ausblenden" —
 * beides Praedikate ueber der Zeile, und ein Praedikat ueber der Zeile ist ein
 * Spaltenfilter. Sie sitzen jetzt im Kopf der Spalte, deren Chip sie meinen.
 */
const FUELLSTAND_FILTER = zustandsFilter<SauerstoffAnzeigeZeile>([
  {
    wert: "niedrig",
    text: "Wechsel fällig",
    trifft: (zeile) => zeile.status?.wechseln === true,
  },
  {
    wert: "ohneMessung",
    text: "keine Messung",
    trifft: (zeile) => zeile.status === null,
  },
]);

const STATUS_FILTER = zustandsFilter<SauerstoffAnzeigeZeile>([
  { wert: "aktiv", text: "aktiv", trifft: (zeile) => zeile.aktiv },
  { wert: "inaktiv", text: "inaktiv", trifft: (zeile) => !zeile.aktiv },
]);

const SPALTEN: NonNullable<TableProps<SauerstoffAnzeigeZeile>["columns"]> = [
  {
    title: "Flasche",
    dataIndex: "name",
    sorter: nachText<SauerstoffAnzeigeZeile>((zeile) => zeile.name),
    render: (wert: string, zeile) => (
      <span>
        <Link
          href={`/verwaltung/sauerstoff/${zeile.id}`}
          style={{ fontWeight: 600 }}
        >
          {wert}
        </Link>
        <span style={{ ...SCHRIFT.mono, marginInlineStart: SPACE.sm }}>
          {standortZeile(zeile.lagerortStandort)}
        </span>
      </span>
    ),
  },
  {
    title: "Druck",
    dataIndex: "letzterDruck",
    align: "right",
    // Gezeigt wird „120 bar", sortiert wird ueber die nackte Zahl.
    sorter: nachZahl<SauerstoffAnzeigeZeile>((zeile) => zeile.letzterDruck),
    render: (wert: number | null) => (
      <span style={SCHRIFT.mono}>{wert === null ? "–" : `${wert} bar`}</span>
    ),
  },
  {
    title: "Füllstand",
    dataIndex: "status",
    sorter: nachZahl<SauerstoffAnzeigeZeile>((zeile) => zeile.status?.prozent),
    filters: FUELLSTAND_FILTER.filters,
    onFilter: FUELLSTAND_FILTER.onFilter,
    render: (_: unknown, zeile) => zeile.status === null ? (
      <Chip ton="grau">keine Messung</Chip>
    ) : (
      <span style={{ display: "inline-flex", alignItems: "center", gap: SPACE.sm }}>
        <Progress
          percent={zeile.status.prozent}
          showInfo={false}
          style={{ width: 80 }}
        />
        <Chip ton={ampelTon(zeile.status.ampel)}>
          {zeile.status.prozent} %
        </Chip>
        {/* ⚠️ DER HINWEIS NENNT SEINEN GRENZWERT (DRK-308). Er ist je Flasche
            einstellbar; ohne die Zahl daneben liesse ein roter Chip offen, ab
            wann er gilt, und man muesste die Stammdaten aufschlagen, um ihn zu
            verstehen. */}
        {zeile.status.wechseln ? (
          <Chip ton="rot" zeichen="warnung">
            Wechsel fällig – ab {zeile.status.wechselAbBar} bar
          </Chip>
        ) : null}
      </span>
    ),
  },
  {
    title: "Herkunft",
    dataIndex: "herkunft",
    filters: [
      { text: "aus Check", value: "check" },
      { text: "manuell", value: "manuell" },
    ],
    onFilter: (wert: Filterwert, zeile: SauerstoffAnzeigeZeile) =>
      zeile.herkunft === wert,
    render: (wert: SauerstoffAnzeigeZeile["herkunft"]) => wert === null ? (
      <span style={SCHRIFT.neben}>—</span>
    ) : (
      <Chip ton="grau">{wert === "check" ? "aus Check" : "manuell"}</Chip>
    ),
  },
  {
    title: "Größe",
    dataIndex: "groesseLiter",
    sorter: nachZahl<SauerstoffAnzeigeZeile>((zeile) => zeile.groesseLiter),
    render: (wert: number | null, zeile) => (
      <span style={SCHRIFT.neben}>
        {wert === null ? "" : `${wert} l · `}
        Nenndruck {zeile.nennfuelldruckBar} bar · Wechsel ab {zeile.wechselAbProzent} %
      </span>
    ),
  },
  {
    title: "Status",
    dataIndex: "aktiv",
    sorter: nachJaNein<SauerstoffAnzeigeZeile>((zeile) => zeile.aktiv),
    filters: STATUS_FILTER.filters,
    onFilter: STATUS_FILTER.onFilter,
    render: (wert: boolean) => wert ? null : <Chip ton="grau">inaktiv</Chip>,
  },
];

export function SauerstoffListe({
  zeilen,
  lagerorte,
}: {
  zeilen: SauerstoffAnzeigeZeile[];
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

  // Was WIRKLICH in der Tabelle steht: Suche UND Spaltenfilter. antd wendet
  // dieselben Praedikate danach noch einmal an — beide Schritte sind idempotent.
  const angezeigt = wendeFilterAn(gefiltert, SPALTEN, spaltenFilter);
  const hatFilter = sucheNachlauf.trim() !== "" || filterAktiv(spaltenFilter);

  return (
    <>
      <Flex gap={SPACE.md} wrap align="center" style={{ marginBlockEnd: SPACE.md }}>
        <Suchfeld
          wert={suche}
          onWert={setSuche}
          platzhalter="Flasche oder Lagerort suchen…"
        />
        <Trefferanzeige gezeigt={angezeigt.length} gesamt={zeilen.length} />
        <NeuFlasche lagerorte={lagerorte} />
      </Flex>

      <Kartentabelle<SauerstoffAnzeigeZeile>
        rowKey="id"
        aria-label="Sauerstoffflaschen"
        dataSource={gefiltert}
        filter={spaltenFilter}
        onFilter={setSpaltenFilter}
        leer={{
          nichts: "Noch keine Sauerstoffflaschen vorhanden. Lege oben die erste an.",
          gefiltert: "Keine Sauerstoffflasche passt zu den Filtern.",
          // ⚠️ `hatFilter` SCHLIESST DIE SUCHE MIT EIN, die dieses Bauteil
          // nicht sieht — ohne den Wink hielte es eine leergesuchte Liste
          // für eine leere Datenbank.
          aktiv: hatFilter,
        }}
        columns={SPALTEN}
      />
    </>
  );
}
