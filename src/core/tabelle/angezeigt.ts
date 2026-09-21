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
  /** Die angebotenen Filterwerte einer Spalte mit antds eigenem Filtermenü. */
  filters?: unknown;
  /** Ein selbst gebautes Filtermenü. antd hält die Spalte auch dann für filterbar. */
  filterDropdown?: unknown;
  /** Der Startwert eines UNGESTEUERTEN Filters — danach führt antd den Stand allein. */
  defaultFilteredValue?: unknown;
  /** Die Sortierung, mit der die Tabelle AUFSCHLÄGT. Danach führt antd den Stand allein. */
  defaultSortOrder?: SortRichtung;
  /** Unterspalten eines gruppierten Spaltenkopfes. Nur die Blätter filtern. */
  children?: readonly AnzeigeSpalte<T>[];
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
    liste = liste.filter((zeile) => werte.some((wert: Key | boolean) => trifft(wert, zeile)));
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
 * Wann antd eine Spalte für filterbar hält — WÖRTLICH nach seiner eigenen
 * Bedingung (`hooks/useFilter/index.js`, `collectFilterStates`):
 *
 *     column.filters || column.filterDropdown !== undefined || 'onFilter' in column
 *
 * ⚠️ NUR AUF `filters` ZU PRÜFEN IST ZU ENG, und zwar still. antds Muster für
 * ein SELBST GEBAUTES Filtermenü (`filterDropdown` mit `filteredValue` und
 * `onFilter`, ganz ohne `filters`-Liste) filtert genauso — es fiele durch und
 * die Zeilenzahl bliebe die ungefilterte, während weniger Zeilen dastehen.
 */
function istFilterbar<T>(spalte: AnzeigeSpalte<T>): boolean {
  return Boolean(spalte.filters) || spalte.filterDropdown !== undefined || "onFilter" in spalte;
}

/**
 * Kann eine UNGESTEUERTE Spalte überhaupt je einen Filter tragen?
 *
 * ⚠️ DIE FRAGE IST NICHT AKADEMISCH, SIE VERHINDERT EIN FALSCHES „UNBEKANNT".
 * `'onFilter' in column` allein macht für antd schon eine filterbare Spalte —
 * aber ohne `filters`, ohne `filterDropdown` und ohne `defaultFilteredValue`
 * gibt es weder eine Bedienung noch einen Startwert, der Stand bleibt leer und
 * es wird nie gefiltert. Würden wir solche Spalten als unbekannt zählen, stünde
 * an halb so vielen Tabellen „unbekannt viele" — eine Auskunft, die schlechter
 * ist als die richtige Zahl, die wir haben.
 */
function kannUngesteuertFiltern<T>(spalte: AnzeigeSpalte<T>): boolean {
  return Boolean(spalte.filters)
    || spalte.filterDropdown !== undefined
    || spalte.defaultFilteredValue !== undefined;
}

/**
 * Die BLÄTTER einer Spaltenliste — ein gruppierter Spaltenkopf ist keine Spalte,
 * sondern eine Klammer um welche.
 *
 * ⚠️ WER NUR DIE OBERSTE EBENE LIEST, ÜBERSIEHT JEDEN FILTER IN EINER GRUPPE,
 * und zwar still: die Gruppe selbst trägt weder `filters` noch `onFilter`, also
 * sieht es aus wie „diese Tabelle filtert nicht". antd sammelt die Filter
 * rekursiv ein und wendet sie an — die Zahl wäre die ungefilterte, die Zeilen
 * darunter die gefilterten. `breitenSumme` in `masse.ts` steigt aus demselben
 * Grund über `children` ab.
 */
export function blattSpalten<T>(
  spalten: readonly AnzeigeSpalte<T>[] | undefined,
): AnzeigeSpalte<T>[] {
  const blaetter: AnzeigeSpalte<T>[] = [];
  for (const spalte of spalten ?? []) {
    if (spalte.children && spalte.children.length > 0) {
      blaetter.push(...blattSpalten(spalte.children));
      continue;
    }
    blaetter.push(spalte);
  }
  return blaetter;
}

/**
 * Wie viele Zeilen die Tabelle zeigt — `null`, wenn es nicht zu wissen ist.
 *
 * ⚠️ HIER WIRD OHNE SPALTENSCHLÜSSEL GERECHNET, und das ist die Lehre aus einem
 * Fehlversuch. Naheliegend wäre, erst einen Filterzustand `{ schlüssel: werte }`
 * zu bauen und ihn durch `wendeFilterAn` zu schicken — denselben Weg, den
 * `angezeigteZeilen` geht. Der braucht den Schlüssel aber nur, WEIL sein
 * Aufrufer den Zustand getrennt von den Spalten hält. Hier steht beides
 * beieinander, und der Umweg über den Schlüssel bringt nichts als eine
 * zusätzliche Fehlerquelle: antds `getColumnKey` fällt auf eine POSITION zurück
 * (`util.js:9`), wenn eine Spalte weder `key` noch ein skalares `dataIndex`
 * trägt — eine Spalte, die nur rendert, oder eine mit verschachteltem
 * `dataIndex`. antd filtert damit weiter, eine schlüsselbasierte Rechnung
 * daneben verlöre den Filter still und meldete die ungefilterte Zahl.
 *
 * ⚠️ SORTIERUNG WIRD NICHT ANGEWANDT, und das ist kein Vergessen: sie ändert
 * die Reihenfolge, nie die Anzahl. Der Filterlauf ist alles, was diese Zahl
 * kostet.
 *
 * ⚠️ `null` HEISST „NICHT ZU WISSEN" UND IST KEIN FEHLERFALL. Eine filterbare
 * Spalte ohne `filteredValue` filtert UNGESTEUERT: antd führt den Stand intern,
 * und von außen ist er nicht zu sehen. Ihn als „kein Filter" zu lesen ergäbe
 * eine zu große Zahl — still, und genau dann, wenn jemand filtert. Der Aufrufer
 * macht aus `null` die Angabe, die ARIA dafür vorsieht (`aria-rowcount={-1}`);
 * „unbekannt viele" ist eine ehrliche Auskunft, eine zu große Zahl nicht.
 *
 * ⚠️ „OHNE `filteredValue`" HEISST `!("filteredValue" in spalte)`, NICHT
 * `=== undefined` — antds eigene Unterscheidung (`'filteredValue' in column`,
 * `useFilter/index.js`): eine Spalte, die das Feld ausdrücklich auf `undefined`
 * setzt, gilt als GESTEUERT mit leerem Stand und filtert dann nicht.
 */
export function angezeigteAnzahl<T>(
  zeilen: readonly T[] | undefined,
  spalten: readonly AnzeigeSpalte<T>[] | undefined,
): number | null {
  if (!zeilen) return 0;
  let liste: readonly T[] = zeilen;
  // Die BLÄTTER, nicht die oberste Ebene: ein gruppierter Spaltenkopf ist keine
  // Spalte, sondern eine Klammer um welche (s. `blattSpalten`).
  for (const spalte of blattSpalten(spalten)) {
    if (!istFilterbar(spalte)) continue;
    if (!("filteredValue" in spalte)) {
      if (kannUngesteuertFiltern(spalte)) return null;
      continue;
    }
    const werte = spalte.filteredValue;
    // Kein Wert gewählt, oder nichts zum Prüfen — antd filtert dann auch nicht
    // (`getFilterData`: `onFilter && filteredKeys && filteredKeys.length`).
    if (!werte || werte.length === 0 || !spalte.onFilter) continue;
    const trifft = spalte.onFilter;
    // Innerhalb einer Spalte ODER — antds `realKeys.some(...)`; die Spalten
    // nacheinander ergeben das UND. Wer das anders verknüpft, zählt eine andere
    // Menge als die Tabelle daneben zeigt.
    liste = liste.filter((zeile) => werte.some((wert: Key | boolean) => trifft(wert, zeile)));
  }
  return liste.length;
}

/**
 * Der Sortierstand, mit dem eine Tabelle AUFSCHLÄGT — aus `defaultSortOrder`.
 *
 * ⚠️ WER DIE SORTIERUNG STEUERT, MUSS SIE AUCH STARTEN. `defaultSortOrder` ist
 * antds Startwert für den Fall, dass NIEMAND von außen sortiert; sobald eine
 * Spalte ein `sortOrder` bekommt, ist sie gesteuert und der Startwert wird
 * schlicht ignoriert. Wer also `sortOrder` einhängt und diesen Wert nicht
 * ausliest, dreht jede Tabelle mit Anfangssortierung still auf „unsortiert" —
 * gemessen an sieben Tabellen dieser Suite, darunter die Schrankliste (nach
 * Name aufsteigend) und drei Protokolle (neueste zuerst). Kein Tor sieht das:
 * die Typen stimmen, es steht nur eine andere Reihenfolge da.
 *
 * ⚠️ DIE ERSTE GEWINNT. antd kann über mehrere Spalten sortieren
 * (`sorter.multiple`); dieser Zustand trägt eine. Zwei Startspalten sind in
 * dieser Suite nirgends vergeben — käme eine dazu, wäre hier die Stelle, an der
 * es auffällt, statt an einer falsch sortierten Liste.
 */
export function anfangsSortierung<T>(
  spalten: readonly AnzeigeSpalte<T>[] | undefined,
): SortZustand {
  for (const spalte of blattSpalten(spalten)) {
    if (!spalte.defaultSortOrder) continue;
    const schluessel = spaltenSchluessel(spalte);
    if (!schluessel) continue;
    return { spalte: schluessel, richtung: spalte.defaultSortOrder };
  }
  return {};
}
