"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Checkbox, Flex, Table } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { SCHRIFT } from "../../../_lib/schrift";
import { falte } from "../../../_lib/suche";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import { Suchfeld } from "../../../_ui/Suchfeld";
import { Trefferanzeige } from "../../../_ui/Trefferanzeige";
import { NeuFahrzeug } from "./NeuFahrzeug";

/**
 * Die Client-Insel erhaelt ausschliesslich JSON-sichere Skalare. Insbesondere
 * formatiert die Server Component den Zeitpunkt des letzten Checks vorab.
 */
export type FahrzeugAnzeigeZeile = {
  id: string;
  name: string;
  kennung: string | null;
  aktiv: boolean;
  templateName: string | null;
  positionen: number;
  faecher: number;
  artikelUnterSoll: number;
  verfallAuffaellig: number;
  letzterCheckText: string | null;
};

/** SUCHFELDMENGE 2 VON 6: Name und Kennung. */
export function sucheTrifft(
  zeile: FahrzeugAnzeigeZeile,
  begriff: string,
): boolean {
  const suche = falte(begriff.trim());
  return suche === ""
    || falte(`${zeile.name} ${zeile.kennung ?? ""}`).includes(suche);
}

export function FahrzeugeListe({ zeilen }: { zeilen: FahrzeugAnzeigeZeile[] }) {
  const [suche, setSuche] = useState("");
  const [unterSoll, setUnterSoll] = useState(false);
  const [laeuftAb, setLaeuftAb] = useState(false);
  const [ohneInaktive, setOhneInaktive] = useState(false);

  const gefiltert = useMemo(() => zeilen.filter((zeile) => {
    if (unterSoll && zeile.artikelUnterSoll === 0) return false;
    if (laeuftAb && zeile.verfallAuffaellig === 0) return false;
    if (ohneInaktive && !zeile.aktiv) return false;
    return sucheTrifft(zeile, suche);
  }), [zeilen, suche, unterSoll, laeuftAb, ohneInaktive]);

  const hatFilter = suche.trim() !== "" || unterSoll || laeuftAb || ohneInaktive;

  function zuruecksetzen(): void {
    setSuche("");
    setUnterSoll(false);
    setLaeuftAb(false);
    setOhneInaktive(false);
  }

  return (
    <>
      <Flex gap={SPACE.md} wrap align="center" style={{ marginBlockEnd: SPACE.md }}>
        <Suchfeld
          wert={suche}
          onWert={setSuche}
          platzhalter="Fahrzeug oder Kennung suchen…"
        />
        <Checkbox
          checked={unterSoll}
          onChange={(ereignis) => setUnterSoll(ereignis.target.checked)}
        >
          unter Soll
        </Checkbox>
        <Checkbox
          checked={laeuftAb}
          onChange={(ereignis) => setLaeuftAb(ereignis.target.checked)}
        >
          läuft ab
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
        <NeuFahrzeug />
      </Flex>

      <Table<FahrzeugAnzeigeZeile>
        rowKey="id"
        pagination={false}
        scroll={{ x: "max-content" }}
        aria-label="Fahrzeuge"
        dataSource={gefiltert}
        locale={{
          emptyText: hatFilter
            ? "Kein Fahrzeug passt zu Suche und Filter."
            : "Noch keine Fahrzeuge. Lege oben das erste an.",
        }}
        columns={[
          {
            title: <span style={SCHRIFT.feldname}>Fahrzeug</span>,
            dataIndex: "name",
            render: (wert: string, zeile) => (
              <span>
                <Link
                  href={`/verwaltung/fahrzeuge/${zeile.id}`}
                  style={{ fontWeight: 600 }}
                >
                  {wert}
                </Link>
                {zeile.kennung ? (
                  <span style={{ ...SCHRIFT.mono, marginInlineStart: SPACE.sm }}>
                    {zeile.kennung}
                  </span>
                ) : null}
              </span>
            ),
          },
          {
            title: <span style={SCHRIFT.feldname}>Vorlage</span>,
            dataIndex: "templateName",
            render: (wert: string | null) => wert ? (
              <Chip ton="grau">{wert}</Chip>
            ) : (
              <span style={SCHRIFT.neben}>—</span>
            ),
          },
          {
            title: <span style={SCHRIFT.feldname}>Bestückung</span>,
            dataIndex: "positionen",
            render: (_wert: number, zeile) => (
              <span style={SCHRIFT.neben}>
                {zeile.positionen} {zeile.positionen === 1 ? "Position" : "Positionen"}
                {" · "}
                {zeile.faecher} {zeile.faecher === 1 ? "Fach" : "Fächer"}
              </span>
            ),
          },
          {
            title: <span style={SCHRIFT.feldname}>Status</span>,
            dataIndex: "aktiv",
            render: (_wert: boolean, zeile) => (
              // 6 liegt nicht auf der SPACE-Skala (4/8/12/16/24/32) — enger
              // Chip-Zeilenabstand, wie in ArtikelTable.tsx (Aufgabe 8), bleibt
              // Literal statt auf einen sichtbar groeberen Wert gerundet.
              <Flex gap={6} wrap>
                {!zeile.aktiv ? <Chip ton="grau">inaktiv</Chip> : null}
                {zeile.artikelUnterSoll > 0 ? (
                  <Chip ton="rot" zeichen="warnung">
                    {zeile.artikelUnterSoll} unter Soll
                  </Chip>
                ) : null}
                {zeile.verfallAuffaellig > 0 ? (
                  <Chip ton="gelb" zeichen="verfall">
                    {zeile.verfallAuffaellig} läuft ab
                  </Chip>
                ) : null}
                {zeile.positionen > 0 && zeile.artikelUnterSoll === 0 ? (
                  <Chip ton="ok">auf Soll</Chip>
                ) : null}
              </Flex>
            ),
          },
          {
            title: <span style={SCHRIFT.feldname}>Zuletzt geprüft</span>,
            dataIndex: "letzterCheckText",
            render: (wert: string | null) => (
              <span style={SCHRIFT.neben}>{wert ?? "noch nie geprüft"}</span>
            ),
          },
        ]}
      />
    </>
  );
}
