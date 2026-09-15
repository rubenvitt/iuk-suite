/**
 * Was eine Tabelle nach Spaltenfiltern und Sortierung WIRKLICH zeigt — als
 * reine Funktion.
 *
 * ⚠️ WARUM DAS NICHT ÜBER `onChange` GEHT, obwohl antd dort
 * `extra.currentDataSource` anbietet: `onChange` feuert nur bei BEDIENUNG DER
 * TABELLE. Ändert sich die Datenquelle daneben — eine Freitextsuche über der
 * Tabelle, ein neu geladener Serverstand —, filtert antd zwar korrekt neu,
 * meldet das aber nicht. Ein daraus gemerkter Stand ist dann still veraltet,
 * und alles, was daran hängt (ein Export „mit der aktuell angezeigten Liste",
 * eine Trefferanzeige), zeigt eine Menge, die so nie auf dem Schirm stand.
 * Gemessen an der Artikeltabelle: Statusfilter setzen, dann suchen → die
 * Trefferanzeige blieb bei der Zahl von vor der Suche.
 *
 * Deshalb ist die angezeigte Menge hier ABGELEITET statt gemerkt. `onChange`
 * setzt nur noch den Zustand (welche Filter, welche Sortierung), und aus dem
 * Zustand folgt die Liste — bei jeder Änderung neu, egal woher sie kommt.
 *
 * Dass antd dieselben Prädikate danach noch einmal auf die schon gefilterte
 * Liste anwendet, ist unbedenklich: beide Schritte sind idempotent, und
 * `filteredValue`/`sortOrder` halten die Spaltenköpfe im selben Zustand.
 *
 * KEIN "use client" (Falle 6).
 */
import type { Key } from "react";

/** Was antd als Filterzustand durchreicht: je Spaltenschlüssel die Werte. */
export type FilterZustand = Record<string, (Key | boolean)[] | null>;

export type SortRichtung = "ascend" | "descend" | null | undefined;

export type SortZustand = {
  /** Schlüssel der sortierten Spalte (`key`, ersatzweise `dataIndex`). */
  spalte?: Key;
  richtung?: SortRichtung;
};

/** Was von einer Spalte für diese Rechnung zählt. */
export type AnzeigeSpalte<T> = {
  key?: Key;
  /**
   * ⚠️ ABSICHTLICH `unknown`, NICHT `Key | Key[]`. antds `DataIndex<T>` ist
   * weiter, als der Name vermuten laesst — es schliesst `null` ein UND den
   * Datensatztyp selbst. Jede engere Angabe hier machte eine echte
   * antd-Spaltenliste unzuweisbar, und der ganze Zweck dieses Typs ist, dass
   * der Aufrufer seine `columns` unveraendert hereinreicht. Verengt wird
   * stattdessen dort, wo es zaehlt: `spaltenSchluessel` prueft zur Laufzeit auf
   * Zeichenkette oder Zahl.
   */
  dataIndex?: unknown;
  /**
   * ⚠️ DER WERTTYP IST ABSICHTLICH WEIT. antds `ColumnType.onFilter` ist
   * `(value: React.Key | boolean, record: T) => boolean`; eine engere Signatur
   * hier (etwa `never`) machte eine echte antd-Spaltenliste UNZUWEISBAR, weil
   * Funktionsparameter gegenlaeufig geprueft werden. Der Aufrufer reicht seine
   * `columns` unveraendert herein — das ist der ganze Zweck.
   */
  onFilter?: (wert: Key | boolean, zeile: T) => boolean;
  sorter?: unknown;
  /** Die angebotenen Filterwerte. Vorhanden heißt: diese Spalte filtert. */
  filters?: unknown;
  /**
   * Der GESTEUERTE Filterstand der Spalte. `undefined` heißt nicht „kein
   * Filter", sondern „antd führt den Stand selbst" — der Unterschied ist der
   * ganze Grund für `filterAusSpalten`.
   */
  filteredValue?: (Key | boolean)[] | null;
};

/**
 * Der Schlüssel, unter dem antd eine Spalte in `onChange` meldet: `key`, sonst
 * `dataIndex`. Eine Spalte ohne beides kann nicht gefiltert werden — sie taucht
 * in keinem Filterzustand auf.
 */
export function spaltenSchluessel<T>(spalte: AnzeigeSpalte<T>): string | null {
  if (spalte.key !== undefined) return String(spalte.key);
  if (typeof spalte.dataIndex === "string" || typeof spalte.dataIndex === "number") {
    return String(spalte.dataIndex);
  }
  return null;
}

/**
 * Wendet die Spaltenfilter an.
 *
 * ⚠️ INNERHALB EINER SPALTE ODER, ZWISCHEN SPALTEN UND. Das ist antds eigene
 * Bedeutung (`useFilter/index.js`: `realKeys.some(...)` je Spalte, die Spalten
 * nacheinander) — zwei angekreuzte Zustände derselben Spalte erweitern die
 * Menge, zwei Spalten grenzen sie ein. Wer das hier anders rechnet, zeigt eine
 * andere Liste als die Tabelle daneben.
 */
export function wendeFilterAn<T>(
  zeilen: readonly T[],
  spalten: readonly AnzeigeSpalte<T>[],
  zustand: FilterZustand,
): T[] {
  let liste = [...zeilen];
  for (const spalte of spalten) {
    const schluessel = spaltenSchluessel(spalte);
    if (!schluessel || !spalte.onFilter) continue;
    const werte = zustand[schluessel];
    if (!werte || werte.length === 0) continue;
    const trifft = spalte.onFilter;
    liste = liste.filter((zeile) => werte.some((wert) => trifft(wert, zeile)));
  }
  return liste;
}

/**
 * Wendet die Sortierung an — stabil, und ohne die Eingabeliste zu verändern.
 *
 * ⚠️ NUR EIN `sorter`, DER EINE FUNKTION IST. antd erlaubt für `sorter` auch
 * `true` (serverseitig sortiert) oder ein Objekt mit `compare`. `true` heißt
 * ausdrücklich „nicht hier sortieren"; ein Objekt wird über `compare` gelesen.
 */
export function wendeSortierungAn<T>(
  zeilen: readonly T[],
  spalten: readonly AnzeigeSpalte<T>[],
  zustand: SortZustand,
): T[] {
  if (!zustand.spalte || !zustand.richtung) return [...zeilen];
  const spalte = spalten.find((s) => spaltenSchluessel(s) === String(zustand.spalte));
  const roh = spalte?.sorter;
  const vergleich = typeof roh === "function"
    ? roh as (a: T, b: T) => number
    : typeof roh === "object" && roh !== null && typeof (roh as { compare?: unknown }).compare === "function"
      ? (roh as { compare: (a: T, b: T) => number }).compare
      : null;
  if (!vergleich) return [...zeilen];
  const richtung = zustand.richtung === "descend" ? -1 : 1;
  return [...zeilen].sort((a, b) => vergleich(a, b) * richtung);
}

/** Filter und Sortierung in der Reihenfolge, in der antd sie anwendet. */
export function angezeigteZeilen<T>(
  zeilen: readonly T[],
  spalten: readonly AnzeigeSpalte<T>[],
  filter: FilterZustand,
  sortierung: SortZustand,
): T[] {
  return wendeSortierungAn(wendeFilterAn(zeilen, spalten, filter), spalten, sortierung);
}

/**
 * Ist überhaupt ein Spaltenfilter gesetzt?
 *
 * Steht hier und nicht fünfmal abgeschrieben in den Listen, weil die Antwort
 * über den LEERTEXT einer Tabelle entscheidet: „nichts angelegt" und „nichts
 * passt" sind zwei verschiedene Sätze, und der falsche davon lädt zum Anlegen
 * eines Datensatzes ein, den es längst gibt. antd meldet eine geleerte Spalte
 * als `null` und eine nie berührte gar nicht — beides heißt „kein Filter".
 */
export function filterAktiv(zustand: FilterZustand): boolean {
  return Object.values(zustand).some((werte) => (werte?.length ?? 0) > 0);
}

/**
 * Den Filterstand aus den SPALTEN selbst lesen, statt ihn übergeben zu lassen.
 *
 * ⚠️ WOZU, WENN ES `angezeigteZeilen` SCHON GIBT: dessen Aufrufer ist die
 * Liste, die den Zustand ohnehin hält. `core/tabelle` selbst hält ihn nicht —
 * es bekommt nur `columns` und `dataSource` und muss trotzdem wissen, wie viele
 * Zeilen die Tabelle zeigt (für `aria-rowcount`). In `filteredValue` steht
 * genau dieser Stand, und zwar derselbe, aus dem antd gleich selbst filtert.
 *
 * ⚠️ `unbekannt` IST DER EIGENTLICHE RÜCKGABEWERT. Eine Spalte, die `filters`
 * anbietet, aber kein `filteredValue` trägt, filtert UNGESTEUERT: antd führt
 * den Stand intern, und von außen ist er nicht zu sehen. Ihn als „kein Filter"
 * zu lesen ergäbe eine zu große Zahl — und zwar still, genau dann, wenn jemand
 * filtert. Wer das nicht unterscheidet, baut die Falle nach, die er schließen
 * wollte.
 */
export function filterAusSpalten<T>(
  spalten: readonly AnzeigeSpalte<T>[] | undefined,
): { zustand: FilterZustand; unbekannt: boolean } {
  const zustand: FilterZustand = {};
  let unbekannt = false;
  for (const spalte of spalten ?? []) {
    if (spalte.filters === undefined) continue;
    const schluessel = spaltenSchluessel(spalte);
    if (!schluessel) continue;
    if (spalte.filteredValue === undefined) {
      unbekannt = true;
      continue;
    }
    zustand[schluessel] = spalte.filteredValue;
  }
  return { zustand, unbekannt };
}

/**
 * Wie viele Zeilen die Tabelle zeigt — `null`, wenn es nicht zu wissen ist.
 *
 * ⚠️ SORTIERUNG WIRD NICHT ANGEWENDET, und das ist kein Vergessen: sie ändert
 * die Reihenfolge, nie die Anzahl. Der Filterlauf ist damit alles, was diese
 * Zahl kostet.
 *
 * ⚠️ `null` HEISST „NICHT ZU WISSEN" UND IST KEIN FEHLERFALL. Der Aufrufer
 * macht daraus die Angabe, die ARIA dafür vorsieht (`aria-rowcount={-1}`) —
 * „unbekannt viele" ist eine ehrliche Auskunft, eine zu große Zahl ist es
 * nicht.
 */
export function angezeigteAnzahl<T>(
  zeilen: readonly T[] | undefined,
  spalten: readonly AnzeigeSpalte<T>[] | undefined,
): number | null {
  if (!zeilen) return 0;
  const { zustand, unbekannt } = filterAusSpalten(spalten);
  if (unbekannt) return null;
  if (!filterAktiv(zustand)) return zeilen.length;
  return wendeFilterAn(zeilen, spalten ?? [], zustand).length;
}
