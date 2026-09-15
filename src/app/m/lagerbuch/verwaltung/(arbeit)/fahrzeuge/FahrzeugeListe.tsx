"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Flex } from "antd";
import type { TableProps } from "antd";
import {
  Datentabelle,
  filterAktiv,
  type FilterZustand,
  nachDatum,
  nachText,
  nachZahl,
  trifftWert,
  useEntprellt,
  wendeFilterAn,
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
  /**
   * DIE BEIDEN ZAHLEN SIND UEBERSCHNEIDUNGSFREI und kommen so aus
   * `fahrzeugUebersicht` — hier wird nicht nachgerechnet. Begruendung dort.
   */
  verfallAbgelaufen: number;
  verfallWarnend: number;
  /** Ob ueberhaupt ein Verfall gepflegt ist — GRUENE eingeschlossen. */
  verfallGepflegt: boolean;
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
 * DIE DREI HAKEN VON FRUEHER SIND SPALTENFILTER GEWORDEN — AUF ZWEI SPALTEN.
 *
 * Ueber der Tabelle standen „unter Soll", „laeuft ab" und „inaktive
 * ausblenden" — jeder davon ein Praedikat ueber der Zeile, und ein Praedikat
 * ueber der Zeile ist ein Spaltenfilter.
 *
 * ⚠️ DASS ES ZWEI GRUPPEN SIND, IST DER GANZE PUNKT. antd VERODERT mehrere
 * Werte EINER Spalte und VERUNDET zwischen Spalten (`zustandsFilter` haelt das
 * fest). Lagen alle vier Zustaende auf der Statusspalte, war „aktiv UND unter
 * Soll" NICHT AUSDRUECKBAR — obwohl genau das mit den alten, unabhaengigen
 * Haken der Normalfall war. Die Bestueckungszustaende gehoeren deshalb an die
 * Bestueckungsspalte, aktiv/inaktiv an die Statusspalte.
 *
 * ⚠️ UND JEDER ZUSTAND BRAUCHT SEIN GEGENSTUECK. Der alte Haken war ein
 * AUSSCHLUSS („inaktive ausblenden"), ein Spaltenfilter ist ein EINSCHLUSS:
 * ohne „aktiv" liesse sich der alte Vorgang gar nicht mehr anklicken. Dieselbe
 * Umkehrung hatte die Artikeltabelle (DRK-331, zweite Reviewrunde); die
 * Geschwisterlisten `geraete`, `bz` und `sauerstoff` fuehren das Paar laengst.
 */
const BESTUECKUNG_FILTER = zustandsFilter<FahrzeugAnzeigeZeile>([
  { wert: "unterSoll", text: "unter Soll", trifft: (zeile) => zeile.artikelUnterSoll > 0 },
  { wert: "aufSoll", text: "auf Soll", trifft: (zeile) => zeile.positionen > 0 && zeile.artikelUnterSoll === 0 },
]);

/**
 * ⚠️ „laeuft ab" HAT EINE EIGENE SPALTE, UND DAS IST DER GANZE GRUND FUER SIE.
 *
 * Die drei alten Haken waren UNABHAENGIG und wirkten nacheinander — sie
 * SCHNITTEN sich also: „unter Soll" UND „laeuft ab" zeigte Fahrzeuge, auf die
 * beides zutrifft. Auf EINER Spalte verodert antd sie, und genau dieser Vorgang
 * waere nicht mehr ausdrueckbar (DRK-331, sechste Reviewrunde). Drei
 * unabhaengige Bedingungen brauchen drei Spalten; die Verfallszahl hatte bis
 * dahin keine und teilte sich den Statuschip mit allem anderen.
 */
const VERFALL_FILTER = zustandsFilter<FahrzeugAnzeigeZeile>([
  { wert: "abgelaufen", text: "abgelaufen",
    trifft: (zeile) => zeile.verfallAbgelaufen > 0 },
  { wert: "laeuftAb", text: "läuft ab",
    trifft: (zeile) => zeile.verfallWarnend > 0 },
  /**
   * ⚠️ DER FILTERTEXT IST DERSELBE WIE DER CHIPTEXT, und das ist keine
   * Kosmetik: wer „im gruenen Bereich" ankreuzt, muss in der Spalte darunter
   * dasselbe Wort wiederfinden. Zwei Namen fuer einen Zustand lassen den Leser
   * einen dritten vermuten.
   */
  { wert: "verfallRuhig", text: "im grünen Bereich",
    trifft: (zeile) => zeile.verfallGepflegt
      && zeile.verfallAbgelaufen === 0 && zeile.verfallWarnend === 0 },
  { wert: "verfallLeer", text: "nichts erfasst",
    trifft: (zeile) => !zeile.verfallGepflegt },
]);

/**
 * Wie dringend ist dieses Fahrzeug? EIN Rang, damit die Spalte ihn sortieren
 * kann.
 *
 * ⚠️ NICHT DIE SUMME. `abgelaufen + warnend` stellte fuenf gelbe Meldungen vor
 * eine abgelaufene — fuer jemanden, der eine Austauschtour plant, die falsche
 * Reihenfolge. Abgelaufenes wiegt deshalb ueberhaupt erst einmal schwerer, und
 * die Menge entscheidet nur INNERHALB derselben Dringlichkeit. Der Faktor ist
 * gross genug, dass keine erreichbare Zahl warnender Meldungen ihn einholt.
 */
function verfallRang(zeile: FahrzeugAnzeigeZeile): number {
  return zeile.verfallAbgelaufen * 1_000_000 + zeile.verfallWarnend;
}

const STATUS_FILTER = zustandsFilter<FahrzeugAnzeigeZeile>([
  { wert: "aktiv", text: "aktiv", trifft: (zeile) => zeile.aktiv },
  { wert: "inaktiv", text: "inaktiv", trifft: (zeile) => !zeile.aktiv },
]);

function spalten(
  zeilen: FahrzeugAnzeigeZeile[],
): NonNullable<TableProps<FahrzeugAnzeigeZeile>["columns"]> {
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
      filters: BESTUECKUNG_FILTER.filters,
      onFilter: BESTUECKUNG_FILTER.onFilter,
      render: (_wert: number, zeile) => (
        <span style={SCHRIFT.neben}>
          {zeile.positionen} {zeile.positionen === 1 ? "Position" : "Positionen"}
          {" · "}
          {zeile.faecher} {zeile.faecher === 1 ? "Fach" : "Fächer"}
        </span>
      ),
    },
    {
      title: "Verfall",
      dataIndex: "verfallAbgelaufen",
      key: "verfall",
      sorter: nachZahl<FahrzeugAnzeigeZeile>(verfallRang),
      filters: VERFALL_FILTER.filters,
      onFilter: VERFALL_FILTER.onFilter,
      /**
       * ⚠️ ABGELAUFENES BEKOMMT EINEN EIGENEN, ROTEN CHIP (DRK-298).
       *
       * Vorher stand hier EINE Zahl aus rot und gelb in EINEM gelben Chip: ein
       * Fahrzeug mit drei abgelaufenen Artikeln sah aus wie eins, bei dem in
       * drei Monaten etwas faellig wird. Rot traegt in diesem Modul fachliche
       * Bedeutung, und genau hier fehlte sie.
       *
       * ⚠️ UND DIE BEIDEN LEERFAELLE SIND NICHT DERSELBE. „gepflegt, nichts
       * faellig" ist eine Entwarnung, „nichts erfasst" ist eine Wissensluecke —
       * beides als „—" zu zeigen behauptet Entwarnung fuer ein Fahrzeug, das
       * nie jemand angesehen hat.
       */
      render: (_wert: number, zeile) => {
        if (zeile.verfallAbgelaufen === 0 && zeile.verfallWarnend === 0) {
          return zeile.verfallGepflegt
            ? <Chip ton="ok">im grünen Bereich</Chip>
            : <Chip ton="grau">nichts erfasst</Chip>;
        }
        return (
          // 6 liegt nicht auf der SPACE-Skala (4/8/12/16/24/32) — enger
          // Chip-Zeilenabstand wie in der Statusspalte daneben.
          <Flex gap={6} wrap>
            {zeile.verfallAbgelaufen > 0 ? (
              <Chip ton="rot" zeichen="warnung">
                {zeile.verfallAbgelaufen} abgelaufen
              </Chip>
            ) : null}
            {zeile.verfallWarnend > 0 ? (
              <Chip ton="gelb" zeichen="verfall">
                {zeile.verfallWarnend} läuft ab
              </Chip>
            ) : null}
          </Flex>
        );
      },
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
  /**
   * ⚠️ DER ZUSTAND WIRD GEMERKT, NICHT DIE LISTE (Falle 15). `onChange` feuert
   * nur bei Bedienung DER TABELLE — tippt jemand daneben in die Suche, filtert
   * antd zwar neu, meldet es aber nicht. Aus dem Zustand folgt die angezeigte
   * Menge bei JEDER Aenderung neu, egal woher sie kommt; ein gemerktes
   * `extra.currentDataSource` waere nach der naechsten Suche still veraltet.
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
          platzhalter="Fahrzeug oder Kennung suchen…"
        />
        <Trefferanzeige gezeigt={angezeigt.length} gesamt={zeilen.length} />
        <NeuFahrzeug />
      </Flex>

      <Datentabelle<FahrzeugAnzeigeZeile>
        rowKey="id"
        aria-label="Fahrzeuge"
        dataSource={gefiltert}
        onChange={(_seite, filter) => setSpaltenFilter(filter)}
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
