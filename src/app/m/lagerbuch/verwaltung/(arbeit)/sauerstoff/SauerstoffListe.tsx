"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Flex, Progress } from "antd";
import type { TableProps } from "antd";
import {
  Datentabelle,
  nachJaNein,
  nachText,
  nachZahl,
  useEntprellt,
  zustandsFilter,
  type Filterwert,
} from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
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
  return !q || falte(`${z.name} ${z.lagerortName}`).includes(q);
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
    text: "niedriger Druck",
    trifft: (zeile) => zeile.status?.niedrig === true,
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

const SPALTEN: TableProps<SauerstoffAnzeigeZeile>["columns"] = [
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
          {zeile.lagerortName}
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
        {zeile.status.niedrig ? (
          <Chip ton="rot" zeichen="warnung">niedriger Druck</Chip>
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
        Nenndruck {zeile.nennfuelldruckBar} bar
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
  lagerorte: { id: string; name: string }[];
}) {
  const [suche, setSuche] = useState("");
  // Das FELD bleibt unentprellt, entprellt wird die Ableitung.
  const sucheNachlauf = useEntprellt(suche);
  const [spaltenFilterAktiv, setSpaltenFilterAktiv] = useState(false);

  const gefiltert = useMemo(
    () => zeilen.filter((zeile) => sucheTrifft(zeile, sucheNachlauf)),
    [zeilen, sucheNachlauf],
  );

  const filterAktiv = sucheNachlauf.trim() !== "" || spaltenFilterAktiv;

  return (
    <>
      <Flex gap={SPACE.md} wrap align="center" style={{ marginBlockEnd: SPACE.md }}>
        <Suchfeld
          wert={suche}
          onWert={setSuche}
          platzhalter="Flasche oder Lagerort suchen…"
        />
        {/* Zaehlt die Freitextsuche, nicht die Spaltenfilter. */}
        <Trefferanzeige gezeigt={gefiltert.length} gesamt={zeilen.length} />
        <NeuFlasche lagerorte={lagerorte} />
      </Flex>

      <Datentabelle<SauerstoffAnzeigeZeile>
        rowKey="id"
        aria-label="Sauerstoffflaschen"
        dataSource={gefiltert}
        onChange={(_seite, filter) => {
          setSpaltenFilterAktiv(
            Object.values(filter).some((werte) => (werte?.length ?? 0) > 0),
          );
        }}
        locale={{
          emptyText: filterAktiv
            ? "Keine Sauerstoffflasche passt zu den Filtern."
            : "Noch keine Sauerstoffflaschen vorhanden. Lege oben die erste an.",
        }}
        columns={SPALTEN}
      />
    </>
  );
}
