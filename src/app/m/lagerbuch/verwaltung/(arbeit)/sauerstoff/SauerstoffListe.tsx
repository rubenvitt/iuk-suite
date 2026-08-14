"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Checkbox, Flex, Progress, Table } from "antd";
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

export function SauerstoffListe({
  zeilen,
  lagerorte,
}: {
  zeilen: SauerstoffAnzeigeZeile[];
  lagerorte: { id: string; name: string }[];
}) {
  const [suche, setSuche] = useState("");
  const [nurNiedrig, setNurNiedrig] = useState(false);
  const [ohneInaktive, setOhneInaktive] = useState(false);

  const gefiltert = useMemo(() => zeilen.filter((zeile) => {
    if (nurNiedrig && zeile.status?.niedrig !== true) return false;
    if (ohneInaktive && !zeile.aktiv) return false;
    return sucheTrifft(zeile, suche);
  }), [zeilen, suche, nurNiedrig, ohneInaktive]);

  const filterAktiv = suche.trim() !== "" || nurNiedrig || ohneInaktive;

  return (
    <>
      <Flex gap={SPACE.md} wrap align="center" style={{ marginBlockEnd: SPACE.md }}>
        <Suchfeld
          wert={suche}
          onWert={setSuche}
          platzhalter="Flasche oder Lagerort suchen…"
        />
        <Checkbox
          checked={nurNiedrig}
          onChange={(ereignis) => setNurNiedrig(ereignis.target.checked)}
        >
          nur niedriger Druck
        </Checkbox>
        <Checkbox
          checked={ohneInaktive}
          onChange={(ereignis) => setOhneInaktive(ereignis.target.checked)}
        >
          inaktive ausblenden
        </Checkbox>
        <Trefferanzeige gezeigt={gefiltert.length} gesamt={zeilen.length} />
        <NeuFlasche lagerorte={lagerorte} />
      </Flex>

      <Table<SauerstoffAnzeigeZeile>
        rowKey="id"
        pagination={false}
        scroll={{ x: "max-content" }}
        aria-label="Sauerstoffflaschen"
        dataSource={gefiltert}
        locale={{
          emptyText: filterAktiv
            ? "Keine Sauerstoffflasche passt zu den Filtern."
            : "Noch keine Sauerstoffflaschen vorhanden. Lege oben die erste an.",
        }}
        columns={[
          {
            title: <span style={SCHRIFT.feldname}>Flasche</span>,
            dataIndex: "name",
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
            title: <span style={SCHRIFT.feldname}>Druck</span>,
            dataIndex: "letzterDruck",
            align: "right",
            render: (wert: number | null) => (
              <span style={SCHRIFT.mono}>{wert === null ? "–" : `${wert} bar`}</span>
            ),
          },
          {
            title: <span style={SCHRIFT.feldname}>Füllstand</span>,
            dataIndex: "status",
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
            title: <span style={SCHRIFT.feldname}>Herkunft</span>,
            dataIndex: "herkunft",
            render: (wert: SauerstoffAnzeigeZeile["herkunft"]) => wert === null ? (
              <span style={SCHRIFT.neben}>—</span>
            ) : (
              <Chip ton="grau">{wert === "check" ? "aus Check" : "manuell"}</Chip>
            ),
          },
          {
            title: <span style={SCHRIFT.feldname}>Größe</span>,
            dataIndex: "groesseLiter",
            render: (wert: number | null, zeile) => (
              <span style={SCHRIFT.neben}>
                {wert === null ? "" : `${wert} l · `}
                Nenndruck {zeile.nennfuelldruckBar} bar
              </span>
            ),
          },
          {
            title: <span style={SCHRIFT.feldname}>Status</span>,
            dataIndex: "aktiv",
            render: (wert: boolean) => wert ? null : <Chip ton="grau">inaktiv</Chip>,
          },
        ]}
      />
    </>
  );
}
