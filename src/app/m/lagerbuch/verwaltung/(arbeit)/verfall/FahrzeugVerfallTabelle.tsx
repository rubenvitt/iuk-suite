"use client";

/**
 * Die im Fahrzeug gemeldeten Verfaelle — als Tabelle statt als Aufzaehlung
 * (DRK-298).
 *
 * ⚠️ EIGENE CLIENT-INSEL, UND ZWAR ZWINGEND. `verfall/page.tsx` ist eine Server
 * Component; ein `columns[].render`, das dort entstuende, ist eine gewoehnliche
 * Funktion, und React lehnt es ab, sie ueber die RSC-Grenze zu reichen —
 * HTTP 500 fuer die ganze Seite, das weder `build` noch Vitest sieht (Falle 9,
 * `CLAUDE.md`). Die Insel bekommt ausschliesslich JSON-sichere Skalare;
 * insbesondere loest die Server Component die Ampel ueber `ampelTon()` in einen
 * TON auf, statt den `Ampel`-Wert zu reichen.
 *
 * WARUM HIER EINE TABELLE UND IN DER KARTE DARUEBER NICHT: siehe den Kopf von
 * `page.tsx`. Kurz — die Handlager-Zeilen tragen eine Aktion und eine Plakette,
 * diese hier tragen ihren Meldekontext, und der ist tabellarisch.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Flex } from "antd";
import type { TableProps } from "antd";
import {
  Datentabelle,
  type FilterZustand,
  nachText,
  trifftWert,
  useEntprellt,
  wendeFilterAn,
  werteAlsFilter,
  zustandsFilter,
} from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import type { AmpelTon } from "../../../_lib/format";
import { SCHRIFT } from "../../../_lib/schrift";
import { falte } from "../../../_lib/suche";
import { Chip } from "../../../_ui/Chip";
import { Suchfeld } from "../../../_ui/Suchfeld";
import { Trefferanzeige } from "../../../_ui/Trefferanzeige";

export type FahrzeugVerfallZeile = {
  /** `${lagerortId}:${artikelId}` — je Paar gibt es hoechstens eine Meldung. */
  schluessel: string;
  fahrzeugId: string;
  fahrzeugName: string;
  fahrzeugKennung: string | null;
  artikelName: string;
  /**
   * ⚠️ "YYYY-MM" — DER SORTIERWERT, NIE ANGEZEIGT. Als Anzeigetext ordnete
   * „01/2027" vor „05/2026", und die Spalte waere still falsch, sobald ein
   * Jahreswechsel in der Liste liegt. Dasselbe Muster wie `letzterCheckIso`
   * in der Fahrzeugliste.
   */
  verfall: string;
  verfallText: string;
  statusTon: AmpelTon;
  statusText: string;
  abgelaufen: boolean;
  gemeldetText: string;
};

/** SUCHFELDMENGE: Fahrzeug, Kennung und Artikel — was auf der Zeile steht. */
export function sucheTrifft(zeile: FahrzeugVerfallZeile, begriff: string): boolean {
  const suche = falte(begriff.trim());
  return suche === ""
    || falte(
      `${zeile.fahrzeugName} ${zeile.fahrzeugKennung ?? ""} ${zeile.artikelName}`,
    ).includes(suche);
}

/**
 * ⚠️ ZWEI ZUSTAENDE, UND DER ZWEITE IST NICHT „alles andere". Die Liste enthaelt
 * ohnehin nur Auffaelliges (der Lesepfad filtert gruen heraus), „läuft ab"
 * heisst hier also „warnend, aber noch nicht abgelaufen". Ohne das Gegenstueck
 * liesse sich „zeig mir nur, was noch Zeit hat" gar nicht anklicken.
 */
const STATUS_FILTER = zustandsFilter<FahrzeugVerfallZeile>([
  { wert: "abgelaufen", text: "abgelaufen", trifft: (zeile) => zeile.abgelaufen },
  { wert: "laeuftAb", text: "läuft ab", trifft: (zeile) => !zeile.abgelaufen },
]);

function spalten(
  zeilen: FahrzeugVerfallZeile[],
): NonNullable<TableProps<FahrzeugVerfallZeile>["columns"]> {
  return [
    {
      title: "Fahrzeug",
      dataIndex: "fahrzeugName",
      key: "fahrzeug",
      sorter: nachText<FahrzeugVerfallZeile>((zeile) => zeile.fahrzeugName),
      // Die Filterliste entsteht aus den DATEN — es steht also nie ein
      // Fahrzeug im Menue, das keine Meldung hat.
      filters: werteAlsFilter(zeilen, (zeile) => zeile.fahrzeugName),
      onFilter: trifftWert<FahrzeugVerfallZeile>((zeile) => zeile.fahrzeugName),
      render: (name: string, zeile) => (
        <span>
          <Link
            href={`/verwaltung/fahrzeuge/${zeile.fahrzeugId}`}
            style={{ fontWeight: 600 }}
          >
            {name}
          </Link>
          {zeile.fahrzeugKennung ? (
            <span style={{ ...SCHRIFT.mono, marginInlineStart: SPACE.sm }}>
              {zeile.fahrzeugKennung}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      title: "Artikel",
      dataIndex: "artikelName",
      key: "artikel",
      sorter: nachText<FahrzeugVerfallZeile>((zeile) => zeile.artikelName),
    },
    {
      title: "Verfall",
      dataIndex: "verfallText",
      key: "verfall",
      // ⚠️ Ueber `verfall` ("YYYY-MM"), nie ueber `verfallText`. Begruendung
      // am Feld.
      sorter: nachText<FahrzeugVerfallZeile>((zeile) => zeile.verfall),
      render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
    },
    {
      title: "Status",
      dataIndex: "statusText",
      key: "status",
      filters: STATUS_FILTER.filters,
      onFilter: STATUS_FILTER.onFilter,
      render: (text: string, zeile) => (
        <Chip ton={zeile.statusTon} zeichen={zeile.abgelaufen ? "warnung" : "verfall"}>
          {text}
        </Chip>
      ),
    },
    {
      title: "Gemeldet",
      dataIndex: "gemeldetText",
      key: "gemeldet",
      render: (text: string) => <span style={SCHRIFT.neben}>{text}</span>,
    },
  ];
}

export function FahrzeugVerfallTabelle({ zeilen }: { zeilen: FahrzeugVerfallZeile[] }) {
  const [suche, setSuche] = useState("");
  // Das FELD bleibt unentprellt, entprellt wird die Ableitung.
  const sucheNachlauf = useEntprellt(suche);
  /**
   * ⚠️ DER ZUSTAND WIRD GEMERKT, NICHT DIE LISTE (Falle 15). `onChange` feuert
   * nur bei Bedienung DER TABELLE; tippt jemand daneben in die Suche, filtert
   * antd zwar neu, meldet es aber nicht — und die Trefferanzeige stuende still
   * auf der Zahl von vorhin.
   */
  const [spaltenFilter, setSpaltenFilter] = useState<FilterZustand>({});

  const gefiltert = useMemo(
    () => zeilen.filter((zeile) => sucheTrifft(zeile, sucheNachlauf)),
    [zeilen, sucheNachlauf],
  );
  const spaltenliste = useMemo(() => spalten(zeilen), [zeilen]);
  const angezeigt = wendeFilterAn(gefiltert, spaltenliste, spaltenFilter);

  return (
    <>
      <Flex gap={SPACE.md} wrap align="center" style={{ marginBlockEnd: SPACE.md }}>
        <Suchfeld
          wert={suche}
          onWert={setSuche}
          platzhalter="Fahrzeug, Kennung oder Artikel suchen…"
        />
        <Trefferanzeige gezeigt={angezeigt.length} gesamt={zeilen.length} />
      </Flex>

      <Datentabelle<FahrzeugVerfallZeile>
        rowKey="schluessel"
        aria-label="Verfallsmeldungen aus Fahrzeugen"
        dataSource={gefiltert}
        onChange={(_seite, filter) => setSpaltenFilter(filter)}
        locale={{ emptyText: "Keine Meldung passt zu Suche und Filter." }}
        columns={spaltenliste}
      />
    </>
  );
}
