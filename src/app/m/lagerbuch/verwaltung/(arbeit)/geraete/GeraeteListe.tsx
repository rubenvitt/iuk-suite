"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Checkbox, Flex, Table } from "antd";
import type { AmpelTon } from "../../../_lib/format";
import type { GeraetTyp } from "../../../_lib/domain/geraet";
import { toggleInSet } from "../../../_lib/mengen";
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

export function GeraeteListe({
  zeilen,
  lagerorte,
}: {
  zeilen: GeraetAnzeigeZeile[];
  lagerorte: { id: string; name: string; typ: "lager" | "fahrzeug" }[];
}) {
  const [suche, setSuche] = useState("");
  const [klassen, setKlassen] = useState<ReadonlySet<GeraetTyp>>(new Set());
  const [nurFaellig, setNurFaellig] = useState(false);
  const [ohneInaktive, setOhneInaktive] = useState(false);

  const gefiltert = useMemo(() => zeilen.filter((zeile) => {
    if (klassen.size > 0 && !klassen.has(zeile.typ)) return false;
    if (nurFaellig && (zeile.keinDatum || zeile.faelligkeitAmpel === "gruen")) return false;
    if (ohneInaktive && !zeile.aktiv) return false;
    return sucheTrifft(zeile, suche);
  }), [zeilen, suche, klassen, nurFaellig, ohneInaktive]);

  const hatFilter = suche.trim() !== ""
    || klassen.size > 0
    || nurFaellig
    || ohneInaktive;

  const klasseUmschalten = (typ: GeraetTyp) => () => {
    setKlassen((aktuell) => toggleInSet(aktuell, typ));
  };

  function zuruecksetzen(): void {
    setSuche("");
    setKlassen(new Set());
    setNurFaellig(false);
    setOhneInaktive(false);
  }

  return (
    <>
      <Flex gap={12} wrap align="center" style={{ marginBlockEnd: 12 }}>
        <Suchfeld
          wert={suche}
          onWert={setSuche}
          platzhalter="Gerät, Barcode oder Lagerort suchen…"
        />
        <Checkbox.Group
          value={[...klassen]}
          options={[
            {
              value: "medizin",
              onChange: klasseUmschalten("medizin"),
              label: (
                <span><Ikone name="medizin" groesse={12} /> Medizin</span>
              ),
            },
            {
              value: "objekt",
              onChange: klasseUmschalten("objekt"),
              label: (
                <span><Ikone name="objekt" groesse={12} /> Objekt</span>
              ),
            },
          ]}
        />
        <Checkbox
          checked={nurFaellig}
          onChange={(ereignis) => setNurFaellig(ereignis.target.checked)}
        >
          nur fällige
        </Checkbox>
        <Checkbox
          checked={ohneInaktive}
          onChange={(ereignis) => setOhneInaktive(ereignis.target.checked)}
        >
          inaktive ausblenden
        </Checkbox>
        {hatFilter ? (
          <Button
            icon={<Ikone name="zuruecksetzen" groesse={16} />}
            onClick={zuruecksetzen}
          >
            Zurücksetzen
          </Button>
        ) : null}
        <Trefferanzeige gezeigt={gefiltert.length} gesamt={zeilen.length} />
        <Button
          href="/verwaltung/geraete/scan"
          icon={<Ikone name="scannen" groesse={16} />}
        >
          Scannen
        </Button>
        <NeuGeraet lagerorte={lagerorte} />
      </Flex>

      <Table<GeraetAnzeigeZeile>
        rowKey="id"
        pagination={false}
        scroll={{ x: "max-content" }}
        aria-label="Geräte"
        dataSource={gefiltert}
        locale={{
          emptyText: hatFilter
            ? "Kein Gerät passt zu Suche und Filter."
            : "Noch keine Geräte. Lege oben das erste an.",
        }}
        columns={[
          {
            title: "Gerät",
            dataIndex: "name",
            render: (wert: string, zeile) => (
              <span>
                <Link
                  href={`/verwaltung/geraete/${zeile.id}`}
                  style={{ fontWeight: 600 }}
                >
                  {wert}
                </Link>
                {zeile.barcode ? (
                  <span style={{ ...SCHRIFT.mono, marginInlineStart: 8 }}>
                    {zeile.barcode}
                  </span>
                ) : null}
              </span>
            ),
          },
          {
            title: "Klasse",
            dataIndex: "typ",
            render: (wert: GeraetTyp) => (
              <Chip ton="grau" zeichen={wert === "medizin" ? "medizin" : "objekt"}>
                {wert === "medizin" ? "Medizin" : "Objekt"}
              </Chip>
            ),
          },
          { title: "Standort", dataIndex: "lagerortName" },
          {
            title: "Fälligkeit",
            dataIndex: "chip",
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
            render: (wert: boolean) => wert ? null : <Chip ton="grau">inaktiv</Chip>,
          },
        ]}
      />
    </>
  );
}
