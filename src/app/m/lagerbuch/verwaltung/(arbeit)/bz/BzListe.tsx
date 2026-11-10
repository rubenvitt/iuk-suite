"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Flex } from "antd";
import type { TableProps } from "antd";
import {
  Kartentabelle,
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
  Zellentext,
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
import { verwaltungDetailPfad } from "../../../_lib/verwaltungPfad";

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

/**
 * IDA-393 — DIE LESEBREITE DER BEIDEN FREITEXTE. Bei 1280px hat der Inhalt 984px; mit den
 * 40ch der Vorgabe standen Bemerkung und Hinweis zusammen bei 880px und schoben die Liste um
 * 800px aus dem Rahmen. 18ch tragen drei Zeilen à rund zwanzig Zeichen — der volle Satz steht
 * im `title` und ungekürzt im Logbuch des Gerätes.
 */
const LESEBREITE = { maxWidth: "18ch" } as const;

/** „RTW 1 · RTW · HN-DRK-1101" → Name oben, der Rest leise darunter. */
function standortZeilen(text: string): [string, string | null] {
  const trenner = text.indexOf(" · ");
  return trenner < 0 ? [text, null] : [text.slice(0, trenner), text.slice(trenner + 3)];
}

function spalten(zeilen: BzAnzeigeZeile[]): NonNullable<TableProps<BzAnzeigeZeile>["columns"]> {
  return [
    {
      title: "Gerät",
      dataIndex: "name",
      sorter: nachText<BzAnzeigeZeile>((zeile) => zeile.name),
      // IDA-393: der Barcode steht UNTER dem Namen, nicht daneben — nebeneinander war die
      // Spalte 295px breit.
      render: (wert: string, zeile) => (
        <>
          <Link
            href={verwaltungDetailPfad("bz", zeile.id)}
            style={{ fontWeight: 600 }}
          >
            {wert}
          </Link>
          {zeile.barcode ? (
            <div style={{ ...SCHRIFT.mono, ...SCHRIFT.neben }}>{zeile.barcode}</div>
          ) : null}
        </>
      ),
    },
    {
      // IDA-393: direkt hinter dem Namen, damit „inaktiv" bei 1280px nicht hinter dem Rand liegt.
      title: "Status",
      dataIndex: "aktiv",
      sorter: nachJaNein<BzAnzeigeZeile>((zeile) => zeile.aktiv),
      filters: STATUS_FILTER.filters,
      onFilter: STATUS_FILTER.onFilter,
      render: (wert: boolean) => wert ? null : <Chip ton="grau">inaktiv</Chip>,
    },
    {
      title: "Standort",
      dataIndex: "standortText",
      sorter: nachText<BzAnzeigeZeile>((zeile) => zeile.standortText),
      filters: werteAlsFilter(zeilen, (zeile) => zeile.standortText),
      onFilter: trifftWert<BzAnzeigeZeile>((zeile) => zeile.standortText),
      render: (wert: string) => {
        const [ort, art] = standortZeilen(wert);
        return (
          <>
            <div>{ort}</div>
            {art ? <div style={SCHRIFT.neben}>{art}</div> : null}
          </>
        );
      },
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
      /*
       * DRK-311, IDA-393. Die BEMERKUNG steht unter dem Zeitpunkt der Kontrolle, zu der sie
       * gehoert — bis IDA-393 als eigene Spalte „Letzte Bemerkung" daneben. ⚠️ Sie bleibt eine
       * Auskunft ueber DIESE Kontrolle und kein Merkmal des Geraets; deshalb steht sie unter
       * dem Datum und nicht unter dem Namen. ⚠️ KEIN CHIP UND KEINE FARBE: eine Bemerkung ist
       * keine Bewertung — wer Aufmerksamkeit braucht, traegt sie in der Spalte „Beachtung".
       *
       * ⚠️ `zeilen` IST HIER RICHTIG UND AUF DEM GERAETEBLATT FALSCH (DRK-372):
       * eine Hoehendeckelung darf nur dort stehen, wo der volle Satz noch
       * woanders ungekuerzt zu LESEN ist — das Logbuch ist genau dieses
       * Woanders und deckelt deshalb allein die Breite.
       */
      render: (wert: string | null, zeile) => (
        <>
          <div style={SCHRIFT.mono}>{wert ?? "–"}</div>
          {zeile.letzteBemerkungText === null ? null : (
            <Zellentext text={zeile.letzteBemerkungText} zeilen={3} style={LESEBREITE} />
          )}
        </>
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
       * ⚠️ CHIP UND HINWEIS SIND GETRENNT, und das war in Reviewrunde 2 nicht
       * mehr verhandelbar: `.chip` steht auf `white-space: nowrap`
       * (`verwaltung.module.css`). Ein Hinweis von 500 Zeichen waere darin EINE
       * unbrechbare Zeile und schoebe die halbe Tabelle aus dem Bild. Der Chip
       * ist der Status, der Text darunter (IDA-393: darunter, nicht daneben)
       * der Hinweis — „ein gelber Status MIT verstaendlichem Hinweis".
       *
       * ⚠️ „beachten" IST TEXT, nicht nur Farbe (`_ui/Chip.tsx`). Die Standzeit
       * steht im `title` — eine Zusatzangabe, keine Aussage, die man zum
       * Verstehen braucht.
       */
      render: (hinweis: string | null, zeile) => (
        hinweis === null
          ? <span style={SCHRIFT.neben}>—</span>
          : (
            <Flex vertical gap={SPACE.xs} align="flex-start">
              <Chip ton="gelb" zeichen="warnung" title={zeile.beachtungSeitText ?? undefined}>
                beachten
              </Chip>
              <Zellentext text={hinweis} zeilen={3} style={LESEBREITE} />
            </Flex>
          )
      ),
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

      <Kartentabelle<BzAnzeigeZeile>
        rowKey="id"
        aria-label="BZ-Geräte"
        dataSource={gefiltert}
        filter={spaltenFilter}
        onFilter={setSpaltenFilter}
        leer={{
          nichts: "Noch keine BZ-Geräte",
          figur: "lagerbuch",
          gefiltert: "Kein Gerät passt zu Suche und Filter.",
          // ⚠️ `hatFilter` SCHLIESST DIE SUCHE MIT EIN, die dieses Bauteil
          // nicht sieht — ohne den Wink hielte es eine leergesuchte Liste
          // für eine leere Datenbank.
          aktiv: hatFilter,
        }}
        columns={spaltenliste}
      />
    </>
  );
}
