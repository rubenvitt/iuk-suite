"use client";

import { useMemo, useState, useTransition } from "react";
import { Alert, Button, Checkbox, Flex, Select, Table } from "antd";
import { SPACE } from "@/core/theme/tokens";
import {
  artikelFiltern,
  LEERER_FILTER,
  type ArtikelFilterZeile,
  type ArtikelFilterZustand,
} from "../../../_lib/artikelFilter";
import {
  bestandExportZeilen, bestandExportDateiname, type BestandExportZeile,
} from "../../../_lib/bestandExport";
import {
  EXCEL_SPALTEN, EXCEL_BLATTNAME, EXCEL_FEHLERTEXT,
} from "../../../_lib/bestandExportSpalten";
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
  const [exportLaeuft, startExport] = useTransition();
  const [exportFehler, setExportFehler] = useState<string | null>(null);

  // Genau diese eine abgeleitete Liste ist Tabellenquelle und Übergabepunkt
  // für den in Teil 6 freigeschalteten Export.
  const gefiltert = useMemo(
    () => artikelSortieren(artikelFiltern(zeilen, filter), sortierung),
    [zeilen, filter, sortierung],
  );

  /**
   * EXCEL-LISTE DES BESTANDS (Spec §9.4, Entscheidung 9-E).
   *
   * Exportiert GENAU das, was gerade in der Tabelle steht — `gefiltert`, also
   * dieselbe abgeleitete Liste, die auch in `dataSource` geht. Das ist keine
   * Bequemlichkeit: der Knopftitel sagt es zu, und sobald die Liste serverseitig
   * paginiert wird, aenderte sich STILL, was „Excel-Liste" bedeutet — aus
   * „alles, was ich gerade sehe" wuerde „die erste Seite" (9-H). Pagination der
   * Artikeltabelle ist damit eine Aenderung an einem Ausgabeformat, kein
   * Oberflaechendetail.
   *
   * Die Bibliothek wird ERST BEIM KLICK nachgeladen, damit sie nicht im
   * Seiten-Bundle landet. Ein rein serverseitiger Export waere ein anderes
   * Produkt: er koennte den Dateinamen aus Serverzeit bilden und kennte den
   * Filterzustand nicht.
   *
   * DER DATEINAME ENTSTEHT AUS BROWSERZEIT (`new Date()`), also aus der Zone des
   * Arbeitsplatzes. Das ist heutiges Verhalten und bleibt es; die TZ-Frage
   * beruehrt dieses Format nicht (§9.4).
   */
  const exportieren = () => {
    setExportFehler(null);
    startExport(async () => {
      try {
        const { default: writeXlsxFile } = await import("write-excel-file/browser");
        const zeilenExport = bestandExportZeilen(gefiltert);
        await writeXlsxFile(zeilenExport, {
          columns: EXCEL_SPALTEN.map((sp) => ({
            header: { value: sp.header, fontWeight: "bold" as const },
            width: sp.width,
            // Zahlen bleiben Zahlen, alles andere ist ausdruecklich Text — die
            // Bibliothek legt es dann als Textzelle an, nie als Formel (9-G).
            cell: (z: BestandExportZeile) =>
              sp.zahl
                ? { value: Number(sp.wert(z)), type: Number }
                : { value: String(sp.wert(z)), type: String },
          })),
          sheet: EXCEL_BLATTNAME,
          stickyRowsCount: 1,
        }).toFile(bestandExportDateiname(new Date()));
      } catch {
        // Der deutsche Satz als ZUSTAND, nie `e.message`: der waere in
        // Produktion der englische Satz ueber eine „server-side exception"
        // (Falle 66, §11.2 d).
        setExportFehler(EXCEL_FEHLERTEXT);
      }
    });
  };

  const hatFilter = filter.suche.trim() !== ""
    || filter.nurUnterMindest
    || filter.nurChargeKritisch
    || filter.ohneInaktive;

  function zuruecksetzen(): void {
    setFilter(LEERER_FILTER);
  }

  return (
    <>
      <Flex gap={SPACE.md} wrap align="center" style={{ marginBlockEnd: SPACE.md }}>
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
        <Button
          data-testid="lb-excel"
          icon={<Ikone name="tabelle" groesse={16} />}
          // ABSICHTLICH `zeilen.length`, NICHT `gefiltert.length` (Brief-Prosa
          // §9.4 Schritt 4: "rows.length === 0" — die Vollmenge dieses Moduls
          // heisst `zeilen`). Ein Suchfilter ohne Treffer deaktiviert den Knopf
          // also NICHT: der Klick erzeugt dann eine Datei mit nur der
          // Kopfzeile, was zum Titel "mit der aktuell angezeigten Liste" passt
          // — die Liste ist eben leer, und genau das wird exportiert. Erst
          // wenn im MODUL ueberhaupt kein Artikel existiert, gibt es nichts,
          // was ein Export je zeigen koennte.
          disabled={exportLaeuft || zeilen.length === 0}
          onClick={exportieren}
          title="Erzeugt eine Excel-Datei (.xlsx) mit der aktuell angezeigten Liste"
          data-export-zeilen={gefiltert.map((zeile) => zeile.id).join(",")}
        >
          {exportLaeuft ? "Erzeuge…" : "Excel-Liste"}
        </Button>
        <NeuArtikel />
      </Flex>
      {exportFehler ? (
        // Gleiches Muster wie NeuArtikel.tsx:134 und die vier Stellen in
        // ArtikelDrawer.tsx — kein Fließtext in Nebentext-Groesze fuer einen
        // Fehler, und `type="warning"` statt `type="error"`: Rot ist in diesem
        // Modul fachlich belegt (CLAUDE.md, Falle 3).
        <Alert
          type="warning"
          showIcon={false}
          title={exportFehler}
          style={{ marginBlockEnd: SPACE.md }}
        />
      ) : null}

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
        // Spaltenkoepfe tragen die Kicker-Rolle ueber `title`, nie ueber CSS
        // gegen `.ant-table-thead` (docs/design/README.md).
        columns={[
          {
            title: <span style={SCHRIFT.feldname}>Artikel</span>,
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
            title: <span style={SCHRIFT.feldname}>Fach</span>,
            dataIndex: "fach",
            render: (wert: string) => <span className={s.fach}>{wert}</span>,
          },
          {
            title: <span style={SCHRIFT.feldname}>Bestand</span>,
            dataIndex: "bestand",
            align: "right",
            render: (wert: number, zeile) => (
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {wert} <span style={SCHRIFT.neben}>{zeile.einheit}</span>
              </span>
            ),
          },
          {
            title: <span style={SCHRIFT.feldname}>Min.</span>,
            dataIndex: "mindestbestand",
            align: "right",
            render: (wert: number) => <span style={SCHRIFT.mono}>{wert}</span>,
          },
          {
            title: <span style={SCHRIFT.feldname}>Nächster Verfall</span>,
            dataIndex: "naechsteCharge",
            render: (_wert: unknown, zeile) => (
              zeile.naechsteCharge && zeile.naechsteAmpel && zeile.naechsteAblaufText
                ? (
                  // 7 liegt nicht auf der SPACE-Skala (4/8/12/16/24/32) und
                  // hat keine Geschwisterzeile in diesem Zuschnitt; bleibt
                  // Literal, siehe Bericht.
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
            title: <span style={SCHRIFT.feldname}>Status</span>,
            dataIndex: "aktiv",
            render: (_wert: boolean, zeile) => (
              // 6 liegt nicht auf der SPACE-Skala; bleibt Literal (wie an den
              // uebrigen Chip-Zeilen dieses Zuschnitts).
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
