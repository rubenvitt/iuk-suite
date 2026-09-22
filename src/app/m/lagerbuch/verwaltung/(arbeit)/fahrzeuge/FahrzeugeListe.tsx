"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Flex } from "antd";
import type { TableProps } from "antd";
import {
  Kartentabelle,
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
import { einheitenartLabel, type Einheitenart } from "../../../_lib/konstanten";
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
  /**
   * DRK-309 — Fahrzeug oder Tasche. `null` heisst „noch nicht zugeordnet" und
   * ist der ausdrueckliche Zwischenstand aus Migration 0010, kein Datenfehler;
   * die Begruendung steht an der Zeilenquelle (`lesepfade/fahrzeuge.ts`).
   */
  einheitenart: Einheitenart | null;
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
  /**
   * Wie viele Artikel des aktiven Solls eine Verfallsangabe tragen — und wie
   * viele es insgesamt sind. Begruendung, warum das kein `boolean` ist, steht
   * an der Quelle in `lesepfade/fahrzeuge.ts`.
   */
  verfallErfasst: number;
  verfallSollArtikel: number;
  letzterCheckText: string | null;
  /** ISO-Zeitstempel — allein fuer die Sortierung, nie angezeigt. */
  letzterCheckIso: string | null;
};

/**
 * SUCHFELDMENGE 2 VON 6: Name, Kennung — UND die Art (DRK-309).
 *
 * ⚠️ DIE ART GEHOERT IN DIE SUCHE, WEIL SIE JETZT IM NAMEN FEHLEN DARF. Solange
 * jede Einheit ein Fahrzeug war, trug der Name die Art mit („RTW 1", „MTW 1")
 * und „tasche" zu tippen war sinnlos. Eine „Sanitätstasche 1" heisst so, eine
 * „Rucksack Betreuung" nicht — und wer „tasche" sucht, meint die Art, nicht die
 * Schreibweise. Der Zwischenstand ist ueber sein Wort („nicht zugeordnet")
 * genauso auffindbar; dafuer gibt es daneben den Spaltenfilter.
 */
export function sucheTrifft(
  zeile: FahrzeugAnzeigeZeile,
  begriff: string,
): boolean {
  const suche = falte(begriff.trim());
  return suche === ""
    || falte(`${zeile.name} ${zeile.kennung ?? ""} ${einheitenartLabel(zeile.einheitenart)}`)
      .includes(suche);
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
   *
   * ⚠️ UND ER VERLANGT VOLLSTAENDIGKEIT. „Keine auffaellige Meldung" ist noch
   * keine Entwarnung, solange die Haelfte des Solls nie angesehen wurde
   * (Reviewbefund zu DRK-298) — die Begruendung steht an `verfallErfasst`.
   */
  { wert: "verfallRuhig", text: "im grünen Bereich",
    trifft: (zeile) => vollstaendig(zeile)
      && zeile.verfallAbgelaufen === 0 && zeile.verfallWarnend === 0 },
  /**
   * ⚠️ „NICHT VOLLSTAENDIG", NICHT „NICHTS": der haeufigere und stillere Fall
   * ist das halb gepflegte Fahrzeug, nicht das gar nicht gepflegte. Ein Filter
   * nur auf „nichts erfasst" fande genau die Fahrzeuge NICHT, bei denen der
   * Irrtum am teuersten ist.
   */
  { wert: "verfallLuecke", text: "nicht vollständig erfasst",
    trifft: (zeile) => zeile.verfallSollArtikel > 0
      && zeile.verfallErfasst < zeile.verfallSollArtikel },
]);

/**
 * Traegt JEDER Artikel des aktiven Solls eine Angabe?
 *
 * ⚠️ `verfallSollArtikel === 0` IST NICHT VOLLSTAENDIG. Ein Fahrzeug ohne Soll
 * hat nichts zu erfassen und verdient keine Entwarnung — „null von null" waere
 * rechnerisch vollstaendig und fachlich eine Aussage ueber nichts.
 */
function vollstaendig(zeile: FahrzeugAnzeigeZeile): boolean {
  return zeile.verfallSollArtikel > 0
    && zeile.verfallErfasst === zeile.verfallSollArtikel;
}

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

/**
 * DRK-309 — die Art als Spaltenfilter, MIT dem Zwischenstand als drittem Wert.
 *
 * ⚠️ „nicht zugeordnet" IST DER EIGENTLICHE GRUND FUER DIESEN FILTER. Fahrzeug
 * und Tasche findet man auch ueber die Suche; die Liste der Einheiten, an denen
 * die Zuordnung noch fehlt, findet man sonst gar nicht — sie sind ueber die
 * ganze Tabelle verstreut und tragen kein gemeinsames Wort im Namen. Genau die
 * Liste braucht, wer den Zwischenstand aus Migration 0010 abarbeiten will.
 *
 * ⚠️ UND ER IST KEIN VIERTER WERT DER ART. Der Filter fragt nach der
 * ABWESENHEIT eines Wertes; `EINHEITENARTEN` kennt ihn deshalb nicht
 * (Begruendung dort).
 */
const ART_FILTER = zustandsFilter<FahrzeugAnzeigeZeile>([
  { wert: "fahrzeug", text: "Fahrzeug",
    trifft: (zeile) => zeile.einheitenart === "fahrzeug" },
  { wert: "tasche", text: "Tasche",
    trifft: (zeile) => zeile.einheitenart === "tasche" },
  { wert: "offen", text: "nicht zugeordnet",
    trifft: (zeile) => zeile.einheitenart === null },
]);

const STATUS_FILTER = zustandsFilter<FahrzeugAnzeigeZeile>([
  { wert: "aktiv", text: "aktiv", trifft: (zeile) => zeile.aktiv },
  { wert: "inaktiv", text: "inaktiv", trifft: (zeile) => !zeile.aktiv },
]);

function spalten(
  zeilen: FahrzeugAnzeigeZeile[],
): NonNullable<TableProps<FahrzeugAnzeigeZeile>["columns"]> {
  return [
    {
      title: "Einheit",
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
      /**
       * ⚠️ DIE ART STEHT DIREKT NEBEN DEM NAMEN, nicht hinten bei den
       * Kennzahlen. Sie beantwortet „was ist das hier ueberhaupt?" — die
       * Frage, die man VOR „wie voll ist es?" stellt. Am rechten Rand gelesen
       * kaeme die Antwort nach der Entscheidung.
       *
       * ⚠️ CHIP MIT TEXT, nicht nur ein Zeichen. Die Regel des Moduls steht in
       * `_ui/Chip.tsx`: jeder Chip traegt Text, das Zeichen ist `aria-hidden`
       * und Zugabe. Ein Taschen- neben einem Lastwagensymbol waere auf
       * Zeilenhoehe zwei aehnlich grosse graue Flecken.
       */
      title: "Art",
      dataIndex: "einheitenart",
      key: "art",
      sorter: nachText<FahrzeugAnzeigeZeile>(
        (zeile) => einheitenartLabel(zeile.einheitenart)),
      filters: ART_FILTER.filters,
      onFilter: ART_FILTER.onFilter,
      render: (wert: Einheitenart | null) => wert === null ? (
        /*
         * GRAU, NICHT GELB. Der Zwischenstand ist erlaubt (Migration 0010
         * backfillt bewusst nicht) — ein Warnton auf jeder Altzeile mahnte
         * jeden Tag zu etwas, das niemand versprochen hat, und entwertete das
         * Gelb daneben in der Verfallsspalte, wo es fachlich etwas heisst
         * (Falle 3, `docs/design/README.md`).
         */
        <Chip ton="grau">{einheitenartLabel(null)}</Chip>
      ) : (
        <Chip ton="grau" zeichen={wert}>{einheitenartLabel(wert)}</Chip>
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
       * ⚠️ UND DIE LEERFAELLE SIND NICHT DERSELBE. „Jeder Soll-Artikel
       * angesehen, nichts faellig" ist eine Entwarnung; „3 von 8 erfasst" ist
       * eine Wissensluecke. Beides als „—" zu zeigen behauptet Entwarnung fuer
       * ein Fahrzeug, von dem niemand weiss, was drin liegt — und das halb
       * gepflegte ist der haeufigere Fall, weil der Check das Verfallsdatum
       * freiwillig abfragt (Reviewbefund zu DRK-298).
       */
      render: (_wert: number, zeile) => {
        /**
         * ⚠️ DIE ERFASSUNGSLUECKE STEHT NEBEN DER WARNUNG, NICHT STATT IHRER.
         *
         * Sie beantworten verschiedene Fragen — „was ist faellig?" und „wovon
         * wissen wir es ueberhaupt?" —, und die eine darf die andere nicht
         * verdecken. Ein Fahrzeug mit EINEM abgelaufenen und SIEBEN nie
         * angesehenen Artikeln meldete sonst „1 abgelaufen" und sonst nichts:
         * wer danach handelt, tauscht einen Artikel und haelt das Fahrzeug fuer
         * erledigt. Derselbe stille Irrtum wie beim Boolean davor, nur eine
         * Ebene tiefer.
         */
        const chips = [
          zeile.verfallAbgelaufen > 0 ? (
            <Chip key="abgelaufen" ton="rot" zeichen="warnung">
              {zeile.verfallAbgelaufen} abgelaufen
            </Chip>
          ) : null,
          zeile.verfallWarnend > 0 ? (
            <Chip key="warnend" ton="gelb" zeichen="verfall">
              {zeile.verfallWarnend} läuft ab
            </Chip>
          ) : null,
          zeile.verfallSollArtikel > 0 && !vollstaendig(zeile) ? (
            <Chip key="luecke" ton="grau">
              {zeile.verfallErfasst} von {zeile.verfallSollArtikel} erfasst
            </Chip>
          ) : null,
        ].filter(Boolean);

        if (chips.length === 0) {
          // Nichts faellig UND nichts offen. Ohne Soll gibt es dagegen nichts
          // zu erfassen — und damit auch keine Entwarnung zu geben.
          return zeile.verfallSollArtikel === 0
            ? <span style={SCHRIFT.neben}>—</span>
            : <Chip ton="ok">im grünen Bereich</Chip>;
        }
        // 6 liegt nicht auf der SPACE-Skala (4/8/12/16/24/32) — enger
        // Chip-Zeilenabstand wie in der Statusspalte daneben.
        return <Flex gap={6} wrap>{chips}</Flex>;
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
          platzhalter="Einheit, Kennung oder Art suchen…"
        />
        <Trefferanzeige gezeigt={angezeigt.length} gesamt={zeilen.length} />
        <NeuFahrzeug />
      </Flex>

      <Kartentabelle<FahrzeugAnzeigeZeile>
        rowKey="id"
        aria-label="Fahrzeuge und Taschen"
        dataSource={gefiltert}
        filter={spaltenFilter}
        onFilter={setSpaltenFilter}
        leer={{
          nichts: "Noch keine Fahrzeuge und Taschen. Lege oben die erste Einheit an.",
          gefiltert: "Keine Einheit passt zu Suche und Filter.",
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
