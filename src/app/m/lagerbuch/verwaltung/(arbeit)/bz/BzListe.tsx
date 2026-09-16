"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Flex } from "antd";
import type { TableProps } from "antd";
import {
  Datentabelle,
  filterAktiv,
  type FilterZustand,
  nachDatum,
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
import { falte } from "../../../_lib/suche";
import { SCHRIFT } from "../../../_lib/schrift";
import type { LagerortOption } from "../../../_lib/lesepfade/bz";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import { Suchfeld } from "../../../_ui/Suchfeld";
import { Trefferanzeige } from "../../../_ui/Trefferanzeige";
import type { BzAnzeigeZeile } from "./bzAnzeige";
import { NeuBzGeraet } from "./NeuBzGeraet";

/**
 * ⚠️ BEMERKUNG UND HINWEIS SIND DURCHSUCHBAR, UND DAS STEHT AUCH IM
 * PLATZHALTER (DRK-311). Eine Suche, die still mehr findet, als sie ankuendigt,
 * ist genauso irrefuehrend wie eine, die zu wenig findet: wer „Display" tippt
 * und ein Geraet bekommt, dessen Name das Wort nicht enthaelt, haelt die Liste
 * fuer kaputt.
 */
function sucheTrifft(zeile: BzAnzeigeZeile, begriff: string): boolean {
  const suche = falte(begriff.trim());
  return suche === "" || falte(
    `${zeile.name} ${zeile.barcode ?? ""} ${zeile.standortText} `
      + `${zeile.letzteBemerkungText ?? ""} ${zeile.beachtungHinweis ?? ""}`,
  ).includes(suche);
}

/**
 * DIE BEIDEN HAKEN VON FRUEHER SIND SPALTENFILTER GEWORDEN.
 *
 * Ueber der Tabelle standen „faellig/ueberfaellig" und „inaktive ausblenden" —
 * beides Praedikate ueber der Zeile, und ein Praedikat ueber der Zeile ist ein
 * Spaltenfilter. Sie sitzen jetzt im Kopf der Spalte, deren Chip sie meinen.
 */
const FAELLIG_FILTER = zustandsFilter<BzAnzeigeZeile>([
  { wert: "faellig", text: "fällig/überfällig", trifft: (zeile) => zeile.faellig },
  { wert: "imBereich", text: "nicht fällig", trifft: (zeile) => !zeile.faellig },
]);

const STATUS_FILTER = zustandsFilter<BzAnzeigeZeile>([
  { wert: "aktiv", text: "aktiv", trifft: (zeile) => zeile.aktiv },
  { wert: "inaktiv", text: "inaktiv", trifft: (zeile) => !zeile.aktiv },
]);

/**
 * DRK-311 — „zeig mir alles, was Beachtung braucht" ist die Frage, wegen der
 * diese Spalte ueberhaupt existiert. Ohne Filter muesste man sie suchen, und
 * gesucht wird in einer Liste, in der die meisten Zeilen leer bleiben, nicht.
 */
const BEACHTUNG_FILTER = zustandsFilter<BzAnzeigeZeile>([
  {
    wert: "beachten",
    text: "Beachtung nötig",
    trifft: (zeile) => zeile.beachtungHinweis !== null,
  },
  {
    wert: "ohne",
    text: "ohne Hinweis",
    trifft: (zeile) => zeile.beachtungHinweis === null,
  },
]);

/** Rot vor gelb vor ok: was Aufmerksamkeit verlangt, gehoert nach oben. */
const AMPEL_RANG = ["rot", "gelb", "grau", "ok"] as const;

function spalten(zeilen: BzAnzeigeZeile[]): NonNullable<TableProps<BzAnzeigeZeile>["columns"]> {
  return [
    {
      title: "Gerät",
      dataIndex: "name",
      sorter: nachText<BzAnzeigeZeile>((zeile) => zeile.name),
      render: (wert: string, zeile) => (
        <span>
          <Link
            href={`/verwaltung/bz/${zeile.id}`}
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
      title: "Standort",
      dataIndex: "standortText",
      sorter: nachText<BzAnzeigeZeile>((zeile) => zeile.standortText),
      filters: werteAlsFilter(zeilen, (zeile) => zeile.standortText),
      onFilter: trifftWert<BzAnzeigeZeile>((zeile) => zeile.standortText),
    },
    {
      title: "Fälligkeit",
      dataIndex: "faelligkeitText",
      // Sortiert wird ueber die Ampel, nicht ueber den Text: „fällig in 8
      // Tagen" und „überfällig (seit 3 Tagen)" ordneten als Zeichenketten
      // beliebig.
      sorter: nachRang<BzAnzeigeZeile, AmpelTon>(
        (zeile) => zeile.faelligkeitTon,
        AMPEL_RANG,
      ),
      filters: FAELLIG_FILTER.filters,
      onFilter: FAELLIG_FILTER.onFilter,
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
      // ⚠️ Ueber `letzteKontrolleIso`, nie ueber den Anzeigetext — Begruendung
      // an der Zeilenquelle (`bz/bzAnzeige.ts`).
      sorter: nachDatum<BzAnzeigeZeile>((zeile) => zeile.letzteKontrolleIso),
      render: (wert: string | null) => (
        <span style={SCHRIFT.mono}>{wert ?? "–"}</span>
      ),
    },
    {
      /*
       * DRK-311. ⚠️ „Letzte Bemerkung", NICHT „Bemerkung": der Text gehoert zu
       * der Kontrolle, deren Zeitpunkt in der Spalte davor steht, und ist kein
       * Merkmal des Geraets. Ohne das Wort liest sich ein drei Wochen alter
       * Satz wie ein aktueller Zustand.
       */
      title: "Letzte Bemerkung",
      dataIndex: "letzteBemerkungText",
      /*
       * ⚠️ KEIN CHIP UND KEINE FARBE. Eine Bemerkung ist eine Auskunft, keine
       * Bewertung — „Nicht jede Bemerkung automatisch als Warnung
       * interpretieren" (Gespraechsnotiz DRK-311). Wer Aufmerksamkeit braucht,
       * traegt sie in der Spalte daneben.
       */
      render: (text: string | null) => (
        text ?? <span style={SCHRIFT.neben}>—</span>
      ),
    },
    {
      title: "Beachtung",
      dataIndex: "beachtungHinweis",
      filters: BEACHTUNG_FILTER.filters,
      onFilter: BEACHTUNG_FILTER.onFilter,
      /*
       * ⚠️ GELB, NICHT ROT (Falle 3, §6.6.5): `colorError` ist `colorPrimary`
       * ist Suite-Rot, und Rot traegt in diesem Modul fachliche Bedeutung —
       * „ueberfaellig" und „nicht bestanden" stehen in den Spalten daneben
       * schon darin. Ein roter Aufmerksamkeitshinweis waere von einem
       * Missstand nicht mehr zu unterscheiden.
       *
       * ⚠️ DER HINWEISTEXT STEHT IM CHIP, nicht ein Wort wie „ja". Der Chip
       * traegt immer Text, nie nur Farbe (`_ui/Chip.tsx`) — und hier ist der
       * Text die ganze Aussage: ein gelber Punkt ohne Begruendung ist genau
       * der Zustand, den das Ticket ausschliesst.
       */
      render: (hinweis: string | null, zeile) => (
        hinweis === null
          ? <span style={SCHRIFT.neben}>—</span>
          : (
            <Chip ton="gelb" zeichen="warnung" title={zeile.beachtungSeitText ?? undefined}>
              {hinweis}
            </Chip>
          )
      ),
    },
    {
      title: "Status",
      dataIndex: "aktiv",
      sorter: nachJaNein<BzAnzeigeZeile>((zeile) => zeile.aktiv),
      filters: STATUS_FILTER.filters,
      onFilter: STATUS_FILTER.onFilter,
      render: (wert: boolean) => wert ? null : <Chip ton="grau">inaktiv</Chip>,
    },
  ];
}

export function BzListe({
  zeilen,
  lagerorte,
}: {
  zeilen: BzAnzeigeZeile[];
  lagerorte: LagerortOption[];
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
          platzhalter="Gerät, Barcode, Lagerort oder Bemerkung suchen…"
        />
        <Trefferanzeige gezeigt={angezeigt.length} gesamt={zeilen.length} />
        <Button href="/verwaltung/bz/scan" icon={<Ikone name="scannen" groesse={16} />}>
          Scannen
        </Button>
        <NeuBzGeraet lagerorte={lagerorte} />
      </Flex>

      <Datentabelle<BzAnzeigeZeile>
        rowKey="id"
        aria-label="BZ-Geräte"
        dataSource={gefiltert}
        onChange={(_seite, filter) => setSpaltenFilter(filter)}
        locale={{
          emptyText: hatFilter
            ? "Kein Gerät passt zu Suche und Filter."
            : "Noch keine BZ-Geräte. Lege oben das erste an.",
        }}
        columns={spaltenliste}
      />
    </>
  );
}
