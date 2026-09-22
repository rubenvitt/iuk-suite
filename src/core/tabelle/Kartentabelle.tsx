"use client";

/**
 * EINE TABELLE, DIE AUF DEM TELEFON EINE KARTENLISTE IST — ohne dass der
 * Aufrufer eine zweite Darstellung schreibt (DRK-451).
 *
 * ⚠️ WARUM ES SIE NEBEN `Schmalkarten` GIBT, UND WARUM SIE SIE NICHT ERSETZT.
 * `Schmalkarten` (DRK-421) ist der RAHMEN: zwei Darstellungen im HTML, CSS
 * schaltet. Es überlässt dem Aufrufer, was auf einer Karte steht — richtig für
 * die Inventur, deren Karte einen Zähl-Stepper über die volle Breite trägt und
 * deren Chargen einzeln aufklappen. Für die anderen vierzig Tabellen dieser
 * Suite ist es zu viel verlangt: dort steht auf der Karte genau das, was in der
 * Zeile stand, nur untereinander. `Kartentabelle` leitet das aus den Spalten ab
 * (`kartenaufbau.ts`) und bringt mit, was DRK-421 zweimal einzeln nachgebaut
 * hat — Filterzustand, Sortierzustand, die Leiste, die es ohne Spaltenköpfe
 * sonst nicht gibt, und zwei Leertexte.
 *
 * Wer eine Karte braucht, die mehr ist als ihre Zeile, nimmt weiter
 * `Schmalkarten` unmittelbar. Beide benutzen denselben Rahmen, also auch
 * dieselbe Media Query — es gibt weiterhin einen Breakpoint.
 *
 * ⚠️ SIE FÜHRT FILTER UND SORTIERUNG, UND DAS IST KEINE BEQUEMLICHKEIT.
 * Die Leiste über den Karten muss in DENSELBEN Zustand schreiben wie die
 * Spaltenköpfe, sonst zeigen die beiden Darstellungen verschiedene Mengen und
 * ein Wechsel der Fenstergröße ändert still, was dasteht. Dafür müssen die
 * Spalten GESTEUERT filtern (`filteredValue`) — ungesteuert führt antd den
 * Stand allein, und von außen ist er weder zu lesen noch zu setzen. Das hier
 * einmal zu verdrahten ist der Unterschied zwischen „zwei Tabellen umgestellt"
 * und „alle".
 *
 * ⚠️ DER ZUSTAND IST NACH AUSSEN ZU ÜBERNEHMEN, und dafür gibt es einen
 * belegten Bedarf statt einer Vermutung: die Artikelliste exportiert „die
 * aktuell angezeigte Liste" und braucht die abgeleitete Menge deshalb selbst.
 * Wer `onFilter`/`onSortierung` übergibt, führt den Zustand; ohne sie führt ihn
 * diese Komponente. Ein Aufrufer, der beides mischt, bekäme zwei Wahrheiten —
 * deshalb entscheidet ein einzelnes Merkmal (`onFilter`), nicht ein Feld je
 * Fall.
 */

import { useCallback, useEffect, useMemo, useState, type Key, type ReactNode } from "react";
import type { TableProps } from "antd";
import { Datentabelle, type DatentabelleProps } from "./Datentabelle";
import { Schmalkarten } from "./Schmalkarten";
import { Schmalsteuerung } from "./Schmalsteuerung";
import { Spaltenkarte, kartenName } from "./Spaltenkarte";
import {
  anfangsSortierung,
  angezeigteZeilen,
  blattSpalten,
  filterAktiv,
  spaltenSchluessel,
  type FilterZustand,
  type SortZustand,
} from "./angezeigt";
import { kartenaufbau, schluesselAus, type KartenSpalte, type Kartenwunsch } from "./kartenaufbau";

export type KartentabelleProps<T> = Omit<DatentabelleProps<T>, "aria-label" | "locale"> & {
  /** Der Name der Liste für Hilfstechnik — an BEIDEN Darstellungen derselbe. */
  "aria-label": string;
  /**
   * ⚠️ PFLICHT, anders als an antds `Table`. Eine Karte ohne stabilen Schlüssel
   * bekäme beim Filtern den Zustand einer fremden Zeile (Begründung bei
   * `schluesselAus`).
   */
  rowKey: string | ((zeile: T, index?: number) => Key);
  /**
   * Die zwei Sätze, die ein leerer Bildschirm braucht. „Nichts angelegt" und
   * „nichts passt" sind verschiedene Auskünfte, und der falsche davon lädt zum
   * Anlegen eines Datensatzes ein, den es längst gibt.
   */
  leer: {
    nichts: ReactNode;
    gefiltert?: ReactNode;
    /**
     * Wer entscheidet, ob gerade gefiltert wird — der Aufrufer statt dieses
     * Bauteils. Ohne Angabe zählen allein die Spaltenfilter.
     *
     * ⚠️ ES ÜBERSCHREIBT, ES ERGÄNZT NICHT. Das ist der Unterschied, an dem
     * die erste Fassung gescheitert ist: als ODER geschrieben konnte der Wink
     * den gefilterten Satz nur EINSCHALTEN, nie ausschalten — und genau das
     * braucht der `uav`-Katalog. Dort bleibt der Spaltenfilter stehen, wenn die
     * letzte Aufgabe darunter GELÖSCHT wird; „nichts passt zum Filter"
     * behauptete dann einen Bestand, den es nicht mehr gibt, genau vor der
     * Person, die jetzt die erste neue Aufgabe anlegen soll.
     *
     * Die zwei Fälle, für die es gedacht ist, sind damit beide abgedeckt: eine
     * Suche ÜBER der Tabelle, die dieses Bauteil nicht sieht (dann `true`
     * dazu), und ein Filterstand, der ins Leere zeigt (dann `false`).
     */
    aktiv?: boolean;
  };
  /** Wie die Karte aufgebaut wird — oder die Karte selbst, fertig gebaut. */
  karte?: Kartenwunsch | ((zeile: T, index: number) => ReactNode);
  /** Geschätzte Kartenhöhe für den Platzhalter der übersprungenen Karten. */
  kartenHoehe?: number;
  /** Ab wie vielen Zeilen die Filter- und Sortierleiste erscheint. */
  steuerungAbZeilen?: number;
  /** Übernommener Filterzustand. Nur zusammen mit `onFilter`. */
  filter?: FilterZustand;
  onFilter?: (filter: FilterZustand) => void;
  sortierung?: SortZustand;
  onSortierung?: (sortierung: SortZustand) => void;
};

/**
 * Steuert die Spalten: `filteredValue` und `sortOrder` aus dem Zustand.
 *
 * ⚠️ REKURSIV ÜBER `children`, NICHT ÜBER DIE OBERSTE EBENE. Ein gruppierter
 * Spaltenkopf ist eine Klammer um Spalten; wer nur oben ersetzt, lässt jeden
 * Filter in einer Gruppe ungesteuert — und der ist dann auf dem Telefon nicht
 * erreichbar, ohne dass irgendetwas rot wird.
 *
 * ⚠️ EIN VOM AUFRUFER GESETZTES `filteredValue`/`sortOrder` BLEIBT STEHEN.
 * Zwei Steuernde an derselben Spalte ergäben ein Feld, das auf die eigene
 * Bedienung nicht reagiert.
 */
function gesteuert<T>(
  spalten: readonly KartenSpalte<T>[] | undefined,
  filter: FilterZustand,
  sortierung: SortZustand,
): KartenSpalte<T>[] | undefined {
  if (!spalten) return undefined;
  return spalten.map((spalte) => {
    if (spalte.children && spalte.children.length > 0) {
      return { ...spalte, children: gesteuert(spalte.children, filter, sortierung) };
    }
    const schluessel = spaltenSchluessel(spalte);
    if (!schluessel) return spalte;
    const neu = { ...spalte } as KartenSpalte<T> & {
      filteredValue?: (Key | boolean)[] | null;
      sortOrder?: "ascend" | "descend" | null;
    };
    if (Array.isArray(spalte.filters) && !("filteredValue" in spalte)) {
      neu.filteredValue = filter[schluessel] ?? null;
    }
    if (spalte.sorter !== undefined && !("sortOrder" in spalte)) {
      neu.sortOrder = String(sortierung.spalte) === schluessel
        ? (sortierung.richtung ?? null)
        : null;
    }
    return neu;
  });
}

/**
 * Stabile Leerwerte für den nicht übernommenen Fall.
 *
 * ⚠️ EIN `?? {}` IM RUMPF WÄRE JEDES MAL EIN NEUES OBJEKT — und damit eine neue
 * Abhängigkeit für jedes `useMemo` darunter: die Spaltenliste, die abgeleitete
 * Zeilenliste und der Kartenaufbau entstünden bei JEDEM Render neu, an der
 * Artikelliste also über achthundert Zeilen lang. Genau darauf zeigt auch
 * `react-hooks/exhaustive-deps` („could make the dependencies change on every
 * render"). Eine Konstante hat eine feste Identität und kostet nichts.
 */
const LEERER_FILTER: FilterZustand = {};
const LEERE_SORTIERUNG: SortZustand = {};

export function Kartentabelle<T extends object>({
  "aria-label": beschriftung,
  rowKey,
  leer,
  karte,
  kartenHoehe = 160,
  steuerungAbZeilen,
  columns,
  dataSource,
  onChange,
  filter: filterVonAussen,
  onFilter,
  sortierung: sortierungVonAussen,
  onSortierung,
  ...rest
}: KartentabelleProps<T>) {
  const [eigenerFilter, setEigenerFilter] = useState<FilterZustand>({});
  /**
   * ⚠️ DER STARTWERT KOMMT AUS `defaultSortOrder`, und ohne ihn drehte diese
   * Komponente jede Tabelle mit Anfangssortierung still auf „unsortiert" —
   * Begründung bei `anfangsSortierung`. Er wird EINMAL gelesen: `useState`
   * wertet die Funktion nur beim ersten Render aus, und das ist richtig, denn
   * danach gehört der Stand der Bedienung.
   */
  const [eigeneSortierung, setEigeneSortierung] = useState<SortZustand>(
    () => anfangsSortierung(columns as readonly KartenSpalte<T>[] | undefined),
  );

  const uebernommen = onFilter !== undefined;
  const filter = (uebernommen ? filterVonAussen : eigenerFilter) ?? LEERER_FILTER;
  const sortierung = (onSortierung !== undefined ? sortierungVonAussen : eigeneSortierung)
    ?? LEERE_SORTIERUNG;

  const setzeFilter = useCallback((neu: FilterZustand) => {
    if (onFilter) onFilter(neu);
    else setEigenerFilter(neu);
  }, [onFilter]);
  const setzeSortierung = useCallback((neu: SortZustand) => {
    if (onSortierung) onSortierung(neu);
    else setEigeneSortierung(neu);
  }, [onSortierung]);

  const spalten = useMemo(
    () => gesteuert(columns as readonly KartenSpalte<T>[] | undefined, filter, sortierung),
    [columns, filter, sortierung],
  );
  const blaetter = useMemo(() => blattSpalten(spalten ?? []) as KartenSpalte<T>[], [spalten]);

  const aufbau = useMemo(
    () => kartenaufbau(blaetter, typeof karte === "function" ? {} : karte),
    [blaetter, karte],
  );

  /**
   * ⚠️ EIN FILTER OHNE SCHLÜSSEL IST DER EINE FALL, IN DEM DIE BEIDEN
   * DARSTELLUNGEN AUSEINANDERLAUFEN — und er ist still. antd filtert eine
   * solche Spalte weiter (es fällt intern auf die POSITION als Schlüssel
   * zurück), `angezeigteZeilen` kann sie nicht zuordnen und lässt sie aus: die
   * Tabelle zeigt dann weniger Zeilen als die Karten daneben. Abhilfe ist ein
   * `key` an der Spalte, und laut ist besser als still.
   */
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (aufbau.hinweis) console.warn(`[Kartentabelle] ${beschriftung}: ${aufbau.hinweis}`);
    for (const spalte of blaetter) {
      if (Array.isArray(spalte.filters) && !spaltenSchluessel(spalte)) {
        console.warn(
          `[Kartentabelle] ${beschriftung}: eine filterbare Spalte hat weder `
          + "`key` noch skalares `dataIndex` — sie filtert in der Tabelle, aber "
          + "nicht in der Kartenliste.",
        );
      }
    }
  }, [aufbau.hinweis, blaetter, beschriftung]);

  const zeilen = useMemo(() => (dataSource ?? []) as readonly T[], [dataSource]);
  /**
   * Die Liste, die WIRKLICH auf dem Schirm steht — abgeleitet, nie gemerkt
   * (Falle 15). antd wendet dieselben Prädikate danach noch einmal auf die
   * Tabelle an; beide Schritte sind idempotent.
   */
  const sichtbar = useMemo(
    () => angezeigteZeilen(zeilen, blaetter, filter, sortierung),
    [zeilen, blaetter, filter, sortierung],
  );

  const schluessel = useMemo(() => schluesselAus<T>(rowKey), [rowKey]);

  /**
   * Die Position einer Zeile in der ANGEZEIGTEN Liste — `render` bekommt sie
   * als dritten Wert, und `rowKey` darf sie ebenfalls lesen.
   *
   * ⚠️ EINE `Map` UND KEIN `indexOf` JE KARTE. `Schmalkarten` reicht nur die
   * Zeile durch; die Position daraus zu suchen wäre je Karte ein Durchlauf der
   * ganzen Liste, also quadratisch — bei 800 Artikeln rund 640 000 Vergleiche
   * bei JEDEM Render, auf dem schwächsten Gerät. Einmal aufgebaut kostet
   * dasselbe einen Durchlauf.
   */
  const position = useMemo(() => {
    const karte = new Map<T, number>();
    sichtbar.forEach((zeile, index) => karte.set(zeile, index));
    return karte;
  }, [sichtbar]);

  // `??`, NICHT `||` — die Begründung steht ausführlich bei `leer.aktiv`.
  const gefiltert = leer.aktiv ?? filterAktiv(filter);
  const leertext = gefiltert ? (leer.gefiltert ?? leer.nichts) : leer.nichts;

  const auswahl = rest.rowSelection;
  const gewaehlte = useMemo(
    () => new Set((auswahl?.selectedRowKeys ?? []).map(String)),
    [auswahl?.selectedRowKeys],
  );

  const karteBauen = useCallback((zeile: T, index: number): ReactNode => {
    if (typeof karte === "function") return karte(zeile, index);
    const eigen = schluessel(zeile, index);
    const klick = rest.onRow?.(zeile, index)?.onClick;
    return (
      <Spaltenkarte<T>
        aufbau={aufbau}
        zeile={zeile}
        index={index}
        name={kartenName(aufbau, zeile, index, eigen)}
        onKlick={klick as ((e: React.MouseEvent<HTMLElement>) => void) | undefined}
        auswahl={auswahl ? {
          gewaehlt: gewaehlte.has(String(eigen)),
          /*
           * ⚠️ DIE AUSWAHL WIRD AUS DEM BISHERIGEN STAND FORTGESCHRIEBEN, nicht
           * ersetzt. antds `onChange` meldet die GANZE Auswahl; ein Aufrufer mit
           * `preserveSelectedRowKeys` erwartet, dass ein Kreuzchen auf einer
           * gefilterten Karte die Auswahl außerhalb des Filters nicht wegwirft.
           */
          onWechsel: (an) => {
            const naechste = new Set((auswahl.selectedRowKeys ?? []).map(String));
            if (an) naechste.add(String(eigen));
            else naechste.delete(String(eigen));
            const liste = [...naechste];
            auswahl.onChange?.(
              liste,
              zeilen.filter((z, i) => naechste.has(String(schluessel(z, i)))),
              { type: "all" },
            );
          },
        } : undefined}
      />
    );
  }, [karte, aufbau, schluessel, auswahl, gewaehlte, zeilen, rest]);

  return (
    <>
      <Schmalsteuerung<T>
        spalten={blaetter}
        filter={filter}
        onFilter={setzeFilter}
        sortierung={sortierung}
        onSortierung={setzeSortierung}
        angezeigt={sichtbar.length}
        gesamt={zeilen.length}
        abZeilen={steuerungAbZeilen}
      />
      <Schmalkarten<T>
        zeilen={sichtbar}
        schluessel={(zeile) => schluessel(zeile, position.get(zeile) ?? 0)}
        aria-label={beschriftung}
        leertext={leertext}
        kartenHoehe={kartenHoehe}
        karte={(zeile) => karteBauen(zeile, position.get(zeile) ?? 0)}
      >
        <Datentabelle<T>
          {...rest}
          aria-label={beschriftung}
          rowKey={rowKey}
          dataSource={dataSource}
          columns={spalten as TableProps<T>["columns"]}
          locale={{ emptyText: leertext }}
          // NUR der Zustand wird gemerkt, nie die Liste (Falle 15).
          onChange={(blaettern, neueFilter, neueSortierung, extra) => {
            setzeFilter(neueFilter as FilterZustand);
            const eine = Array.isArray(neueSortierung) ? neueSortierung[0] : neueSortierung;
            setzeSortierung({
              spalte: eine?.columnKey ?? (eine?.field as string | undefined),
              richtung: eine?.order ?? null,
            });
            onChange?.(blaettern, neueFilter, neueSortierung, extra);
          }}
        />
      </Schmalkarten>
    </>
  );
}
