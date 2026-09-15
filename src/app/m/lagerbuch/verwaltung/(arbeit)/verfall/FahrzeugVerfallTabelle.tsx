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
import { Flex, Segmented } from "antd";
import type { TableProps } from "antd";
import type { ColumnFilterItem } from "antd/es/table/interface";
import {
  Datentabelle,
  type FilterZustand,
  nachText,
  useEntprellt,
  wendeFilterAn,
  zustandsFilter,
} from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import type { AmpelTon } from "../../../_lib/format";
import { einheitenartLabel, type Einheitenart } from "../../../_lib/konstanten";
import { SCHRIFT } from "../../../_lib/schrift";
import { falte } from "../../../_lib/suche";
import { Chip } from "../../../_ui/Chip";
import { Suchfeld } from "../../../_ui/Suchfeld";
import { Trefferanzeige } from "../../../_ui/Trefferanzeige";
import { gruppiereNachFahrzeug, type FahrzeugGruppe } from "./gruppierung";

export type FahrzeugVerfallZeile = {
  /** `${lagerortId}:${artikelId}` — je Paar gibt es hoechstens eine Meldung. */
  schluessel: string;
  fahrzeugId: string;
  fahrzeugName: string;
  fahrzeugKennung: string | null;
  /**
   * DRK-309 — Fahrzeug oder Tasche. ⚠️ Eine Tasche traegt KEINE Kennung, und
   * die Kennung war hier die einzige Angabe neben dem Namen: ohne die Art
   * stand fuer sie nur ein Name, zwischen zwei aehnlich benannten Einheiten
   * nicht zu unterscheiden.
   */
  fahrzeugEinheitenart: Einheitenart | null;
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

/**
 * SUCHFELDMENGE: Einheit, Kennung, ART und Artikel — was auf der Zeile steht.
 *
 * ⚠️ DIE ART GEHOERT DAZU, WEIL SIE IM NAMEN FEHLEN DARF (DRK-309). „tasche"
 * fand sonst nur Einheiten, die das Wort zufaellig im Namen tragen.
 */
export function sucheTrifft(zeile: FahrzeugVerfallZeile, begriff: string): boolean {
  const suche = falte(begriff.trim());
  return suche === ""
    || falte([
      zeile.fahrzeugName,
      zeile.fahrzeugKennung,
      einheitenartLabel(zeile.fahrzeugEinheitenart),
      zeile.artikelName,
    ].filter(Boolean).join(" ")).includes(suche);
}

/**
 * ⚠️ ZWEI ZUSTAENDE, UND DER ZWEITE IST NICHT „alles andere". Die Liste enthaelt
 * ohnehin nur Auffaelliges (der Lesepfad filtert gruen heraus), „läuft ab"
 * heisst hier also „warnend, aber noch nicht abgelaufen". Ohne das Gegenstueck
 * liesse sich „zeig mir nur, was noch Zeit hat" gar nicht anklicken.
 */
const SAMMLER = new Intl.Collator("de", { numeric: true, sensitivity: "base" });

/**
 * Die vorkommenden Fahrzeuge als Filterliste — ueber die ID, beschriftet mit
 * Name und Kennung.
 *
 * ⚠️ NICHT `werteAlsFilter(… fahrzeugName)`, UND DAS IST KEIN STILWUNSCH
 * (Reviewbefund zu DRK-298). `lagerorte.name` traegt KEINEN Unique-Index, und
 * `createFahrzeug` prueft auf Eindeutigkeit nicht — zwei „MTW" sind erlaubt und
 * kommen in einer gewachsenen Flotte vor. Filtert die Spalte ueber den NAMEN,
 * laesst ein Klick auf „MTW" die Meldungen BEIDER Fahrzeuge stehen, und das
 * gemeinte laesst sich ueber diese Spalte gar nicht isolieren — also genau das
 * nicht, wofuer die Spalte da ist.
 *
 * Die Kennung steht in der Beschriftung, damit zwei gleichnamige Fahrzeuge im
 * Menue unterscheidbar sind.
 *
 * ⚠️ UND WO AUCH DIE KENNUNG NICHT TRENNT, TRENNT DIE ID. Gleicher Name UND
 * keine (oder dieselbe) Kennung ist erlaubt — das Schema verlangt weder das
 * eine noch das andere. Stuenden dann zwei identisch beschriftete Eintraege im
 * Menue, filterte ein Klick zwar korrekt auf EIN Fahrzeug, aber der Benutzer
 * erfaehrt nicht, auf welches: er liest die Meldungen des einen im Glauben,
 * die des anderen zu sehen. Die ID ist haesslich und taucht nur in genau
 * diesem Fall auf — ehrlicher als zwei gleiche Zeilen.
 */
function fahrzeugFilter(zeilen: readonly FahrzeugVerfallZeile[]): ColumnFilterItem[] {
  const gesehen = new Map<string, string>();
  for (const zeile of zeilen) {
    if (gesehen.has(zeile.fahrzeugId)) continue;
    gesehen.set(
      zeile.fahrzeugId,
      // DRK-309: Die Art steht in der Beschriftung, damit zwei gleich
      // benannte Einheiten auch ohne Kennung unterscheidbar bleiben.
      [zeile.fahrzeugName, zeile.fahrzeugKennung
        ?? einheitenartLabel(zeile.fahrzeugEinheitenart)].join(" · "),
    );
  }
  // Erst zaehlen, dann entscheiden: nur die WIRKLICH doppelten Beschriftungen
  // bekommen die ID angehaengt, nicht jede Zeile vorsorglich.
  const haeufigkeit = new Map<string, number>();
  for (const text of gesehen.values()) {
    haeufigkeit.set(text, (haeufigkeit.get(text) ?? 0) + 1);
  }
  return [...gesehen]
    .map(([value, text]) => ({
      text: (haeufigkeit.get(text) ?? 0) > 1 ? `${text} · ${value}` : text,
      value,
    }))
    .sort((a, b) => SAMMLER.compare(a.text, b.text));
}

const STATUS_FILTER = zustandsFilter<FahrzeugVerfallZeile>([
  { wert: "abgelaufen", text: "abgelaufen", trifft: (zeile) => zeile.abgelaufen },
  { wert: "laeuftAb", text: "läuft ab", trifft: (zeile) => !zeile.abgelaufen },
]);

/**
 * Was in der Tabelle stehen kann: eine Meldung — oder, im Gruppenmodus, eine
 * Fahrzeugzeile mit ihren Meldungen als `children`.
 */
export type Baumzeile = FahrzeugVerfallZeile | FahrzeugGruppe;

/**
 * ⚠️ UEBER `children` UND NICHT UEBER EIN FELD WIE `istGruppe`. Das Feld traegt
 * rc-table ohnehin (es macht daraus die Baumzeilen), ein zweites Kennzeichen
 * daneben koennte davon abweichen — und die Zelle zeigte dann das Falsche,
 * waehrend der Baum richtig aufklappt.
 */
function istGruppe(zeile: Baumzeile): zeile is FahrzeugGruppe {
  return "children" in zeile;
}

function spalten(
  zeilen: FahrzeugVerfallZeile[],
): NonNullable<TableProps<FahrzeugVerfallZeile>["columns"]> {
  return [
    {
      title: "Einheit",
      dataIndex: "fahrzeugName",
      key: "fahrzeug",
      sorter: nachText<FahrzeugVerfallZeile>((zeile) => zeile.fahrzeugName),
      // Die Filterliste entsteht aus den DATEN — es steht also nie ein
      // Fahrzeug im Menue, das keine Meldung hat.
      filters: fahrzeugFilter(zeilen),
      onFilter: (wert, zeile) => zeile.fahrzeugId === wert,
      render: (name: string, zeile) => (
        <span>
          <Link
            href={`/verwaltung/fahrzeuge/${zeile.fahrzeugId}`}
            style={{ fontWeight: 600 }}
          >
            {name}
          </Link>
          {/*
            DRK-309: Kennung, wo es eine gibt — sonst die Art. Eine Tasche
            traegt kein Kennzeichen, und eine Zeile, die nur einen Namen
            zeigt, laesst offen, wovon sie spricht.
          */}
          <span style={{ ...SCHRIFT.neben, marginInlineStart: SPACE.sm }}>
            {zeile.fahrzeugKennung
              ? <span style={SCHRIFT.mono}>{zeile.fahrzeugKennung}</span>
              : einheitenartLabel(zeile.fahrzeugEinheitenart)}
          </span>
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

/**
 * Die Spalten des Gruppenmodus.
 *
 * ⚠️ DIE PRAEDIKATE SIND HIER ABGESCHALTET (`onFilter: () => true`), UND DAS IST
 * KEIN VERSEHEN. Gefiltert wird VOR dem Falten, ueber die flachen Zeilen —
 * antd duerfte sonst ein zweites Mal filtern, diesmal ueber die ELTERNzeilen,
 * und deren Felder bedeuten etwas anderes: `abgelaufen` ist auf einer Meldung
 * ein `boolean`, auf einer Fahrzeugzeile eine ANZAHL. Der Statusfilter
 * verwuerfe damit jede Gruppe. Die Menues bleiben bedienbar, weil `filters` und
 * `onChange` stehen bleiben — nur das Filtern selbst macht diese Komponente.
 */
function gruppenSpalten(
  zeilen: FahrzeugVerfallZeile[],
): NonNullable<TableProps<Baumzeile>["columns"]> {
  const flach = spalten(zeilen) as NonNullable<TableProps<Baumzeile>["columns"]>;
  return flach.map((spalte, i) => {
    const ohneFilter = { ...spalte, onFilter: () => true };
    if (i !== 0) return ohneFilter;
    return {
      ...ohneFilter,
      title: "Einheit / Artikel",
      // ⛔ KEIN SORTIERER AUF DER ERSTEN SPALTE IM GRUPPENMODUS. Die Reihenfolge
      // der Fahrzeuge traegt hier eine AUSSAGE — Abgelaufenes zuerst
      // (`gruppierung.ts`) —, und zugeklappt ist sie das Einzige, was man sieht.
      // Ein Vergleicher im Spaltenkopf verspraeche stattdessen das Alphabet und
      // stellte das dringendste Fahrzeug irgendwohin.
      sorter: undefined,
      render: (_wert: unknown, zeile: Baumzeile) => {
        if (!istGruppe(zeile)) {
          return <span>{zeile.artikelName}</span>;
        }
        return (
          <Flex gap={6} wrap align="center">
            <span style={{ fontWeight: 600 }}>{zeile.fahrzeugName}</span>
            {zeile.fahrzeugKennung
              ? <span style={SCHRIFT.mono}>{zeile.fahrzeugKennung}</span>
              : <span style={SCHRIFT.neben}>
                  {einheitenartLabel(zeile.fahrzeugEinheitenart)}
                </span>}
            {zeile.abgelaufen > 0 ? (
              <Chip ton="rot" zeichen="warnung">{zeile.abgelaufen} abgelaufen</Chip>
            ) : null}
            {zeile.warnend > 0 ? (
              <Chip ton="gelb" zeichen="verfall">{zeile.warnend} läuft ab</Chip>
            ) : null}
          </Flex>
        );
      },
    };
  });
}

/**
 * ⚠️ DIE GRUPPENZEILE TRAEGT KEINEN LINK AUFS FAHRZEUGBLATT, obwohl die flache
 * Ansicht einen hat. Ein Anker in der Zeile, die auch das Auf- und Zuklappen
 * ausloest, ist eine Falle: ein Klick daneben navigiert weg, statt zu oeffnen.
 * Der Weg zum Fahrzeug steht in den Kindzeilen — und in der Fahrzeugliste.
 */
const ANSICHTEN = [
  { value: "liste", label: "Liste" },
  { value: "gruppiert", label: "nach Einheit" },
] as const;

type Ansicht = (typeof ANSICHTEN)[number]["value"];

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
  /**
   * ⚠️ DIE ANSICHT LEBT IN DER INSEL, NICHT IN DER URL — wie Suche und Filter
   * daneben auch. Ein URL-Parameter waere der einzige im Modul und muesste
   * ueberall mitgetragen werden, wo auf diese Seite verlinkt wird. Der Preis
   * ist bekannt und abgestimmt: beim naechsten Aufruf steht wieder „Liste".
   */
  const [ansicht, setAnsicht] = useState<Ansicht>("liste");
  /**
   * ⚠️ GEMERKT WIRD, WAS ZUGEKLAPPT IST — nicht, was offen ist.
   *
   * `expandable.defaultExpandAllRows` sieht danach aus, als taete es dasselbe,
   * und tut es nicht: es wird beim ERSTEN Rendern ausgewertet. Eine Gruppe, die
   * erst nach einer Sucheingabe entsteht, kaeme danach ZUGEKLAPPT auf den
   * Schirm — man sucht etwas und bekommt eine Zeile, die verschweigt, was man
   * gesucht hat. (Gemessen: im echten Abruf stand die Fahrzeugzeile da, ihre
   * Meldung fehlte im DOM.)
   *
   * Aus der Negativliste folgt beides richtig: neue Gruppen sind offen, und
   * was jemand zuklappt, bleibt zu.
   */
  const [zugeklappt, setZugeklappt] = useState<ReadonlySet<string>>(new Set());

  const gefiltert = useMemo(
    () => zeilen.filter((zeile) => sucheTrifft(zeile, sucheNachlauf)),
    [zeilen, sucheNachlauf],
  );
  const spaltenliste = useMemo(() => spalten(zeilen), [zeilen]);
  const angezeigt = wendeFilterAn(gefiltert, spaltenliste, spaltenFilter);

  const gruppiert = ansicht === "gruppiert";
  /**
   * ⚠️ GEFALTET WIRD `angezeigt`, NICHT `gefiltert`. Die Faltung kommt NACH
   * Suche UND Spaltenfilter — ein Fahrzeug, dessen Meldungen alle weggefiltert
   * sind, entsteht dadurch gar nicht erst, statt als leere Elternzeile stehen
   * zu bleiben, die behauptet, es gaebe dort etwas.
   */
  const gruppen = useMemo(
    () => (gruppiert ? gruppiereNachFahrzeug(angezeigt) : []),
    // `angezeigt` entsteht bei jedem Rendern neu; die Faltung haengt an seinem
    // INHALT, und der folgt aus diesen dreien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gruppiert, gefiltert, spaltenFilter],
  );
  const gruppenSpaltenliste = useMemo(() => gruppenSpalten(zeilen), [zeilen]);

  return (
    <>
      <Flex gap={SPACE.md} wrap align="center" style={{ marginBlockEnd: SPACE.md }}>
        <Suchfeld
          wert={suche}
          onWert={setSuche}
          platzhalter="Einheit, Kennung, Art oder Artikel suchen…"
        />
        <Segmented<Ansicht>
          options={[...ANSICHTEN]}
          value={ansicht}
          onChange={setAnsicht}
          aria-label="Darstellung"
        />
        <Trefferanzeige gezeigt={angezeigt.length} gesamt={zeilen.length} />
      </Flex>

      {gruppiert ? (
        <Datentabelle<Baumzeile>
          rowKey="schluessel"
          aria-label="Verfallsmeldungen nach Einheit"
          dataSource={gruppen}
          onChange={(_seite, filter) => setSpaltenFilter(filter)}
          locale={{ emptyText: "Keine Meldung passt zu Suche und Filter." }}
          columns={gruppenSpaltenliste}
          expandable={{
            expandedRowKeys: gruppen
              .map((gruppe) => gruppe.schluessel)
              .filter((schluessel) => !zugeklappt.has(schluessel)),
            onExpand: (offen, zeile) => setZugeklappt((bisher) => {
              const naechste = new Set(bisher);
              if (offen) naechste.delete(zeile.schluessel);
              else naechste.add(zeile.schluessel);
              return naechste;
            }),
          }}
        />
      ) : (
        <Datentabelle<FahrzeugVerfallZeile>
          rowKey="schluessel"
          aria-label="Verfallsmeldungen aus Einheiten"
          dataSource={gefiltert}
          onChange={(_seite, filter) => setSpaltenFilter(filter)}
          locale={{ emptyText: "Keine Meldung passt zu Suche und Filter." }}
          columns={spaltenliste}
        />
      )}
    </>
  );
}
