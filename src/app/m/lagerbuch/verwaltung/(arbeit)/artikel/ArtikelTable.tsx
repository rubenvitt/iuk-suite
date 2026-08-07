"use client";

import { useMemo, useState } from "react";
import { Button, Checkbox, Flex, Select, Table, Tooltip } from "antd";
import {
  artikelFiltern,
  LEERER_FILTER,
  type ArtikelFilterZeile,
  type ArtikelFilterZustand,
} from "../../../_lib/artikelFilter";
import type { Ampel } from "../../../_lib/domain/verfall";
import { ampelTon } from "../../../_lib/format";
import { SCHRIFT } from "../../../_lib/schrift";
import { ArtikelDrawer } from "../../../_ui/ArtikelDrawer";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import { Plakette } from "../../../_ui/Plakette";
import { Suchfeld } from "../../../_ui/Suchfeld";
import { Trefferanzeige } from "../../../_ui/Trefferanzeige";
import s from "../../../_ui/verwaltung.module.css";
import { NeuArtikel } from "./NeuArtikel";

export type ArtikelAnzeigeZeile = ArtikelFilterZeile & {
  id: string;
  einheit: string;
  mindestbestand: number;
  bestand: number;
  naechsteAmpel: Ampel | null;
  naechsteAblaufText: string | null;
};

type FahrzeugOption = {
  id: string;
  name: string;
  kennung: string | null;
};

export const SORTIERUNGEN = [
  { wert: "name-asc", label: "Name A–Z" },
  { wert: "name-desc", label: "Name Z–A" },
  { wert: "fach", label: "Fach" },
  { wert: "bestand-asc", label: "Bestand aufsteigend" },
  { wert: "bestand-desc", label: "Bestand absteigend" },
  { wert: "verfall", label: "Nächster Verfall" },
] as const;

export type ArtikelSortierung = (typeof SORTIERUNGEN)[number]["wert"];

function nameVergleichen(a: ArtikelAnzeigeZeile, b: ArtikelAnzeigeZeile): number {
  return a.name.localeCompare(b.name, "de") || a.id.localeCompare(b.id);
}

function artikelVergleichen(sortierung: ArtikelSortierung) {
  switch (sortierung) {
    case "name-desc":
      return (a: ArtikelAnzeigeZeile, b: ArtikelAnzeigeZeile) => (
        b.name.localeCompare(a.name, "de") || a.id.localeCompare(b.id)
      );
    case "fach":
      return (a: ArtikelAnzeigeZeile, b: ArtikelAnzeigeZeile) => (
        a.fach.localeCompare(b.fach, "de") || nameVergleichen(a, b)
      );
    case "bestand-asc":
      return (a: ArtikelAnzeigeZeile, b: ArtikelAnzeigeZeile) => (
        a.bestand - b.bestand || nameVergleichen(a, b)
      );
    case "bestand-desc":
      return (a: ArtikelAnzeigeZeile, b: ArtikelAnzeigeZeile) => (
        b.bestand - a.bestand || nameVergleichen(a, b)
      );
    case "verfall":
      return (a: ArtikelAnzeigeZeile, b: ArtikelAnzeigeZeile) => {
        const av = a.naechsteCharge?.verfall;
        const bv = b.naechsteCharge?.verfall;
        if (av === undefined && bv === undefined) return nameVergleichen(a, b);
        if (av === undefined) return 1;
        if (bv === undefined) return -1;
        return av.localeCompare(bv) || nameVergleichen(a, b);
      };
    default:
      return nameVergleichen;
  }
}

/**
 * Eine totale, nicht mutierende Ordnung. Teil 6 bindet seinen Export an genau
 * das Ergebnis, das die Tabelle bereits verwendet.
 */
export function artikelSortieren(
  zeilen: ArtikelAnzeigeZeile[],
  sortierung: ArtikelSortierung,
): ArtikelAnzeigeZeile[] {
  return [...zeilen].sort(artikelVergleichen(sortierung));
}

export function ArtikelTable({
  zeilen,
  fahrzeuge,
}: {
  zeilen: ArtikelAnzeigeZeile[];
  fahrzeuge: FahrzeugOption[];
}) {
  const [filter, setFilter] = useState<ArtikelFilterZustand>(LEERER_FILTER);
  const [sortierung, setSortierung] = useState<ArtikelSortierung>("name-asc");
  const [offenerArtikel, setOffenerArtikel] = useState<string | null>(null);

  // Genau diese eine abgeleitete Liste ist Tabellenquelle und Übergabepunkt
  // für den in Teil 6 freigeschalteten Export.
  const gefiltert = useMemo(
    () => artikelSortieren(artikelFiltern(zeilen, filter), sortierung),
    [zeilen, filter, sortierung],
  );

  const hatFilter = filter.suche.trim() !== ""
    || filter.nurUnterMindest
    || filter.nurChargeKritisch
    || filter.ohneInaktive;

  function zuruecksetzen(): void {
    setFilter(LEERER_FILTER);
  }

  return (
    <>
      <Flex gap={12} wrap align="center" style={{ marginBlockEnd: 12 }}>
        <Suchfeld
          wert={filter.suche}
          onWert={(suche) => setFilter((vorher) => ({ ...vorher, suche }))}
          platzhalter="Artikel, Fach oder Charge suchen…"
        />
        <Checkbox
          checked={filter.nurUnterMindest}
          onChange={(ereignis) => setFilter((vorher) => ({
            ...vorher,
            nurUnterMindest: ereignis.target.checked,
          }))}
        >
          unter Mindestbestand
        </Checkbox>
        <Checkbox
          checked={filter.nurChargeKritisch}
          onChange={(ereignis) => setFilter((vorher) => ({
            ...vorher,
            nurChargeKritisch: ereignis.target.checked,
          }))}
        >
          Charge kritisch
        </Checkbox>
        <Checkbox
          checked={filter.ohneInaktive}
          onChange={(ereignis) => setFilter((vorher) => ({
            ...vorher,
            ohneInaktive: ereignis.target.checked,
          }))}
        >
          inaktive ausblenden
        </Checkbox>
        <Select<ArtikelSortierung>
          value={sortierung}
          onChange={setSortierung}
          options={SORTIERUNGEN.map((option) => ({
            value: option.wert,
            label: option.label,
          }))}
          aria-label="Sortierung"
          virtual={false}
          style={{ minWidth: 200 }}
        />
        {hatFilter ? (
          <Button
            icon={<Ikone name="zuruecksetzen" groesse={16} />}
            onClick={zuruecksetzen}
          >
            Zurücksetzen
          </Button>
        ) : null}
        <Trefferanzeige gezeigt={gefiltert.length} gesamt={zeilen.length} />
        <Tooltip title="Excel-Liste — kommt mit den Ausgabeformaten (Teil 6, §9.4)">
          <span title="Excel-Liste — kommt mit den Ausgabeformaten (Teil 6, §9.4)">
            <Button
              icon={<Ikone name="tabelle" groesse={16} />}
              disabled
              data-export-zeilen={gefiltert.map((zeile) => zeile.id).join(",")}
            >
              Excel-Liste
            </Button>
          </span>
        </Tooltip>
        <NeuArtikel />
      </Flex>

      <Table<ArtikelAnzeigeZeile>
        rowKey="id"
        pagination={false}
        scroll={{ x: "max-content" }}
        aria-label="Artikel und Bestand"
        dataSource={gefiltert}
        locale={{
          emptyText: hatFilter
            ? "Kein Artikel passt zu Suche und Filter."
            : "Noch keine Artikel. Lege oben den ersten an.",
        }}
        onRow={(zeile) => ({ onClick: () => setOffenerArtikel(zeile.id) })}
        columns={[
          {
            title: "Artikel",
            dataIndex: "name",
            render: (wert: string, zeile) => (
              <Button
                type="link"
                style={{ padding: 0, fontWeight: 600 }}
                onClick={() => setOffenerArtikel(zeile.id)}
              >
                {wert}
              </Button>
            ),
          },
          {
            title: "Fach",
            dataIndex: "fach",
            render: (wert: string) => <span className={s.fach}>{wert}</span>,
          },
          {
            title: "Bestand",
            dataIndex: "bestand",
            align: "right",
            render: (wert: number, zeile) => (
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {wert} <span style={SCHRIFT.neben}>{zeile.einheit}</span>
              </span>
            ),
          },
          {
            title: "Min.",
            dataIndex: "mindestbestand",
            align: "right",
            render: (wert: number) => <span style={SCHRIFT.mono}>{wert}</span>,
          },
          {
            title: "Nächster Verfall",
            dataIndex: "naechsteCharge",
            render: (_wert: unknown, zeile) => (
              zeile.naechsteCharge && zeile.naechsteAmpel && zeile.naechsteAblaufText
                ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <Plakette
                      verfall={zeile.naechsteCharge.verfall}
                      ampel={zeile.naechsteAmpel}
                      statusText={zeile.naechsteAblaufText}
                    />
                    <span style={SCHRIFT.mono}>{zeile.naechsteCharge.chargenNr}</span>
                  </span>
                )
                : <Chip ton="grau">leer</Chip>
            ),
          },
          {
            title: "Status",
            dataIndex: "aktiv",
            render: (_wert: boolean, zeile) => (
              <Flex gap={6} wrap>
                {!zeile.aktiv ? <Chip ton="grau">inaktiv</Chip> : null}
                {zeile.aktiv && !zeile.unterMindest && !zeile.naechsteAblaufText
                  ? <Chip ton="ok">ok</Chip>
                  : null}
                {zeile.unterMindest
                  ? <Chip ton="rot" zeichen="warnung">unter Mindestbestand</Chip>
                  : null}
                {zeile.naechsteAblaufText && zeile.naechsteAmpel
                  ? (
                    <Chip ton={ampelTon(zeile.naechsteAmpel)}>
                      Charge {zeile.naechsteAblaufText}
                    </Chip>
                  )
                  : null}
              </Flex>
            ),
          },
        ]}
      />

      {offenerArtikel ? (
        <ArtikelDrawer
          key={offenerArtikel}
          id={offenerArtikel}
          fahrzeuge={fahrzeuge}
          onSchliessen={() => setOffenerArtikel(null)}
        />
      ) : null}
    </>
  );
}
