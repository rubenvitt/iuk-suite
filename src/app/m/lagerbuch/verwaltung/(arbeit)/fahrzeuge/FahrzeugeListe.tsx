"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Flex } from "antd";
import type { TableProps } from "antd";
import {
  Datentabelle,
  nachDatum,
  nachText,
  nachZahl,
  trifftWert,
  useEntprellt,
  werteAlsFilter,
  zustandsFilter,
} from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import { SCHRIFT } from "../../../_lib/schrift";
import { falte } from "../../../_lib/suche";
import { Chip } from "../../../_ui/Chip";
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
  /** ISO-Zeitstempel — allein fuer die Sortierung, nie angezeigt. */
  letzterCheckIso: string | null;
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

/**
 * DIE DREI HAKEN VON FRUEHER SIND SPALTENFILTER GEWORDEN.
 *
 * Ueber der Tabelle standen „unter Soll", „laeuft ab" und „inaktive
 * ausblenden" — jeder davon ein Praedikat ueber der Zeile, und ein Praedikat
 * ueber der Zeile ist ein Spaltenfilter. Sie sitzen jetzt dort, wo ihre Wirkung
 * sichtbar wird: im Kopf der Statusspalte, in der auch die zugehoerigen Chips
 * stehen.
 *
 * ⚠️ MEHRERE HAKEN VERODERN SICH, sie schneiden sich nicht — das ist antds
 * Verhalten fuer `filters` und dasselbe, was `zustandsFilter` festhaelt.
 */
const STATUS_FILTER = zustandsFilter<FahrzeugAnzeigeZeile>([
  { wert: "unterSoll", text: "unter Soll", trifft: (zeile) => zeile.artikelUnterSoll > 0 },
  { wert: "laeuftAb", text: "läuft ab", trifft: (zeile) => zeile.verfallAuffaellig > 0 },
  { wert: "aufSoll", text: "auf Soll", trifft: (zeile) => zeile.positionen > 0 && zeile.artikelUnterSoll === 0 },
  { wert: "inaktiv", text: "inaktiv", trifft: (zeile) => !zeile.aktiv },
]);

function spalten(
  zeilen: FahrzeugAnzeigeZeile[],
): TableProps<FahrzeugAnzeigeZeile>["columns"] {
  return [
    {
      title: "Fahrzeug",
      dataIndex: "name",
      sorter: nachText<FahrzeugAnzeigeZeile>((zeile) => zeile.name),
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
      title: "Vorlage",
      dataIndex: "templateName",
      sorter: nachText<FahrzeugAnzeigeZeile>((zeile) => zeile.templateName),
      filters: werteAlsFilter(zeilen, (zeile) => zeile.templateName, {
        ohneWertLabel: "ohne Vorlage",
      }),
      onFilter: trifftWert<FahrzeugAnzeigeZeile>((zeile) => zeile.templateName),
      render: (wert: string | null) => wert ? (
        <Chip ton="grau">{wert}</Chip>
      ) : (
        <span style={SCHRIFT.neben}>—</span>
      ),
    },
    {
      title: "Bestückung",
      dataIndex: "positionen",
      // Gezeigt wird „12 Positionen · 3 Faecher", sortiert wird ueber die Zahl.
      sorter: nachZahl<FahrzeugAnzeigeZeile>((zeile) => zeile.positionen),
      render: (_wert: number, zeile) => (
        <span style={SCHRIFT.neben}>
          {zeile.positionen} {zeile.positionen === 1 ? "Position" : "Positionen"}
          {" · "}
          {zeile.faecher} {zeile.faecher === 1 ? "Fach" : "Fächer"}
        </span>
      ),
    },
    {
      title: "Status",
      dataIndex: "aktiv",
      // Die Zahl der Artikel unter Soll ordnet die Spalte fachlich: absteigend
      // steht oben, was Aufmerksamkeit verlangt.
      sorter: nachZahl<FahrzeugAnzeigeZeile>((zeile) => zeile.artikelUnterSoll),
      filters: STATUS_FILTER.filters,
      onFilter: STATUS_FILTER.onFilter,
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
      title: "Zuletzt geprüft",
      dataIndex: "letzterCheckText",
      // ⚠️ Ueber `letzterCheckIso`, nie ueber den Anzeigetext — Begruendung an
      // der Zeilenquelle (`fahrzeuge/page.tsx`).
      sorter: nachDatum<FahrzeugAnzeigeZeile>((zeile) => zeile.letzterCheckIso),
      render: (wert: string | null) => (
        <span style={SCHRIFT.neben}>{wert ?? "noch nie geprüft"}</span>
      ),
    },
  ];
}

export function FahrzeugeListe({ zeilen }: { zeilen: FahrzeugAnzeigeZeile[] }) {
  const [suche, setSuche] = useState("");
  // Das FELD bleibt unentprellt, entprellt wird die Ableitung: ohne das filtert
  // und rendert jeder Tastendruck die ganze Liste neu.
  const sucheNachlauf = useEntprellt(suche);
  // Ein gesetzter Spaltenfilter ist von hier aus nur ueber `onChange` sichtbar —
  // und nur er entscheidet, ob der Leertext „passt zu Suche und Filter" oder
  // „noch keine Fahrzeuge" heissen muss.
  const [spaltenFilterAktiv, setSpaltenFilterAktiv] = useState(false);

  const gefiltert = useMemo(
    () => zeilen.filter((zeile) => sucheTrifft(zeile, sucheNachlauf)),
    [zeilen, sucheNachlauf],
  );

  const spaltenliste = useMemo(() => spalten(zeilen), [zeilen]);
  const hatFilter = sucheNachlauf.trim() !== "" || spaltenFilterAktiv;

  return (
    <>
      <Flex gap={SPACE.md} wrap align="center" style={{ marginBlockEnd: SPACE.md }}>
        <Suchfeld
          wert={suche}
          onWert={setSuche}
          platzhalter="Fahrzeug oder Kennung suchen…"
        />
        {/* Zaehlt die Freitextsuche, nicht die Spaltenfilter — deren Wirkung
            steht sichtbar im Spaltenkopf. */}
        <Trefferanzeige gezeigt={gefiltert.length} gesamt={zeilen.length} />
        <NeuFahrzeug />
      </Flex>

      <Datentabelle<FahrzeugAnzeigeZeile>
        rowKey="id"
        aria-label="Fahrzeuge"
        dataSource={gefiltert}
        onChange={(_seite, filter) => {
          setSpaltenFilterAktiv(
            Object.values(filter).some((werte) => (werte?.length ?? 0) > 0),
          );
        }}
        locale={{
          emptyText: hatFilter
            ? "Kein Fahrzeug passt zu Suche und Filter."
            : "Noch keine Fahrzeuge. Lege oben das erste an.",
        }}
        columns={spaltenliste}
      />
    </>
  );
}
