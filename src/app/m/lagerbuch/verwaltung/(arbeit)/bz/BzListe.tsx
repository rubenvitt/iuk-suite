"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Checkbox, Flex, Table } from "antd";
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
    `${zeile.name} ${zeile.barcode ?? ""} ${zeile.lagerortName}`,
  ).includes(suche);
}

export function BzListe({
  zeilen,
  lagerorte,
}: {
  zeilen: BzAnzeigeZeile[];
  lagerorte: LagerortOption[];
}) {
  const [suche, setSuche] = useState("");
  const [nurFaellig, setNurFaellig] = useState(false);
  const [ohneInaktive, setOhneInaktive] = useState(false);

  const gefiltert = useMemo(() => zeilen.filter((zeile) => {
    if (nurFaellig && !zeile.faellig) return false;
    if (ohneInaktive && !zeile.aktiv) return false;
    return sucheTrifft(zeile, suche);
  }), [zeilen, suche, nurFaellig, ohneInaktive]);

  const hatFilter = suche.trim() !== "" || nurFaellig || ohneInaktive;

  function zuruecksetzen(): void {
    setSuche("");
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
        <Checkbox
          checked={nurFaellig}
          onChange={(ereignis) => setNurFaellig(ereignis.target.checked)}
        >
          fällig/überfällig
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
        <Button href="/verwaltung/bz/scan" icon={<Ikone name="scannen" groesse={16} />}>
          Scannen
        </Button>
        <NeuBzGeraet lagerorte={lagerorte} />
      </Flex>

      <Table<BzAnzeigeZeile>
        rowKey="id"
        pagination={false}
        scroll={{ x: "max-content" }}
        aria-label="BZ-Geräte"
        dataSource={gefiltert}
        locale={{
          emptyText: hatFilter
            ? "Kein Gerät passt zu Suche und Filter."
            : "Noch keine BZ-Geräte. Lege oben das erste an.",
        }}
        columns={[
          {
            title: "Gerät",
            dataIndex: "name",
            render: (wert: string, zeile) => (
              <span>
                <Link
                  href={`/verwaltung/bz/${zeile.id}`}
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
          { title: "Standort", dataIndex: "lagerortName" },
          {
            title: "Fälligkeit",
            dataIndex: "faelligkeitText",
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
            render: (wert: string | null) => (
              <span style={SCHRIFT.mono}>{wert ?? "–"}</span>
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
